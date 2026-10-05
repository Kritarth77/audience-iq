# AudienceIQ: Technical Architecture & Research Report
**Smart India Hackathon 2026 Submission**

## Executive Summary

While our presentation slides cover the high-level impact and business viability of AudienceIQ, this document details the engineering choices, architectural pivots, deployment decisions, and underlying research that power the platform. AudienceIQ is a live Brand Intelligence dashboard designed to monitor brand and topic conversations, analyze sentiment in an Indian linguistic context, and present the resulting intelligence through an accessible, enterprise-oriented interface.

The final MVP combines a React/Vite frontend deployed globally through Vercel, a FastAPI backend and PostgreSQL database deployed on Render, Reddit Search RSS ingestion, and Hugging Face-powered sentiment analysis. The architecture is intentionally lean for a 36-hour hackathon while preserving clear extension paths for compliant, authenticated social-platform integrations and government-grade deployment.

## 1. Data Ingestion: Hybrid Live RSS Ingestion & Invincible Fallback

Modern social platforms have substantially fortified their perimeters against unauthenticated automation. This required us to design an ingestion layer that could use live public data when available while remaining resilient during a high-visibility demonstration.

**The Challenge:**

During initial development, conventional asynchronous JSON requests and standard Python HTTP clients received `403 Forbidden` responses from Reddit’s anti-bot controls. Outdated or unofficial client approaches were not reliable enough for a deployed MVP, particularly when requests originated from a cloud-hosted server IP.

**Hybrid Live RSS Ingestion:**

AudienceIQ now searches Reddit’s public Search RSS feed for the user-selected brand or keyword. The scraper uses Python’s standard `urllib.request` and `xml.etree.ElementTree` libraries, which keeps the ingestion path lightweight and minimizes unnecessary dependencies. Requests include a browser User-Agent header so the traffic is represented as a conventional browser request rather than an unidentified Python client.

The feed is queried in real time using the selected keyword and normalized into a consistent post structure containing the title, body text, author, timestamp, permalink, and source identifier. Reddit RSS does not expose reliable upvote counts, so the MVP assigns bounded demonstration engagement values where necessary to keep the analytics and visualization layers representative. The normalized records are then passed into the same processing and persistence path used by every sync.

**Invincible Fallback:**

If Reddit temporarily blocks the deployed server IP, applies an anti-bot challenge, times out, or returns no usable entries during a live demo, the backend does not expose a broken or empty dashboard. Instead, it dynamically generates five to eight context-rich, brand-specific payloads using the requested keyword. These fallback records include realistic positive, negative, neutral, and discussion-oriented examples and are routed through the actual Hugging Face sentiment pipeline before being stored.

This hybrid strategy preserves the integrity of the end-to-end demonstration: the platform uses real-time live ingestion whenever the source is available, while the Invincible Fallback keeps the deployed experience operational under transient upstream restrictions. It guarantees a zero-downtime presentation without bypassing the analytics, AI, database, or frontend layers.

**The Enterprise Roadmap (OAuth2):**

For production-scale deployments, the architecture is designed to integrate official OAuth2 and platform-approved API workflows. Registering the backend as an official developer application would provide compliant authentication, documented quotas, stronger metadata guarantees, and continuous data streaming into the database. The RSS implementation is therefore an MVP ingestion adapter rather than a replacement for official enterprise access.

## 2. The AI & NLP Core: Conquering the Language Gap

Standard western NLP models often struggle with Indian social data, which is heavily code-mixed, multilingual, and filled with localized slang. AudienceIQ’s processing layer is designed around this reality.

*   **IndicNLP-oriented processing:** We leveraged research from AI4Bharat and IIT Madras around Indic language representation, including IndicBERT-family approaches and multilingual sentiment modeling. The backend encapsulates this behavior in `IndicNLPEngine`, which provides a stable sentiment contract to the rest of the application.
*   **Offloading compute:** Running transformer inference locally can exceed the memory and latency budget of standard development machines and small cloud instances. AudienceIQ offloads sentiment inference to the Hugging Face Inference API, allowing the MVP backend to remain lightweight while still using a production-style model-serving boundary.
*   **Normalized sentiment contract:** The engine maps model responses into the dashboard’s three business-facing categories: `Positive`, `Negative`, and `Neutral`. It also handles missing credentials, timeouts, rate limits, malformed responses, and upstream errors through controlled fallback behavior.
*   **Bounded concurrency:** During bulk processing, a bounded asynchronous semaphore prevents the backend from overwhelming the inference service or exhausting local resources. This keeps batch analysis predictable and allows the API to process multiple posts safely.
*   **One AI path for every ingestion source:** Both live Reddit RSS records and Invincible Fallback records are processed through the same live sentiment engine. The fallback is not a static frontend mock and does not bypass AI processing; it exists specifically to prove that the Hugging Face analysis, database persistence, and dashboard refresh operate correctly regardless of temporary upstream availability.

## 3. Backend & State Management

Our backend abandons heavy enterprise infrastructure such as Kafka and Redis for the MVP in favor of a lean, observable stack that is appropriate for rapid iteration and a focused analytical workload.

*   **FastAPI & ASGI:** FastAPI exposes the health, analysis, synchronization, and overview endpoints. Running under Uvicorn as an ASGI application allows the service to handle concurrent HTTP requests while moving blocking RSS and database work away from the event loop where appropriate.
*   **SQLAlchemy & PostgreSQL:** SQLAlchemy provides the ORM and query layer for the `StructuredPost` model. PostgreSQL stores the normalized text, platform and post identifiers, topic, sentiment label, engagement, reach, demographic group, and publication timestamp. Aggregation queries power the metric cards, sentiment donut, performance chart, trending mentions, and network response.
*   **Topic-specific state replacement:** A successful manual sync prepares and analyzes the new batch before clearing the existing `structured_posts` rows. This ensures a new search topic produces a clean dashboard rather than mixing unrelated historical mentions with the current brand.
*   **Explicit error handling:** Empty or blocked Reddit responses are converted into the fallback path. Database and inference failures are handled explicitly and logged without exposing connection details or silently returning a success-shaped response.
*   **Fully deployed MVP infrastructure:** The FastAPI service and PostgreSQL database are deployed and hosted on Render’s cloud infrastructure. This gives the Vercel frontend a persistent production API rather than a local-only development service, while retaining a simple operational model suitable for the hackathon MVP.

## 4. Frontend Engineering: Visualizing Scale

The frontend is implemented in React and Vite with a dark glassmorphism visual system tailored to the supplied AudienceIQ references. It provides a responsive analytics shell, live sync controls, chart interactions, loading states, error toasts, and a clear separation between brand tracking and future workspace features.

*   **Canvas-Based Influence Network:** The dashboard uses `react-force-graph-2d` for an interactive custom **2-tier Hub and Spoke Influence Network**. The selected dashboard topic is represented by an `Audience Topic` hub, while individual mention nodes connect directly to it. Custom Canvas rendering draws the luminous hub, teal mention nodes, and labels without creating thousands of DOM elements.
*   **Custom D3 physics:** `d3-force` charge, collision, and link forces keep the hub and mentions separated while preserving smooth dragging, zooming, panning, and responsive interaction. The graph remains dynamic rather than freezing nodes into a fixed layout.
*   **Analytics visualization:** Inline SVG renders the reach and engagement performance chart with dynamic scaling, padded time ranges, sparse-data safeguards, and hover values. Additional cards render normalized sentiment, trending brand mentions, modeled demographics, and aggregate KPI metrics from the backend response.
*   **Manual Sync Live Data trigger:** The primary refresh mechanism is an explicit `Sync Live Data` action. A user enters a custom keyword, the frontend sends it to the deployed FastAPI service, and the backend fetches fresh Reddit data, runs AI sentiment analysis, persists the new topic dataset, and returns a success response. The frontend then re-fetches the overview payload and rebuilds the dashboard.
*   **Global deployment:** The production frontend is deployed globally through Vercel. The architecture supports Vercel’s deployment and preview model while the Render-hosted API remains the source of truth for ingestion, AI processing, and persistence.

## 5. Security & Deployment Rollout

The architecture is container-ready and designed for a future B2G (Business-to-Government) rollout with stronger controls than the hackathon MVP requires.

*   **Data sovereignty roadmap:** By packaging the FastAPI and PostgreSQL stack through Docker, the platform can be deployed on-premise on secure National Informatics Centre (NIC) infrastructure or private state-police clouds. A controlled deployment would keep sensitive government tracking metrics within the relevant organization’s boundary.
*   **Official integration roadmap:** Production deployments should use authenticated, platform-approved APIs, secrets management, audit logging, request quotas, source attribution, and clear retention policies. Reddit RSS and the demonstration fallback are MVP ingestion choices, not a substitute for formal platform agreements.
*   **Scalability:** As the platform scales nationally, the architecture can evolve toward regional database partitioning or sharding, read replicas for analytical queries, background job queues for ingestion, and separate write-heavy collection services.
*   **MVP deployment networking:** FastAPI uses a robust wildcard `CORSMiddleware` configuration with `allow_origins=["*"]`, wildcard methods and headers, and `allow_credentials=False`. This deliberately supports Vercel’s dynamic preview environments and serverless-origin variations without requiring a new backend release for every generated deployment URL. The MVP does not rely on cookie-based authentication, making disabled credentials appropriate for this public demo architecture.
*   **Deployment topology:** The current public topology is:

    ```text
    Vercel-hosted React frontend
                 │
                 │ HTTPS API requests with custom keyword
                 ▼
    Render-hosted FastAPI service
                 │
                 ├── Reddit Search RSS / Invincible Fallback
                 ├── Hugging Face Inference API
                 └── Render-hosted PostgreSQL
    ```

This separation allows the frontend to scale independently from the API and database while keeping a clear path toward private networking, authenticated integrations, and on-premise B2G deployment.
