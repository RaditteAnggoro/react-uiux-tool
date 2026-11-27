import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { findNextCli } from "../engine/next.js";

export class NextPreview {
  private child: ChildProcess | null = null;
  url: string | null = null;

  async start(root: string) {
    const cli = await findNextCli(root);
    if (!cli) throw new Error("Install the project's Next.js dependencies before starting its runtime.");
    const child = spawn(process.execPath, [cli, "dev", "--hostname", "127.0.0.1", "--port", "0"], {
      cwd: root, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NO_COLOR: "1" },
      windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;
    child.once("close", () => { if (this.child === child) { this.child = null; this.url = null; } });
    try {
      const url = await new Promise<string>((resolve, reject) => {
        let output = "";
        const finish = (error?: Error, url?: string) => {
          clearTimeout(timer);
          child.stdout?.off("data", append);
          child.stderr?.off("data", append);
          child.off("close", earlyExit);
          child.off("error", finish);
          child.stdout?.resume();
          child.stderr?.resume();
          if (error) reject(error);
          else resolve(url!);
        };
        const append = (entry: Buffer) => {
          output = (output + entry.toString()).slice(-8000);
          const local = /Local:\s+(http:\/\/127\.0\.0\.1:[1-9]\d{0,4})\b/.exec(output)?.[1];
          if (local && /Ready in\b/i.test(output)) finish(undefined, local);
        };
        const earlyExit = () => finish(new Error(`Next.js stopped before it was ready. ${output.trim().slice(-1200)}`));
        const timer = setTimeout(() => finish(new Error(`Next.js did not start within 45 seconds. ${output.trim().slice(-1200)}`)), 45_000);
        child.stdout?.on("data", append);
        child.stderr?.on("data", append);
        child.once("close", earlyExit);
        child.once("error", finish);
      });
      if (this.child !== child) throw new Error("Next.js stopped during startup.");
      this.url = url;
      return { url, kind: "next" as const };
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop() {
    const child = this.child;
    this.child = null;
    this.url = null;
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((resolve) => {
      const done = () => { clearTimeout(timeout); child.off("close", done); resolve(); };
      const pid = child.pid!;
      const timeout = setTimeout(() => {
        if (process.platform === "win32") child.kill();
        else { try { process.kill(-pid, "SIGKILL"); } catch { /* Already stopped. */ } }
        done();
      }, 3500);
      child.once("close", done);
      if (process.platform === "win32") {
        const killer = spawn(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe"), ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.on("error", () => child.kill());
      } else {
        try { process.kill(-pid, "SIGTERM"); } catch { child.kill(); }
      }
    });
  }
}
