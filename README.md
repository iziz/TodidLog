# TodidLog

Timer-based work log PWA.

![TodidLog screenshot](assets/readme-screenshot.png)

## Features

- Track focused work with a start/stop timer.
- Add, edit, delete, tag, and merge task records.
- Switch between weekly and monthly calendar views with animated transitions.
- Copy a monthly report to the clipboard.
- Store records locally in the browser.

## Run

```bash
npm run dev
```

Then open:

```text
http://localhost:5173
```

Devices on the same local network can open the LAN URL printed by the server, for example:

```text
http://192.168.0.6:5173
```

## Configuration

TodidLog can optionally rewrite daily fortune copy with Gemini through the local backend proxy. The browser never receives the API key.

For local development, copy `.env.example` to `.env.local` and set:

```text
TODIDLOG_GEMINI_API_KEY=your-api-key
```

Then run:

```bash
npm run dev
```

`GEMINI_API_KEY` is also accepted as a fallback. `PORT`, `HOST`, `GEMINI_TIMEOUT_MS`, `GEMINI_MAX_OUTPUT_TOKENS`, and `GEMINI_THINKING_BUDGET` can be set when the default local server settings need to change. `HOST` defaults to `0.0.0.0` so devices on the same trusted local network can reach the app.

## Structure

- `index.html`: App shell and modals
- `src/styles.css`: Tailwind CSS source and custom UI styling
- `src/fortune-engine.js`: Daily fortune calculation logic
- `styles.css`: Generated stylesheet
- `app.js`: Timer, records, grouping, calendar, and local storage logic
- `scripts/server.mjs`: Static file server and Gemini backend proxy
- `scripts/env.mjs`: Local environment file parser for server-side configuration
- `manifest.webmanifest`: PWA metadata
- `service-worker.js`: Offline cache with network-first updates

## Data

Records are stored in browser `localStorage`.
