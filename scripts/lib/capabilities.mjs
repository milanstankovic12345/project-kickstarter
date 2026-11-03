// Loads and validates the tool-integration capability manifest
// (config/tool-capabilities.json): which tools get STATIC_EXPORT,
// CLI_ADAPTER or FULL_INTEGRATION, and whether that tier has actually been
// verified in the real tool. Single source of truth for compatibility
// claims made in docs and by scripts/export-ide.mjs.
import { pluginFile, readJson, loadSchema } from "./project.mjs";
import { validate } from "./schema.mjs";

export const CAPABILITIES_REL = ["config", "tool-capabilities.json"];

export function loadCapabilities(path = pluginFile(...CAPABILITIES_REL)) {
  const data = readJson(path);
  const errors = validate(loadSchema("capability-manifest"), data);
  if (errors.length) throw new Error(`invalid ${path}:\n${errors.join("\n")}`);
  for (const [name, tool] of Object.entries(data.tools)) {
    if (tool.full_integration.supported && !tool.cli_adapter.supported) {
      throw new Error(`invalid ${path}: "${name}" claims full_integration without cli_adapter support`);
    }
  }
  return data;
}

export function listTools(data = loadCapabilities()) {
  return Object.entries(data.tools).map(([name, tool]) => ({ name, ...tool }));
}
