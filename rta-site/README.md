# RTA patient database

Single-page registry for the road-traffic-accident study in Chattogram. The UI is
plain HTML/CSS/JS. A small Vercel function (`api/records.js`) proxies NocoDB so the
NocoDB URL, table ID, and token never reach the browser.

## Deploy

- Vercel **Root Directory**: `rta-site`
- Environment variables (Production, Preview, Development):
  - `NOCODB_URL`
  - `NOCODB_TOKEN`
  - `NOCODB_TABLE_ID`
  - `APP_PASSWORD`
- The NocoDB table needs an `Id` field plus one column for every key in the `S`
  array in `index.html` (69 fields), including the `*_other` columns. `CreatedAt`
  is used by the CSV export.

## Offline use

1. **App shell** — `sw.js` caches `index.html`, the manifest, and the icon, so the
   site opens without a connection after one online visit. `/api/*` is never cached.
2. **Records** — the last loaded patient list is stored in IndexedDB (with a
   `localStorage` fallback) and restored on startup.
3. **New work** — saving a new or edited patient writes to the device first and
   queues an operation in an outbox. Deletes are queued too, so a patient removed
   offline is deleted from NocoDB on the next sync.
4. **Sync** — runs automatically on startup (when a password is available), when
   the browser comes back online, when the tab becomes visible with pending work,
   and from the **Sync now** button. A patient that exists only on the device is
   marked **LOCAL**; an edited patient is marked **EDITED**.
5. **Failure handling** — network/server errors keep the queue and retry later.
   A validation error (4xx) keeps the change on the device and shows the server
   message; edit the row and save again, or press **Sync now** to retry.

The password is only for NocoDB access. It is remembered in `localStorage`, so
syncing can resume after a restart.

## Things to know

- **Do not clear browser data / site data** while changes are still marked LOCAL or
  EDITED. They exist only on that device until synced.
- **Do not use private/incognito windows** for offline collection. Some browsers
  discard IndexedDB when the private session closes.
- The offline cache is **not encrypted**. Use a device passcode and disk encryption;
  anyone who can open the browser profile can read IndexedDB.
- Offline caching needs **HTTPS** (the Vercel site) or `localhost`. Opening
  `index.html` directly from disk does not register the service worker.
- The app uses one shared password and has no per-user audit trail.
- Sync is last-write-wins. Avoid editing the same patient on two devices at once.
- The Study ID uniqueness check only looks at the records on this device. If two
  people use the same Study ID, or a create response is lost mid-sync, NocoDB can
  receive a duplicate row. Check the list before syncing.
- Use **one tab at a time**. Two open tabs keep separate copies of the local queue.
- If NocoDB rejects a record (for example a missing column), the change stays local
  and the error is shown. Fix the data/schema and sync again.
- When you change a precached static asset (icon, manifest), bump `SHELL` in
  `sw.js` (`rta-shell-v1` → `rta-shell-v2`) so returning users pick it up.
- CSV exports include a `sync_status` column (`synced`, `edited`, or `local`) and
  neutralise values that a spreadsheet could interpret as formulas.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Form, list, offline store, outbox, sync loop |
| `api/records.js` | Password-protected NocoDB proxy |
| `sw.js` | Service worker / offline shell cache |
| `manifest.webmanifest` | Home-screen metadata |
| `icon.svg` | App icon |
