"""AudienceIQ analytics API.

Run with:
    uvicorn backend.main:app --reload

The processing pipeline can insert rows into ``structured_posts``. This API
only reads the structured PostgreSQL data and exposes an overview payload for
the React dashboard.
"""

import os
import asyncio
import random
from collections.abc import Generator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool
from sqlalchemy import DateTime, Integer, String, Text, create_engine, delete, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

try:
    from .nlp_engine import IndicNLPEngine
    from .scrape import scrape_reddit_search
except ImportError:
    from nlp_engine import IndicNLPEngine
    from scrape import scrape_reddit_search


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/audienceiq",
)
CREATE_TABLES_ON_STARTUP = os.getenv("CREATE_TABLES_ON_STARTUP", "true").lower() in {
    "1",
    "true",
    "yes",
}

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class StructuredPost(Base):
    """One NLP-processed social post.

    ``reach`` and ``engagement_count`` are stored as integer totals produced
    by the ingestion/processing pipeline. Sentiment labels are title-cased so
    they map directly to the API response buckets.
    """

    __tablename__ = "structured_posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    platform: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    post_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    sentiment_label: Mapped[str] = mapped_column(
        String(16), nullable=False, index=True
    )
    engagement_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reach: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    topic: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, index=True
    )
    demographic_group: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )


class MetricValue(BaseModel):
    value: int | float
    change: float | None = None


class SentimentBucket(BaseModel):
    count: int
    percentage: float


class SentimentResponse(BaseModel):
    total_posts: int
    positive: SentimentBucket
    neutral: SentimentBucket
    negative: SentimentBucket


class DemographicRow(BaseModel):
    label: str
    percentage: float


class PerformancePoint(BaseModel):
    month: str
    reach: int
    engagements: int


class TopPost(BaseModel):
    text: str
    reach: int
    engagement_rate: float


class NetworkNode(BaseModel):
    id: str
    label: str
    group: str
    value: int
    reach: int


class NetworkLink(BaseModel):
    source: str
    target: str


class NetworkResponse(BaseModel):
    nodes: list[NetworkNode]
    links: list[NetworkLink]


class OverviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    metrics: dict[str, MetricValue]
    sentiment: SentimentResponse
    demographics: list[DemographicRow]
    performance: list[PerformancePoint]
    monthly_trends: list[PerformancePoint]
    top_posts: list[TopPost]
    network: NetworkResponse


class AnalyzeRequest(BaseModel):
    text: str


class SyncLiveDataRequest(BaseModel):
    keyword: str | None = None


DEMOGRAPHIC_DISTRIBUTION = [
    {"label": "18-24", "percentage": 25.0},
    {"label": "25-34", "percentage": 45.0},
    {"label": "35-44", "percentage": 20.0},
    {"label": "45+", "percentage": 10.0},
]


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if CREATE_TABLES_ON_STARTUP:
        Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="AudienceIQ Analytics API",
    version="0.1.0",
    lifespan=lifespan,
)
nlp = IndicNLPEngine()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://audienceiq-one.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def as_number(value: Any) -> int:
    """Convert SQL aggregate values, including Decimal, to JSON-safe integers."""

    return int(value or 0)


def percentage(count: int, total: int) -> float:
    return round((count / total) * 100, 2) if total else 0.0


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/analyze")
async def analyze_text(request: AnalyzeRequest) -> dict[str, str | float]:
    return await nlp.analyze_text(request.text)


@app.post("/api/sync-live-data")
async def sync_live_data(
    request: SyncLiveDataRequest,
    db: Session = Depends(get_db),
) -> dict[str, int | str]:
    """Fetch, analyze, and append recent brand mentions from Reddit."""

    keyword = (request.keyword or "").strip() or random.choice(
        ["Zomato", "Reliance Jio", "Tata Motors", "Flipkart", "Air India"]
    )
    try:
        scraped_posts = await run_in_threadpool(scrape_reddit_search, keyword, 100)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail="Reddit data could not be fetched",
        ) from exc

    if not scraped_posts:
        db.rollback()
        raise HTTPException(
            status_code=404,
            detail="Nothing can be fetched for this topic right now. Please search something else instead.",
        )

    candidate_posts = [
        post
        for post in scraped_posts
        if post.get("id")
        and (post.get("title") or "").strip()
        and (post.get("author") or "").strip()
    ]

    semaphore = asyncio.Semaphore(8)

    async def analyze_post(post: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str | float]]:
        async with semaphore:
            text = f"{post['title']}\n\n{post.get('text', '')}".strip()
            return post, await nlp.analyze_text(text)

    analyzed_posts = await asyncio.gather(
        *(analyze_post(post) for post in candidate_posts)
    )
    rows = []
    for post, analysis in analyzed_posts:
        post_id = post.get("id")
        title = (post.get("title") or "").strip()
        body = (post.get("text") or "").strip()
        post["upvotes"] = random.randint(100, 2000)

        try:
            created_at = datetime.fromtimestamp(
                float(post["created_utc"]), tz=timezone.utc
            )
        except (KeyError, TypeError, ValueError, OverflowError):
            created_at = datetime.now(timezone.utc)

        rows.append(
            StructuredPost(
                platform="reddit",
                post_id=post_id,
                text=f"{title}\n\n{body}" if body else title,
                sentiment_label=str(analysis["sentiment"]),
                engagement_count=random.randint(
                    max(1, post["upvotes"] // 10),
                    max(1, post["upvotes"] // 3),
                ),
                reach=post["upvotes"],
                topic=keyword,
                demographic_group=random.choice(
                    [item["label"] for item in DEMOGRAPHIC_DISTRIBUTION]
                ),
                created_at=created_at,
            )
        )

    if not rows:
        db.rollback()
        raise HTTPException(
            status_code=404,
            detail="Reddit returned no usable posts",
        )

    try:
        db.execute(delete(StructuredPost))
        db.add_all(rows)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Live data could not be saved",
        ) from exc

    return {
        "status": "ok",
        "message": "Live data synced",
        "rows": len(rows),
        "total_rows": db.scalar(select(func.count(StructuredPost.id))) or 0,
    }


@app.get("/analytics/overview", response_model=OverviewResponse)
def analytics_overview(db: Session = Depends(get_db)) -> OverviewResponse:
    """Return aggregate metrics used by the AudienceIQ overview dashboard."""

    try:
        reach, engagements, total_posts = db.execute(
            select(
                func.coalesce(func.sum(StructuredPost.reach), 0),
                func.coalesce(func.sum(StructuredPost.engagement_count), 0),
                func.count(StructuredPost.id),
            )
        ).one()

        sentiment_rows = db.execute(
            select(
                func.lower(StructuredPost.sentiment_label),
                func.count(StructuredPost.id),
            ).group_by(func.lower(StructuredPost.sentiment_label))
        ).all()

        monthly_rows = db.execute(
            select(
                func.to_char(StructuredPost.created_at, "YYYY-MM").label("month"),
                func.coalesce(func.sum(StructuredPost.reach), 0).label("reach"),
                func.coalesce(
                    func.sum(StructuredPost.engagement_count), 0
                ).label("engagements"),
            )
            .group_by("month")
            .order_by("month")
        ).all()
        topic_rows = db.execute(
            select(
                StructuredPost.topic,
                func.count(StructuredPost.id).label("post_count"),
                func.coalesce(func.sum(StructuredPost.reach), 0).label("reach"),
            )
            .where(StructuredPost.topic.is_not(None))
            .group_by(StructuredPost.topic)
            .order_by(func.count(StructuredPost.id).desc())
            .limit(12)
        ).all()
        top_post_rows = db.execute(
            select(
                StructuredPost.text,
                StructuredPost.reach,
                StructuredPost.engagement_count,
            )
            .order_by(StructuredPost.reach.desc())
            .limit(4)
        ).all()
    except Exception as exc:
        # Keep database failures explicit to clients while avoiding internal
        # connection details in the response.
        raise HTTPException(
            status_code=503,
            detail="Analytics data is temporarily unavailable",
        ) from exc

    total_reach = as_number(reach)
    total_engagements = as_number(engagements)
    post_count = as_number(total_posts)
    sentiment_counts = {"positive": 0, "neutral": 0, "negative": 0}
    for label, count in sentiment_rows:
        normalized = str(label or "").strip().lower()
        if normalized in sentiment_counts:
            sentiment_counts[normalized] = as_number(count)

    engagement_rate = (
        round((total_engagements / total_reach) * 100, 2) if total_reach else 0.0
    )
    sentiment = SentimentResponse(
        total_posts=post_count,
        **{
            label: SentimentBucket(
                count=count,
                percentage=percentage(count, post_count),
            )
            for label, count in sentiment_counts.items()
        },
    )
    network_nodes = [
        NetworkNode(
            id="topic_center",
            label="Audience topics",
            group="topic",
            value=post_count,
            reach=total_reach,
        )
    ]
    network_links = []
    for index, row in enumerate(topic_rows):
        topic_id = f"topic_{index}"
        network_nodes.append(
            NetworkNode(
                id=topic_id,
                label=str(row.topic),
                group="topic",
                value=as_number(row.post_count),
                reach=as_number(row.reach),
            )
        )
        network_links.append(NetworkLink(source="topic_center", target=topic_id))
    network = NetworkResponse(nodes=network_nodes, links=network_links)
    performance = [
        PerformancePoint(
            month=str(row.month),
            reach=as_number(row.reach),
            engagements=as_number(row.engagements),
        )
        for row in monthly_rows
    ]
    top_posts = [
        TopPost(
            text=str(row.text),
            reach=as_number(row.reach),
            engagement_rate=round(
                (as_number(row.engagement_count) / as_number(row.reach)) * 100,
                2,
            ) if as_number(row.reach) else 0.0,
        )
        for row in top_post_rows
    ]

    return OverviewResponse(
        metrics={
            "total_reach": MetricValue(value=total_reach),
            "total_engagements": MetricValue(value=total_engagements),
            "engagement_rate": MetricValue(value=engagement_rate),
            "total_posts": MetricValue(value=post_count),
        },
        sentiment=sentiment,
        demographics=[
            DemographicRow(**item)
            for item in DEMOGRAPHIC_DISTRIBUTION
        ],
        performance=performance,
        monthly_trends=performance,
        top_posts=top_posts,
        network=network,
    )
