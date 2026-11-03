import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const files = [
  "README.md",
  "README.id.md",
  "KNOWN_LIMITATIONS.md",
  "COMPATIBILITY_MATRIX.md",
  "IMPLEMENTATION_STATUS.md",
  "SECURITY.md",
  "NOTICE.md",
  "INSPIRATION.md",
  "THIRD_PARTY_NOTICES.md",
  "docs/USER_GUIDE_EN.md",
  "docs/USER_GUIDE_ID.md",
];
const missing = [];
let checked = 0;

for (const file of files) {
  const content = await readFile(path.join(root, file), "utf8");
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, "");
    if (/^(https?:|mailto:|#)/i.test(target)) continue;
    const localPath = decodeURIComponent(target.split("#")[0]);
    if (!localPath) continue;
    checked += 1;
    try {
      await access(path.resolve(root, path.dirname(file), localPath));
    } catch {
      missing.push(`${file}: ${target}`);
    }
  }
}

if (missing.length) {
  console.error(`Missing documentation links:\n${missing.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Checked ${checked} local documentation links.`);
}
