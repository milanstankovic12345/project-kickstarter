// Generic "is this CLI installed" probe, generalized from the ENOENT
// handling in scripts/lib/codex-adapter.mjs. Diagnostic only: it never
// runs a tool's real command, just a cheap version check, and it never
// throws for an ordinary missing-binary case.
import { execFile as nodeExecFile } from "node:child_process";

export function detectCli({ bin, versionArgs = ["--version"], timeoutMs = 10_000, spawnImpl = nodeExecFile } = {}) {
  if (!bin) return Promise.reject(new Error("detectCli requires a bin name"));
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    let child;
    try {
      child = spawnImpl(bin, versionArgs, { shell: false });
    } catch (e) {
      if (e && e.code === "ENOENT") return finish({ installed: false, reason: "not_installed" });
      return finish({ installed: false, reason: "spawn_error", message: e.message });
    }

    let timedOut = false;
    timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch { /* already gone */ }
    }, timeoutMs);

    let stdout = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.on("error", (e) => {
      if (e && e.code === "ENOENT") return finish({ installed: false, reason: "not_installed" });
      return finish({ installed: false, reason: "spawn_error", message: e.message });
    });
    child.on("exit", (code) => {
      if (timedOut) return finish({ installed: false, reason: "timed_out" });
      if (code !== 0) return finish({ installed: false, reason: "nonzero_exit", exitCode: code });
      return finish({ installed: true, version: stdout.trim().split("\n")[0] || undefined });
    });
  });
}
