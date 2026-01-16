# PlanForge Plugin SDK

Type-only SDK for PlanForge plugins. It defines the HostAPI surface, RPC wire protocol, and shared domain primitives.

Plugins communicate with the host via RPC messages (`rpc_request` / `rpc_response`) and can only access host functionality through `host_api`.

Hook DTOs are included for constraints, pricing, render, and export flows. They are pure types and do not imply runtime behavior.

Method maps are available in `methods.ts` for strict RPC typing between host and plugin.

Schema identifiers are aligned with core-contracts and remain stable:
- planforge://schemas/plugin-manifest.schema.json
- planforge://schemas/kitchen_state.schema.json
- planforge://schemas/render_model.schema.json
