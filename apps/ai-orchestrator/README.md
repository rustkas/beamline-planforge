# PlanForge AI Orchestrator

Minimal rule-based agent that proposes replace-only patches and applies them through api-core.

## Run

```bash
bun --filter @planforge/ai-orchestrator run dev
```

## Env

- `API_CORE_BASE_URL` (default: http://localhost:3001)
- `ORCHESTRATOR_PORT` (default: 3002)
- `ORCHESTRATOR_ALLOW_LLM` (default: 0, not used in MVP)

## Demo flow

```bash
# Create demo session
curl -s -X POST http://localhost:3002/demo/session

# Run a command
curl -s -X POST http://localhost:3002/sessions/<session_id>/turn \
  -H "content-type: application/json" \
  -d '{"command":"move first object x to 1200"}'
```
