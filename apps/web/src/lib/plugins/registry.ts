import type { loaded_plugin } from "@planforge/plugin-runtime";

const pluginRegistry = new Map<string, loaded_plugin>();

export function set_loaded_plugin(plugin: loaded_plugin): void {
  pluginRegistry.set(plugin.manifest.id, plugin);
}

export function remove_loaded_plugin(id: string): void {
  pluginRegistry.delete(id);
}

export function get_loaded_plugins(): loaded_plugin[] {
  return Array.from(pluginRegistry.values());
}
