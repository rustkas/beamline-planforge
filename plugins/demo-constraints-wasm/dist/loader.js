let host_context = null;

function is_object(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function make_ok(id, result) {
  return { id, ok: true, result };
}

function make_err(id, code, message, details) {
  return { id, ok: false, error: { code, message, details } };
}

let next_id = 1;
const inflight = new Map();

function rpc_call(method, params) {
  const id = String(next_id++);
  const req = { id, method, params };
  return new Promise((resolve, reject) => {
    inflight.set(id, { resolve, reject });
    self.postMessage(req);
  });
}

self.onmessage = async (ev) => {
  const msg = ev.data;

  if (is_object(msg) && typeof msg.id === "string" && typeof msg.ok === "boolean" && ("result" in msg || "error" in msg)) {
    const waiter = inflight.get(msg.id);
    if (waiter) {
      inflight.delete(msg.id);
      if (msg.ok) waiter.resolve(msg.result);
      else waiter.reject(msg.error);
    }
    return;
  }

  if (!is_object(msg) || typeof msg.id !== "string" || typeof msg.method !== "string" || !("params" in msg)) {
    return;
  }

  const { id, method, params } = msg;

  try {
    if (method === "plugin.init") {
      host_context = params && params.context ? params.context : null;
      await rpc_call("host.log", {
        level: "info",
        message: "Demo plugin initialized",
        fields: { plugin: "com.planforge.demo.constraints" }
      });
      self.postMessage(make_ok(id, { ok: true }));
      return;
    }

    if (method === "plugin.ping") {
      self.postMessage(make_ok(id, { pong: true, nonce: params && params.nonce ? params.nonce : undefined }));
      return;
    }

    if (method === "plugin.run") {
      const command = params && params.command ? String(params.command) : "ping";
      if (command === "ping") {
        self.postMessage(make_ok(id, { ok: true, message: "pong" }));
        return;
      }
      if (command === "validate") {
        let count = 0;
        try {
          const state = await rpc_call("host.get_project_state", undefined);
          const objects = state && state.kitchen_state && state.kitchen_state.layout && Array.isArray(state.kitchen_state.layout.objects)
            ? state.kitchen_state.layout.objects
            : [];
          count = objects.length;
        } catch (_) {}
        self.postMessage(make_ok(id, { ok: true, message: `State has ${count} objects`, violations: [] }));
        return;
      }
      self.postMessage(make_ok(id, { ok: false, message: `Unknown command ${command}` }));
      return;
    }

    if (method === "plugin.constraints.post_validate") {
      const req = params;
      const hook_params = req && req.params ? req.params : null;
      let object_id = "";
      try {
        const state = hook_params && hook_params.kitchen_state ? hook_params.kitchen_state : null;
        const objects = state && state.layout && Array.isArray(state.layout.objects) ? state.layout.objects : [];
        if (objects.length > 0 && is_object(objects[0]) && typeof objects[0].id === "string") {
          object_id = objects[0].id;
        }
      } catch (_) {}

      const add_violations = [];
      if (object_id) {
        add_violations.push({
          code: "demo.constraint.applied",
          severity: "warning",
          message: "Demo plugin constraint applied: first object is highlighted and flagged.",
          object_ids: [object_id],
          details: { plugin: "com.planforge.demo.constraints" }
        });
      }

      try {
        await rpc_call("host.get_project_state", undefined);
      } catch (_) {}

      self.postMessage(
        make_ok(id, {
          ok: true,
          result: {
            add_violations,
            suppress_codes: [],
            metrics: { demo_added: add_violations.length }
          }
        })
      );
      return;
    }

    if (method === "plugin.render.post_render") {
      const req = params;
      const hook_params = req && req.params ? req.params : null;
      let object_id = "";
      try {
        const state = hook_params && hook_params.kitchen_state ? hook_params.kitchen_state : null;
        const objects = state && state.layout && Array.isArray(state.layout.objects) ? state.layout.objects : [];
        if (objects.length > 0 && is_object(objects[0]) && typeof objects[0].id === "string") {
          object_id = objects[0].id;
        }
      } catch (_) {}

      const instructions = object_id
        ? [{ kind: "highlight", object_ids: [object_id], style: { mode: "outline" } }]
        : [];

      self.postMessage(make_ok(id, { ok: true, result: { instructions } }));
      return;
    }

    self.postMessage(make_err(id, "plugin.unknown_method", `Unknown method: ${method}`, { method }));
  } catch (e) {
    self.postMessage(make_err(id, "plugin.exception", "Plugin handler threw", { message: String(e) }));
  }
};
