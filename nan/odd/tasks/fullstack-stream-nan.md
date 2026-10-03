# Feature: fullstack-stream-nan (issue barbatdev/refactoria#68)

Extend the `nan/` benchmark implementation with two uses, for the NaN.Builders stream:
a persistence backend and a natural-language budget parser using the NaN API.

Base: `main`, branch `feat/fullstack-stream-nan`. The benchmark's no-backend limits
do not apply on this branch (this is the deliberate stream extension; canonical
`.ai/` docs stay untouched).

## Tasks

- [x] T1 — Adapter swap: `adapter-static` → `adapter-node` in `nan/svelte.config.js`,
      drop/disable prerender forcing in `nan/src/routes/+layout.ts`. Verify dev server
      boots and `pnpm build` succeeds.
- [x] T2 — DB module `nan/src/lib/server/db.ts` using `node:sqlite` (Node 24, no native
      deps): budgets table (id, number, client, email, address, rut, items JSON,
      created_at, updated_at). Schema created idempotently on first import.
- [x] T3 — CRUD API with server-side validation reusing `src/lib/domain/validate.ts`:
      `GET/POST /api/budgets`, `GET/PUT/DELETE /api/budgets/[id]`. ErrorCode map →
      HTTP 422 with code+message from `messages.ts`. Tests for route handlers where
      runnable (domain already covered; add integration smoke via dev server).
- [x] T4 — Parse endpoint (commit 31d2ac6; 229 tests + check green, live smoke in T6) `POST /api/parse`: proxies NaN API `gemma4`
      (`https://api.nan.builders/v1/chat/completions`, `stream: true`), NDJSON item
      protocol — model emits one item per line, server validates each line with
      `validateItem` and re-emits SSE/NDJSON to client; invalid lines flagged, not fatal.
      Key from `NAN_API_KEY` env (local source: `~/.config/opencode/secrets/nan-api-key`).
- [ ] T5 — Front wiring in `nan/src/routes/+page.svelte`: save / load / list against
      `/api/budgets`; natural-language input box with live item streaming into the table.
- [x] T6 — Verification (commits 31d2ac6 + f28b6b6 fix): pnpm test 247 green,
      svelte-check 0 errors, pnpm build green (adapter-node). Live smoke: CRUD
      roundtrip 201/GET/PUT/DELETE/404 + 422 QUANTITY_INVALID OK; parse SSE live
      with NAN_API_KEY: 2 item events (teclados 1550¢, monitores 12000¢), 0 invalid,
      1 done. Production-build runtime not smoke-tested (dev server only).

## Work-unit commits

- T1: 38597ea feat(nan): switch to adapter-node for server routes
- T4: 31d2ac6 feat(nan): streaming natural-language budget parser via NaN API
- T5: fd2dfae feat(nan): wire UI to budgets API and live parser
- T6: f28b6b6 fix(nan): decode OpenAI SSE chunks in parse pump before item validation
  (bug found by live smoke: raw OpenAI chunks fed to item validation → all invalid)

## Notes / decisions

- `node:sqlite` chosen over `better-sqlite3`: Node 24 built-in, avoids native build
  failure with `pnpm.ignoredBuiltDependencies`. Same synchronous API shape.
- NDJSON-per-item protocol chosen over single JSON blob: partial results visible live
  during the stream; per-item validation isolates bad lines.
- `/api/parse` must be server-side: the API key never reaches the client.
