import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const lock = JSON.parse(
  await readFile(path.join(root, "package-lock.json"), "utf8"),
);
const rootPackage = lock.packages?.[""] ?? {};

function packageName(packagePath) {
  const marker = "node_modules/";
  const index = packagePath.lastIndexOf(marker);
  return index < 0 ? "" : packagePath.slice(index + marker.length);
}

const packages = new Map();
for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
  if (!packagePath || !metadata.version) continue;
  const name = metadata.name || packageName(packagePath);
  if (!name) continue;
  if (!metadata.license) {
    throw new Error(`Missing license metadata for ${name}@${metadata.version}`);
  }
  const key = `${name}@${metadata.version}`;
  const existing = packages.get(key);
  const classification = metadata.dev
    ? "Development"
    : metadata.optional
      ? "Optional"
      : "Runtime";
  if (existing) {
    existing.classifications.add(classification);
  } else {
    packages.set(key, {
      name,
      version: metadata.version,
      license: metadata.license,
      classifications: new Set([classification]),
    });
  }
}

const sorted = [...packages.values()].sort((left, right) =>
  left.name.localeCompare(right.name) || left.version.localeCompare(right.version),
);
const directNames = new Set([
  ...Object.keys(rootPackage.dependencies ?? {}),
  ...Object.keys(rootPackage.devDependencies ?? {}),
]);
const direct = sorted.filter((entry) => directNames.has(entry.name));
const licenseCounts = sorted.reduce((counts, entry) => {
  counts.set(entry.license, (counts.get(entry.license) ?? 0) + 1);
  return counts;
}, new Map());

const rows = sorted
  .map(
    (entry) =>
      `| [${entry.name}](https://www.npmjs.com/package/${entry.name}) | ${entry.version} | ${entry.license} | ${[...entry.classifications].sort().join(", ")} |`,
  )
  .join("\n");
const directRows = direct
  .map(
    (entry) =>
      `| [${entry.name}](https://www.npmjs.com/package/${entry.name}) | ${entry.version} | ${entry.license} | ${rootPackage.devDependencies?.[entry.name] ? "Development" : "Runtime"} |`,
  )
  .join("\n");
const summary = [...licenseCounts.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([license, count]) => `- **${license}:** ${count} package version${count === 1 ? "" : "s"}`)
  .join("\n");

const output = `# Third-party software notices

React UI/UX Tool is **MIT © 2026 RA**. The packages below are separate works and
remain under their own licenses. This inventory is generated from the exact versions
in \`package-lock.json\`; do not edit the table by hand.

This file is an attribution and audit aid, not a replacement for an upstream license.
When packages are installed, their complete license texts and notices are available
inside their package directories. Before redistributing a modified bundle, review
those files and the applicable license terms.

## Direct dependencies

| Package | Version | License | Use |
| --- | --- | --- | --- |
${directRows}

## License summary

${summary}

SPDX identifiers link to standardized license texts at
[spdx.org/licenses](https://spdx.org/licenses/). Package links above and below point
to the corresponding npm records and upstream metadata.

## Complete locked-package inventory

| Package | Version | License | Lockfile classification |
| --- | --- | --- | --- |
${rows}

## Regenerating this file

Run \`npm run notices:generate\` after changing dependencies. CI and local validation
can use \`npm run notices:check\` to ensure this file still matches the lockfile.
`;

const target = path.join(root, "THIRD_PARTY_NOTICES.md");
if (process.argv.includes("--check")) {
  const current = await readFile(target, "utf8").catch(() => "");
  if (current !== output) {
    console.error("THIRD_PARTY_NOTICES.md is out of date. Run npm run notices:generate.");
    process.exitCode = 1;
  } else {
    console.log(`Verified ${sorted.length} locked package versions and their licenses.`);
  }
} else {
  await writeFile(target, output, "utf8");
  console.log(`Wrote notices for ${sorted.length} locked package versions.`);
}
