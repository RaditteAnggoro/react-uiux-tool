/** Copyright (c) 2026 RA. Local project build runner. */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export interface BuildResult {
  ok: boolean;
  code: number | null;
  output: string;
  durationMs: number;
}

const MAX_OUTPUT = 20_000;
const TIMEOUT_MS = 120_000;

/** Run the project's declared build script; no client-supplied command or shell. */
export async function runProjectBuild(root: string): Promise<BuildResult> {
  const packagePath = path.join(root, "package.json");
  const raw = await fs.readFile(packagePath, "utf8");
  const pkg = JSON.parse(raw) as { scripts?: Record<string, unknown> };
  if (typeof pkg.scripts?.build !== "string" || !pkg.scripts.build.trim())
    throw new Error("Project has no npm build script.");
  const started = Date.now();
  return await new Promise<BuildResult>((resolve) => {
    let output = "";
    const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
      cwd: root,
      shell: false,
      env: { ...process.env, CI: "1" },
      timeout: TIMEOUT_MS,
    });
    const append = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-MAX_OUTPUT);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) => {
      resolve({ ok: false, code: -1, output: `${output}\n${String(error)}`.slice(-MAX_OUTPUT), durationMs: Date.now() - started });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, code, output, durationMs: Date.now() - started });
    });
  });
}
