import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { windowsFolderPicker } from "./windows-folder-picker.js";

const executeFile = promisify(execFile);
type Runner = (command: string, args: string[], options: {
  timeout: number;
  windowsHide?: boolean;
  env?: NodeJS.ProcessEnv;
}) => Promise<{ stdout: string }>;

export async function pickDirectory(
  platform: NodeJS.Platform = process.platform,
  run: Runner = executeFile,
  initialPath?: string,
) {
  const command = platform === "darwin" ? "osascript" : platform === "win32" ? "powershell.exe" : "zenity";
  const args = platform === "darwin"
    ? ["-e", 'POSIX path of (choose folder with prompt "Choose a React project or parent directory")']
    : platform === "win32"
      ? ["-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand", Buffer.from(windowsFolderPicker, "utf16le").toString("base64")]
      : ["--file-selection", "--directory", "--title=Choose project directory"];
  const options = platform === "win32"
    ? { timeout: 120000, windowsHide: true, env: { ...process.env, UIUX_PICKER_INITIAL_DIRECTORY: initialPath ?? "" } }
    : { timeout: 120000 };
  try {
    return { path: (await run(command, args, options)).stdout.replace(/\r?\n$/, ""), unavailable: false };
  } catch (error) {
    const failure = error as { code?: string | number; stderr?: string; killed?: boolean };
    const cancelled = platform === "darwin"
      ? /\(-128\)/.test(failure.stderr ?? "")
      : platform !== "win32" && failure.code === 1 && !failure.killed && !failure.stderr?.trim();
    return { path: "", unavailable: !cancelled };
  }
}
