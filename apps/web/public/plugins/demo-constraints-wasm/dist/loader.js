export async function init(host) {
  await host.log("info", "Demo plugin initialized", { plugin: "demo" });
}

export async function run(params, host) {
  const command = params?.command ?? "ping";

  if (command === "ping") {
    await host.log("info", "Ping from demo plugin", {});
    return { ok: true, message: "pong" };
  }

  if (command === "validate") {
    const state = await host.get_project_state();
    const objectCount = state?.layout?.objects?.length ?? 0;
    return { ok: true, message: `State has ${objectCount} objects`, violations: [] };
  }

  return { ok: false, message: `Unknown command ${command}` };
}
