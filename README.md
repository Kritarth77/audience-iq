# AudienceIQ Dashboard

AudienceIQ is an interactive social-media analytics dashboard frontend based on the supplied visual references. The reference screens use a dark teal/black workspace, luminous glass surfaces, compact metric cards, audience insights, and data-dense visualizations. This workspace recreates that product direction as a runnable React application with local development data and a clear seam for a future FastAPI backend.

The current implementation is a focused dashboard experience rather than a finished production platform. It prioritizes the core overview flow, visual language, and demonstrated interaction patterns while keeping the code small enough to extend safely.

## Project Context

The product is intended to help a social-media team understand:

- Reach and engagement performance over time.
- Audience sentiment.
- The best-performing content.
- Audience age distribution.
- Workspace-level navigation between analytics areas.

The UI was built from the uploaded reference imagery. The references informed the visual treatment: near-black green backgrounds, teal and purple accents, thin low-contrast borders, soft glows, rounded glass panels, compact typography, and chart-heavy analytics views.

The frontend is designed to eventually consume a separately hosted FastAPI service. Until that service is available, the application uses realistic local data so that the interface remains useful and testable.

## Current Capabilities

### Application shell

- Runs as a Vite development server and produces a production build.
- Responsive sidebar navigation with active-state styling.
- AudienceIQ brand lockup and workspace switcher.
- Workspace menu with workspace and settings options.
- Header breadcrumb, search control, notification action, theme action, and create-report action.
- User profile area with Help center and Settings actions.
- Responsive layout adjustments for desktop, tablet, and mobile widths.
- Mobile sidebar collapse treatment and compact header controls.

### Overview dashboard

The default Overview page currently includes:

- Four metric cards:
  - Total reach.
  - Engagements.
  - Followers.
  - Engagement rate.
- Period selector tabs for `7D`, `30D`, `90D`, and `1Y`.
- Performance overview chart with Reach and Engagement series.
- Audience sentiment donut visualization.
- Positive-sentiment progress indicator.
- Top-performing-content list.
- Audience-demographics age bars.

### Interaction behavior

- Sidebar items update the active workspace view without a full-page reload.
- Audience, Content, Campaigns, and Reports navigation targets show their current workspace state.
- The `View all` content action navigates to the Content workspace state.
- The `Explore audience` action navigates to the Audience workspace state.
- Chart period tabs change the visible data range.
- SVG chart points respond to hover and display a tooltip containing month, reach, engagement, and click values.
- The top-content search field filters content rows as the user types.
- Workspace menu opens and closes from the workspace selector.
- Report, notification, theme, Help center, Settings, and content-row actions show feedback through a toast notification.
- Interactive controls use real React state rather than decorative dead buttons.

### API readiness

- `src/api/analytics.js` provides a small analytics data-access boundary.
- `VITE_API_URL` is read from environment configuration.
- When no API URL is configured, the UI continues to use local development data.
- When configured, the adapter requests `/analytics/overview` and raises an error for unsuccessful responses.

### Verification completed

- Dependencies were installed successfully.
- `npm run build` completed successfully with Vite.
- The local development server returned HTTP 200 at `http://localhost:5173`.
- The running page was opened in a browser and its rendered accessibility tree was inspected.

## Step-by-Step Implementation

### 1. Inspected the supplied references

The attached reference frames were reviewed to identify the recurring product patterns:

- A dark, atmospheric dashboard background.
- A left navigation rail and compact top header.
- Glass-like cards with thin teal borders.
- Teal, purple, gold, and pink data accents.
- A primary analytics chart with multiple series.
- Sentiment and demographic visualizations.
- Content-performance rows.
- Dense but restrained typography and spacing.

The implementation uses those patterns as the primary design direction. Where the references were ambiguous, the chosen behavior favors a useful analytics dashboard interpretation.

### 2. Initialized a minimal React project

The workspace started empty, so the following project files were added:

- `package.json` for dependency and script configuration.
- `index.html` as the Vite HTML entry point.
- `vite.config.js` with the React plugin.
- `src/main.jsx` as the application entry point.
- `src/styles.css` for the complete visual system.

The project intentionally uses a lightweight Vite setup instead of introducing a framework that was not already present in the workspace.

### 3. Added the application data model

Development data was defined in `src/main.jsx` for:

- Monthly reach, engagement, and click values.
- Top-performing posts.
- Audience age ranges.
- Navigation destinations.

The data is kept in structured arrays and passed into components, so the view is not assembled from a screenshot or static image.

### 4. Built reusable UI pieces

Small reusable React components were added for:

- Metric cards.
- Icons.
- The performance chart.
- The sentiment donut.
- The overall application shell.

The page is composed from these pieces instead of being represented as one large block of repeated markup.

### 5. Built the responsive application shell

The shell was implemented with:

- A persistent sidebar on larger screens.
- A compact sidebar treatment on small screens.
- A top header with actions and breadcrumb context.
- A centered content area with responsive grids.
- Glass panel utility styling shared across cards.

CSS media queries adapt the grid, sidebar, header, search field, and metric cards for smaller viewports.

### 6. Implemented the dashboard visual system

`src/styles.css` establishes:

- Teal/green/black background gradients.
- Semi-transparent glass surfaces.
- Low-contrast teal borders.
- Accent colors for Reach, Engagement, Followers, and sentiment.
- Rounded cards and buttons.
- Typography using DM Sans and Space Grotesk.
- Muted labels and compact analytics metadata.
- Soft shadows and glow effects.
- Responsive breakpoints for tablet and mobile layouts.

The styles are plain CSS and are intentionally colocated in one design-system stylesheet for easy iteration against the visual references.

### 7. Implemented the interactive performance chart

The performance chart is an actual inline SVG visualization:

- Two polyline data series show reach and engagement.
- Gradient-filled polygons create the area treatment.
- Grid lines and month labels provide chart context.
- Data points are focusable through pointer hover behavior.
- A tooltip is positioned over the active point and populated from the selected data object.
- The period tabs select different slices of the same data set.

This avoids using a chart screenshot and keeps the chart easy to replace with a backend-driven series later.

### 8. Implemented supporting visualizations

The sentiment section uses a CSS conic-gradient donut with a center label and a legend. The demographics section uses data-driven horizontal bars. Both are generated from data values and use the same accent palette as the main chart.

### 9. Added navigation and feedback states

React state tracks:

- The active workspace.
- The selected chart range.
- Search text.
- Whether the workspace menu is open.
- The current toast message.

Workspace sections that are not yet fully detailed show a purposeful placeholder state with a return-to-overview action rather than a dead navigation link.

### 10. Added the API boundary and configuration

`src/api/analytics.js` reads `VITE_API_URL` and exposes `fetchAnalytics`. This keeps the eventual FastAPI URL out of components and makes it possible to replace local data with a service response without redesigning the page.

`.env.example` documents the expected environment variable:

```env
VITE_API_URL=
```

### 11. Added build and deployment documentation

The project includes npm scripts for development, production builds, and local preview. The generated `dist` directory is suitable for a static deployment target such as Vercel.

## Tech Stack & Architecture

### Runtime and framework

- **React 18**: Provides component rendering and state management.
- **React DOM**: Mounts the React application into the Vite HTML entry point.
- **Vite 5**: Provides the development server, module bundling, and production build pipeline.
- **JavaScript modules**: The current source is written in JSX/JavaScript rather than TypeScript because the workspace began empty and no TypeScript application structure existed.

### Styling and visual fidelity

- **Plain CSS** in `src/styles.css`: Implements the full layout and design system without requiring Tailwind.
- **CSS gradients and conic gradients**: Create the atmospheric background, surface highlights, sentiment donut, progress bars, and accent treatments.
- **Responsive CSS media queries**: Adapt sidebar, header, grids, metrics, and chart layouts at desktop, tablet, and mobile widths.
- **Google Fonts import**:
  - **DM Sans** for compact interface copy.
  - **Space Grotesk** for headings and prominent metric values.

### Data visualization

- **Inline SVG**: Used for the performance chart.
- **React state and event handlers**: Drive chart range changes, point hover state, and tooltip content.
- **CSS conic-gradient**: Used for the sentiment donut.
- **Data-driven CSS bars**: Used for demographic distribution.

No Recharts, Chart.js, D3, react-force-graph, Tailwind, Next.js, or icon package is currently installed or used in this workspace. The small SVG implementation was chosen because it is sufficient for the current reference screens and avoids adding a dependency before the backend data shape and chart requirements are finalized.

### Data access

- **`src/api/analytics.js`**: Isolates the future API call.
- **Vite environment variables**: `import.meta.env.VITE_API_URL` controls the backend base URL.
- **Local fallback data**: Keeps the UI functional before FastAPI is connected.

### Component architecture

The current architecture is intentionally compact:

```text
work/
├── index.html
├── package.json
├── vite.config.js
├── .env.example
├── README.md
└── src/
    ├── main.jsx
    ├── styles.css
    └── api/
        └── analytics.js
```

The next natural refactor as more backend-backed pages are added would be to split `main.jsx` into `components/layout`, `components/charts`, `components/analytics`, and page-level modules. The current component boundaries already make the metric cards, chart, donut, and shell straightforward to extract.

## Local Development

### Requirements

- Node.js 18 or newer.
- npm.

### Install and run

```bash
npm install
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`.

### Production build

```bash
npm run build
npm run preview
```

The production output is written to `dist`.

### Backend configuration

Copy `.env.example` to `.env` and set:

```env
VITE_API_URL=https://your-fastapi-service.example.com
```

The expected current endpoint is:

```text
GET /analytics/overview
```

The exact production response contract is not defined by the visual references. When that contract is available, the API adapter should normalize it into the existing metric, monthly-series, post, sentiment, and demographic shapes.

## Deployment Notes

For Vercel or another static frontend host:

1. Install dependencies with `npm install`.
2. Use `npm run build` as the build command.
3. Publish the `dist` directory.
4. Configure `VITE_API_URL` as a deployment environment variable.
5. Ensure the FastAPI service allows requests from the deployed frontend origin.

The application does not currently include a backend, background workers, authentication, persistence, or real social-platform ingestion. Those concerns belong to the planned FastAPI and worker services and can be connected through the API boundary without hardcoding a production URL into the UI.

## FastAPI Backend

The workspace now also includes a lean PostgreSQL bridge in `backend/main.py`.

Install and run it with:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
```

Configure `DATABASE_URL` from `backend/.env.example` in the shell or process environment. The API allows the Vite origin `http://localhost:5173` and serves:

```text
GET /analytics/overview
GET /health
```

`/analytics/overview` reads from the `structured_posts` SQLAlchemy model, aggregates reach, engagements, engagement rate, and sentiment buckets, and returns monthly performance points. The optional `demographic_group` column allows the NLP pipeline to populate age-group distribution; when no rows have that value, the endpoint returns an empty `demographics` list rather than inventing values.

## Assumptions and Future Work

- The attached frames are visual and interaction references, not a formal API contract.
- The reference does not expose every destination’s complete screen, so secondary destinations currently use informative placeholder states.
- Local data is intentionally realistic but not sourced from a social network.
- Authentication and workspace persistence are outside the current frontend scope.
- A future iteration can add typed API models, loading/skeleton states, explicit API error UI, pagination, richer content detail pages, and a dedicated charting library if the backend requires more complex visualizations.

## Team

This project was collaboratively developed by:

- **Kritarth Bajpai**
- **Arekh Vikram**
- **Ayush Singh Rajput**
