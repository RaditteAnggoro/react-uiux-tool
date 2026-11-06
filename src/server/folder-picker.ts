import { execFile } from "node:child_process";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
type Runner = (command: string, args: string[], options: { timeout: number }) => Promise<{ stdout: string }>;

export async function pickDirectory(platform: NodeJS.Platform = process.platform, run: Runner = executeFile) {
  const command = platform === "darwin" ? "osascript" : platform === "win32" ? "powershell.exe" : "zenity";
  const args = platform === "darwin"
    ? ["-e", 'POSIX path of (choose folder with prompt "Choose a React project or parent directory")']
    : platform === "win32"
      ? ["-NoProfile", "-STA", "-Command", 'Add-Type -AssemblyName System.Windows.Forms; $picker = New-Object System.Windows.Forms.FolderBrowserDialog; if ($picker.ShowDialog() -eq "OK") { $picker.SelectedPath }']
      : ["--file-selection", "--directory", "--title=Choose project directory"];
  try {
    return { path: (await run(command, args, { timeout: 120000 })).stdout.trim(), unavailable: false };
  } catch (error) {
    const failure = error as { code?: string | number; stderr?: string; killed?: boolean };
    const cancelled = platform === "darwin"
      ? /\(-128\)/.test(failure.stderr ?? "")
      : platform !== "win32" && failure.code === 1 && !failure.killed && !failure.stderr?.trim();
    return { path: "", unavailable: !cancelled };
  }
}
