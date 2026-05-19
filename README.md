# Daily Work Log

Timer-based daily work log PWA.

![Daily Work Log screenshot](assets/readme-screenshot.png)

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

## Structure

- `index.html`: App shell and modals
- `src/styles.css`: Tailwind CSS source and custom UI styling
- `styles.css`: Generated stylesheet
- `app.js`: Timer, records, grouping, calendar, and local storage logic
- `manifest.webmanifest`: PWA metadata
- `service-worker.js`: Offline cache with network-first updates

## Data

Records are stored in browser `localStorage`.
