# DialedIn — Aarush's Productivity RPG

A gamified productivity dashboard built as a **zero-dependency, zero-build** static site:
pure HTML (`index.html`), CSS (`css/style.css`), and vanilla JS (`js/*.js`). All state is
persisted client-side in the browser's `localStorage`. See `README.md` for the feature map.

## Cursor Cloud specific instructions

- **No install/build/lint/test tooling exists.** There is no `package.json`, bundler, linter,
  or test suite. Do not add one unless explicitly asked. The update script is effectively a no-op.
- **Run it** by serving the repo root over HTTP (opening `index.html` via `file://` breaks some
  browser features). Standard command is in `README.md`: `python3 -m http.server 8080`, then visit
  `http://localhost:8080/`. Any static file server works.
- **Script load order matters.** `index.html` loads `js/*.js` as classic (non-module) scripts in a
  specific order (`store.js` first, `app.js` last). They share globals — there is no module system,
  so ordering and global names are load-bearing.
- **State lives in `localStorage`.** To reset the app to a fresh state, clear the site's
  `localStorage` in the browser (or use a fresh/incognito profile). There is no backend or database.
- Completing a task triggers a full-screen congrats/confetti overlay (dark backdrop) on milestones
  like the "First Blood" badge — this is expected, not a rendering bug.
