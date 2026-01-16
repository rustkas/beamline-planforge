# PlanForge Plugin Runtime

Minimal host runtime for plugin manifests, permissions, and RPC bridging.

## Features

- Validates `plugin.json` using core-contracts schema
- Enforces permissions (project_data read only in MVP)
- RPC bridge between host and plugin worker
- Worker-host adapter for web

## Plugin layout

```
plugins/<plugin-id>/
  plugin.json
  dist/
    loader.js
```

## Security

- Plugins run in Web Workers
- Host mediates all access via HostAPI
- No network/storage APIs in MVP unless manifest allows
