# Daily Work Log

Timer-based daily work log PWA.

## Run

```powershell
npm run dev
```

Then open:

```text
http://localhost:5173
```

## Structure

- `index.html`: App shell and modals
- `styles.css`: UI styling
- `app.js`: Timer, records, grouping, calendar, and local storage logic
- `manifest.webmanifest`: PWA metadata
- `service-worker.js`: Offline cache with network-first updates

## Data

Records are stored in browser `localStorage`.
