# Repository Guidelines

## Project Structure & Module Organization

- `extension/` contains the Chrome Manifest V3 extension and has no build step. `src/background.js` handles the service worker; `src/popup/` and `src/options/` contain UI; shared logic lives in `src/lib/`.
- `web/` is the Next.js 16 App Router application. Routes are under `web/app/`, reusable UI is in `web/components/`, and bridge/state/domain helpers are in `web/lib/`.
- `extension/src/lib/` and `web/lib/` contain parallel domain logic; keep their data shapes and behavior aligned.
- `docs/` holds architecture, design, image, and Superpowers planning documents. `supabase/` contains the current schema and migrations.

## Build, Test, and Development Commands

Run web commands from `web/`:

```bash
npm install             # install dependencies
npm run dev             # start Next.js at localhost:3000
npm run typecheck       # run TypeScript checks
npm run build           # create a production build
npm run start           # serve the production build
```

Run the extension tests from the repository root with Node’s built-in runner:

```bash
node --test extension/src/lib/*.test.js extension/test/*.test.mjs
```

Load `extension/` through `chrome://extensions` to manually verify popup and options changes.

## Coding Style & Naming Conventions

Use two-space indentation, semicolons, and the existing single-quote JavaScript/TypeScript style. Use `camelCase` for variables and functions, `PascalCase` for React components, and kebab-case for route or asset names. There is no configured formatter or linter, so keep changes consistent with nearby code and preserve the shared `db.js`/`bridge.ts` I/O boundaries.

## Testing Guidelines

Add focused tests beside the implementation (`*.test.js`, `*.test.mjs`, or `*.test.ts`). Cover pure domain logic and edge cases, especially time boundaries, tree aggregation, and cross-interface data compatibility. Run the full Node test command and `npm run typecheck` for relevant changes.

## Commit & Pull Request Guidelines

Use concise Conventional Commit-style subjects such as `feat: ...`, `fix: ...`, and `docs: ...`. PRs should explain behavior changes, list validation commands, link related issues when applicable, and include screenshots or a short recording for UI changes. Update relevant README or architecture documentation when workflows or data contracts change.

## Security & Configuration Tips

Keep `extension-key.pem` private; it determines the extension ID. Store local web overrides in uncommitted `web/.env.local`. The web app must run on `localhost` or `127.0.0.1` because the extension’s external messaging allowlist is intentionally restricted.
