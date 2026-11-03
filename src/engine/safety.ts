// Copyright (c) 2026 RA. MIT License.
import { lstat, realpath, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
export const MAX_FILE_BYTES = 1024 * 1024;
export interface ProjectDirectoryEntry {
  name: string;
  path: string;
  kind: "directory" | "file";
  browsable: boolean;
}
const TREE_EXCLUDED = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".turbo",
  ".react-uiux-tool",
  "vendor",
  "out",
]);
const BROWSABLE_TEXT =
  /\.(?:[cm]?[jt]sx?|css|scss|sass|less|json|md|html?|svg|txt|ya?ml|php|xml)$/i;
export class InvalidUtf8Error extends Error {
  constructor(readonly file: string) {
    super(
      `${file}: Source is not valid UTF-8; analysis and editing would change its encoding.`,
    );
    this.name = "InvalidUtf8Error";
  }
}
export function hashSource(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}
export async function projectRoot(root: string): Promise<string> {
  if (/^(?:\\\\|\/\/)/.test(root))
    throw new Error(
      "UNC and network project roots are unsupported. Choose a local directory.",
    );
  const resolved = await realpath(path.resolve(root));
  if (/^(?:\\\\|\/\/)/.test(resolved))
    throw new Error(
      "UNC and network project roots are unsupported. Choose a local directory.",
    );
  if (!(await stat(resolved)).isDirectory())
    throw new Error("Project path must be a directory.");
  const canonicalHome = await realpath(os.homedir()).catch(() =>
    path.resolve(os.homedir()),
  );
  const comparable = (value: string) =>
    process.platform === "win32" ? value.toLowerCase() : value;
  if (
    comparable(resolved) === comparable(path.parse(resolved).root) ||
    comparable(resolved) === comparable(canonicalHome)
  )
    throw new Error(
      "Select a specific project directory, not your home or filesystem root.",
    );
  return resolved;
}
export async function resolveProjectPath(
  root: string,
  file: string,
): Promise<string> {
  const base = await projectRoot(root);
  if (
    !file ||
    path.isAbsolute(file) ||
    file.includes("\\") ||
    file.split("/").some((p) => p === ".." || p === ".")
  )
    throw new Error("Invalid project-relative path.");
  if (
    /(^|\/)(\.env(?:\..*)?|\.git|node_modules|\.ssh|\.aws|.*\.(?:pem|key|p12|pfx))($|\/)/i.test(
      file,
    )
  )
    throw new Error("Secret and excluded paths are not accessible.");
  const full = path.resolve(base, file);
  if (!full.startsWith(base + path.sep))
    throw new Error("Path escapes the selected project.");
  let cursor = base;
  for (const part of file.split("/")) {
    cursor = path.join(cursor, part);
    const s = await lstat(cursor);
    if (s.isSymbolicLink())
      throw new Error("Symlink paths are not editable or readable.");
  }
  if ((await realpath(full)) !== full)
    throw new Error("Path resolution changed.");
  return full;
}
export async function listProjectDirectory(
  root: string,
  directory = "",
): Promise<{ entries: ProjectDirectoryEntry[]; truncated: boolean }> {
  const base = await projectRoot(root);
  if (
    directory &&
    (path.isAbsolute(directory) ||
      directory.includes("\\") ||
      directory
        .split("/")
        .some((part) => part === ".." || part === "." || !part))
  ) {
    throw new Error("Invalid project-relative directory.");
  }
  let target = base;
  for (const part of directory ? directory.split("/") : []) {
    if (
      TREE_EXCLUDED.has(part) ||
      (part.startsWith(".") && part !== ".storybook")
    )
      throw new Error("Excluded project directory.");
    target = path.join(target, part);
    const info = await lstat(target);
    if (info.isSymbolicLink())
      throw new Error("Symlink directories are not browsable.");
  }
  if (!(await stat(target)).isDirectory())
    throw new Error("Project tree path must be a directory.");
  const result: ProjectDirectoryEntry[] = [];
  let truncated = false;
  for (const entry of await readdir(target, { withFileTypes: true })) {
    if (result.length >= 500) {
      truncated = true;
      break;
    }
    if (
      entry.isSymbolicLink() ||
      TREE_EXCLUDED.has(entry.name) ||
      (entry.name.startsWith(".") && entry.name !== ".storybook")
    )
      continue;
    const relative = directory ? `${directory}/${entry.name}` : entry.name;
    if (
      /(^|\/)(?:\.env(?:\..*)?|\.ssh|\.aws|.*\.(?:pem|key|p12|pfx))($|\/)/i.test(
        relative,
      )
    )
      continue;
    if (entry.isDirectory())
      result.push({
        name: entry.name,
        path: relative,
        kind: "directory",
        browsable: true,
      });
    else if (entry.isFile() && BROWSABLE_TEXT.test(entry.name)) {
      const info = await stat(path.join(target, entry.name));
      result.push({
        name: entry.name,
        path: relative,
        kind: "file",
        browsable: info.size <= MAX_FILE_BYTES,
      });
    }
  }
  result.sort((a, b) =>
    a.kind === b.kind
      ? a.name.localeCompare(b.name, undefined, { numeric: true })
      : a.kind === "directory"
        ? -1
        : 1,
  );
  return { entries: result, truncated };
}
export async function readProjectFile(
  root: string,
  file: string,
): Promise<string> {
  if (!BROWSABLE_TEXT.test(file))
    throw new Error("Unsupported source file type.");
  const full = await resolveProjectPath(root, file);
  const info = await stat(full);
  if (!info.isFile() || info.size > MAX_FILE_BYTES)
    throw new Error(
      "Source file exceeds the 1 MiB limit or is not a regular file.",
    );
  const raw = await readFile(full);
  if (raw.includes(0)) throw new Error("Binary source files are unsupported.");
  const source = raw.toString("utf8");
  if (!Buffer.from(source, "utf8").equals(raw))
    throw new InvalidUtf8Error(file);
  return source;
}
