import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createProject } from "../src/templates/index.js";

const parentDirectory = await mkdtemp(path.join(os.tmpdir(), "uiux-next-fixture-"));
const { targetDirectory } = await createProject({ parentDirectory, name: "Next Studio fixture", framework: "next", template: "form", styling: "css-modules" });
await writeFile(path.join(targetDirectory, "next.config.mjs"), 'export default { basePath: "/studio-fixture" };\n');
const products = path.join(targetDirectory, "src", "app", "(shop)", "products", "[sku]");
await mkdir(products, { recursive: true });
await writeFile(path.join(products, "page.tsx"), `export default async function Product({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  return <h1>Product {sku}</h1>;
}
`);
const docs = path.join(targetDirectory, "src", "app", "docs", "[[...slug]]");
await mkdir(docs, { recursive: true });
await writeFile(path.join(docs, "page.tsx"), `export default async function Docs({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  return <h1>Docs {slug?.join("/") ?? "index"}</h1>;
}
`);
const legacy = path.join(targetDirectory, "src", "pages", "legacy");
await mkdir(legacy, { recursive: true });
await writeFile(path.join(legacy, "[sku].tsx"), `import type { GetServerSideProps } from 'next';
export const getServerSideProps: GetServerSideProps = async ({ params }) => ({ props: { sku: params?.sku } });
export default function Legacy({ sku }: { sku: string }) { return <h1>Legacy {sku}</h1>; }
`);
const args = ["install", "--ignore-scripts", "--no-audit", "--no-fund"];
const windows = process.platform === "win32";
const command = windows ? process.env.ComSpec || "cmd.exe" : "npm";
const result = spawnSync(command, windows ? ["/d", "/s", "/c", "npm", ...args] : args, { cwd: targetDirectory, stdio: "inherit", windowsHide: true });
if (result.error || result.status !== 0) throw new Error("Could not install the synthetic Next.js fixture.", { cause: result.error });
if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `UIUX_NEXT_RUNTIME_FIXTURE=${targetDirectory}\n`, "utf8");
console.log(targetDirectory);
