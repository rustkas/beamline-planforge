# PlanForge Core API

Deterministic HTTP API for projects, revisions, validation, render projection, and quotes. In-memory store for Iteration 5.

## Run

```bash
bun --filter @planforge/api-core run dev
```

## Endpoints

- `GET /health`
- `POST /projects`
- `GET /projects/:project_id`
- `GET /projects/:project_id/revisions`
- `GET /projects/:project_id/revisions/:revision_id`
- `POST /projects/:project_id/revisions/:revision_id/patch`
- `POST /projects/:project_id/revisions/:revision_id/render`
- `POST /projects/:project_id/revisions/:revision_id/quote`
- `POST /exports`
- `GET /exports/:export_id`
- `GET /exports/:export_id/artifacts/:artifact_id`

## Exports (PDF)

PDF generation defaults to Playwright. Install the browser binaries once:

```bash
bun --filter @planforge/api-core run setup:playwright
```

For tests/CI, set stub mode:

```bash
EXPORT_PDF_MODE=stub bun --filter @planforge/api-core test
```

## WASM

The API loads the WASM artifact from `apps/api-core/assets/wasm/`.
To update it:

```bash
wasm-pack build packages/core-wasm --target nodejs --out-dir ../../apps/api-core/assets/wasm --release
```

## Persistence

Set `PLANFORGE_PERSIST_PATH` to store JSON snapshots per project.
