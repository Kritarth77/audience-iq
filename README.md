# AudienceIQ Dashboard

AudienceIQ is a live Brand Intelligence dashboard for monitoring how brands and custom topics are discussed across Reddit. It combines a React/Vite analytics interface, a FastAPI/PostgreSQL backend, Reddit Search RSS ingestion, and Hugging Face sentiment analysis into a focused hackathon-ready product.

The interface follows the supplied visual direction: dark teal/black surfaces, glassmorphism panels, luminous accent colors, compact analytics typography, responsive layouts, and interactive data visualizations.

## Project Context & Capabilities

AudienceIQ helps a team understand:

- Overall brand sentiment across fresh Reddit mentions.
- Reach, engagements, engagement rate, and post volume.
- Performance trends grouped by month.
- Trending brand mentions ordered by reach.
- Brand/topic discussion networks.
- Demonstration audience demographics.

### Live Brand Intelligence workflow

1. A user enters any keyword or brand in the `Track a brand...` field.
2. The React frontend sends the keyword to `POST /api/sync-live-data`.
3. The FastAPI backend searches Reddit’s Search RSS feed for that keyword.
4. Scraped posts are normalized, assigned realistic engagement metadata where RSS does not expose votes, and analyzed by `IndicNLPEngine`.
5. `IndicNLPEngine` sends title/body text to the Hugging Face Inference API and normalizes the result to `Positive`, `Negative`, or `Neutral`.
6. The selected topic’s previous database rows are replaced with the newly fetched topic dataset.
7. The frontend re-fetches `/analytics/overview` and redraws metrics, sentiment, trends, demographics, trending mentions, and the influence network.

The keyword is optional. When no custom keyword is supplied, the backend selects one of the configured demonstration brands: Zomato, Reliance Jio, Tata Motors, Flipkart, or Air India.

## Current Capabilities

### Dashboard shell

- Responsive Vite/React application with desktop, tablet, and mobile layouts.
- Dark glassmorphism visual system with teal, purple, pink, gold, and blue accents.
- Sidebar navigation with prototype-state feedback for unfinished workspaces.
- Clickable AudienceIQ logo with hard refresh behavior.
- Dynamic local-time greeting for Admin.
- Dynamic uppercase current-date display.
- Native print-to-PDF action through the Create report button.
- Search filtering for trending brand mentions.
- Toast notifications for actions and API failures.

### Live analytics

- Immediate analytics fetch when the dashboard mounts.
- Automatic `/analytics/overview` polling every 15 seconds.
- Manual Sync Live Data flow with staged progress labels.
- Custom keyword input passed to the backend.
- Backend error details displayed in the frontend toast.
- Automatic dashboard refresh after a successful sync.

### Data visualizations

- Performance overview SVG area chart with Reach and Engagement series.
- Dynamic chart scaling based on the actual raw database values.
- `7D`, `30D`, `90D`, and `1Y` range controls with padded monthly periods.
- Sparse-data handling that avoids invalid SVG coordinates and displays a clear empty state.
- Overall Brand Sentiment donut and positive-sentiment indicator.
- Trending Brand Mentions list backed by live `top_posts` data.
- Audience demographics horizontal bars using probabilistic baseline distributions for demonstration.
- Interactive two-tier Hub and Spoke Influence Network built with `react-force-graph-2d`.
- Custom canvas node rendering, responsive sizing, node hitboxes, dragging, zoom, pan, D3 charge/link/collision physics, and directional particles.

## Architecture

```text
React/Vite frontend
        │
        │  GET /analytics/overview
        │  POST /api/sync-live-data { keyword }
        ▼
FastAPI backend
        │
        ├── Reddit Search RSS ingestion
        ├── IndicNLPEngine → Hugging Face Inference API
        └── SQLAlchemy session
                │
                ▼
          PostgreSQL structured_posts
```

## Technology Stack

### Frontend

- **React 18** — application state, effects, event handlers, and component rendering.
- **Vite 5** — development server and production bundling.
- **Plain JSX and CSS** — compact component implementation and the dark glassmorphism design system.
- **react-force-graph-2d** — interactive Influence Network rendering.
- **d3-force** — charge, link, and collision forces for the network layout.
- **Inline SVG** — performance chart lines, areas, grid lines, labels, and hover points.
- **Canvas 2D API** — custom network node circles, glow rings, and labels.

### Backend

- **FastAPI** — asynchronous HTTP API and CORS-enabled frontend bridge.
- **Pydantic** — request and response validation, including the optional sync keyword model.
- **SQLAlchemy 2** — ORM model and PostgreSQL queries.
- **Psycopg 3** — PostgreSQL driver.
- **PostgreSQL** — persistent storage for scraped posts, sentiment, reach, engagement, topic, demographic group, and timestamps.
- **Python `urllib.request`** — standard-library Reddit RSS requests.
- **Python `xml.etree.ElementTree`** — Atom/RSS parsing.
- **HTTPX** — asynchronous Hugging Face API requests in `IndicNLPEngine`.
- **python-dotenv** — path-safe loading of backend environment configuration.
- **Hugging Face Inference API** — multilingual sentiment classification through the configured model.

## Data Access & Ingestion

The application uses real social-platform ingestion through Reddit Search RSS rather than local mock analytics data. RSS is used as a lightweight bypass strategy for Reddit API restrictions and rate-limit behavior; the scraper searches:

```text
https://www.reddit.com/search.rss?q={keyword}&sort=new
```

The scraper normalizes each entry into a consistent post shape containing an ID, title, text, author, timestamp, URL, permalink, and vote metadata. Because RSS does not expose reliable upvote counts, the demo sync path assigns a bounded realistic score for visualization purposes.

The scraper is implemented in [backend/scrape.py](./backend/scrape.py). The CSV path remains available for batch ingestion through [backend/ingest_csv.py](./backend/ingest_csv.py).

## FastAPI Backend

The backend is implemented in [backend/main.py](./backend/main.py).

### Run the backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

Configure the database and Hugging Face credentials in `backend/.env` or the process environment. Important variables include:

```env
DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/audienceiq
HUGGINGFACE_API_KEY=your_token_here
```

### Endpoints

#### `GET /health`

Returns a service health response:

```json
{ "status": "ok" }
```

#### `GET /analytics/overview`

Reads PostgreSQL through SQLAlchemy and returns:

- `metrics`
- `sentiment`
- `demographics`
- `performance`
- `monthly_trends`
- `top_posts`
- `network`

#### `POST /api/sync-live-data`

Accepts a Pydantic request body:

```json
{ "keyword": "Zomato" }
```

The `keyword` is optional. Blank or omitted values use the configured fallback brand list. A successful request searches Reddit, analyzes the returned posts, replaces the current topic dataset, and returns inserted/total row counts. Empty searches and scraper failures return explicit HTTP errors that the frontend displays.

#### `POST /api/analyze`

Accepts:

```json
{ "text": "Bhai yeh product ekdum bakwaas hai" }
```

Returns normalized sentiment and confidence from `IndicNLPEngine`.

## Database Model

`StructuredPost` stores the processed analytics record:

- `id`
- `platform`
- `post_id`
- `text`
- `sentiment_label`
- `engagement_count`
- `reach`
- `topic`
- `demographic_group`
- `created_at`

The overview endpoint aggregates these fields into the dashboard response. Monthly performance is grouped by `created_at`, sentiment is grouped by `sentiment_label`, and the influence network is built from topic/brand aggregates.

## Audience Demographics

Reddit RSS does not provide user age or other demographic PII, and the product does not attempt to infer or scrape restricted personal data. For the MVP presentation, the demographics chart uses a clearly modeled probabilistic baseline distribution:

```json
[
  { "label": "18-24", "percentage": 25 },
  { "label": "25-34", "percentage": 45 },
  { "label": "35-44", "percentage": 20 },
  { "label": "45+", "percentage": 10 }
]
```

Newly ingested records also receive a demonstration demographic group so the database schema remains ready for a future licensed or first-party demographic source.

## Frontend Data Boundary

[src/api/analytics.js](./src/api/analytics.js) provides the frontend API adapter. The frontend reads:

```env
VITE_API_URL=http://localhost:8000
```

The adapter exposes `fetchAnalytics()` and `syncLiveData(keyword)`. It propagates backend error details so an empty Reddit search or failed sync is visible to the user rather than silently appearing as a successful refresh.

## Project Structure

```text
work/
├── backend/
│   ├── main.py
│   ├── scrape.py
│   ├── nlp_engine.py
│   ├── ingest_csv.py
│   ├── ingest_test_data.py
│   ├── requirements.txt
│   └── .env.example
├── src/
│   ├── main.jsx
│   ├── styles.css
│   ├── api/
│   │   └── analytics.js
│   └── components/
│       └── InfluenceGraph.jsx
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## Frontend Development

### Requirements

- Node.js 18 or newer.
- npm.
- A running FastAPI service and PostgreSQL database for live analytics.

### Install and run

```bash
npm install
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`.

### Production build

```bash
npm run build
npm run preview
```

## Verification

The current workspace has been validated with:

```bash
python3 -m py_compile backend/main.py backend/scrape.py
npm run build
```

## Deployment Notes

For a static frontend host:

1. Install dependencies with `npm install`.
2. Configure `VITE_API_URL` to the deployed FastAPI origin.
3. Run `npm run build`.
4. Publish the generated `dist` directory.
5. Configure FastAPI CORS for the deployed frontend origin.
6. Provide PostgreSQL and Hugging Face environment variables to the backend.

The Reddit RSS strategy is appropriate for this hackathon MVP. Production deployments should evaluate Reddit’s current platform terms, official API access, authentication, caching, observability, and rate-limit requirements.

## Team

This project was collaboratively developed by:

- **Kritarth Bajpai**
- **Arekh Vikram**
- **Ayush Singh Rajput**
