import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const run = promisify(execFile);
test("compatibility inventory is read-only and never marks discovery as validation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-compat-inventory-"));
  try {
    await mkdir(path.join(root, "src/views/aw"), { recursive: true });
    await writeFile(path.join(root, "package.json"), '{"name":"fixture","dependencies":{"react":"19"}}');
    const file = path.join(root, "src/views/aw/AW11.tsx");
    const source = 'export default function AW11({value,onChange}:{value?:string,onChange?:()=>void}){return <main><button className="safe" onClick={onChange}>{value}</button></main>}';
    await writeFile(file, source);
    const before = await readdir(root);
    const { stdout } = await run(process.execPath, ["--import", "tsx", "scripts/compat-inventory.ts", root], { cwd: process.cwd() });
    const result = JSON.parse(stdout);
    assert.ok(result.indexedComponents >= 1);
    assert.equal(result.businessModuleSourceFiles.aw, 1);
    assert.equal(result.validation.notTested, result.indexedComponents);
    assert.equal(result.validation.passed, 0);
    assert.ok(result.components.every((component: { validation: string }) => component.validation === "not-tested"));
    const component = result.components.find((item: { name: string }) => item.name === "AW11");
    assert.ok(component.dataPropertyNames.includes("value"));
    assert.ok(component.eventNames.includes("onChange"));
    assert.ok(component.observedStyleOrigins.includes("className"));
    assert.ok(!stdout.includes('"safe"'));
    assert.equal(await readFile(file, "utf8"), source);
    assert.deepEqual(await readdir(root), before);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
