import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeProject, parseViteAliases } from "../src/engine/index.js";

async function project(
  importPath: string,
  configuration: Record<string, string>,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-config-compat-"));
  await mkdir(path.join(root, "src/components/Button"), { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "config-compat",
      dependencies: { react: "19", vite: "8" },
      scripts: { dev: "vite" },
    }),
  );
  await writeFile(
    path.join(root, "src/App.jsx"),
    `import {Button} from '${importPath}';export default function App(){return <Button/>}`,
  );
  await writeFile(
    path.join(root, "src/components/Button/index.jsx"),
    "export function Button(){return <button>Configured</button>}",
  );
  for (const [file, source] of Object.entries(configuration)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), source);
  }
  return { root, cleanup: () => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) };
}

test("jsconfig baseUrl and multiple path targets resolve the first existing module", async () => {
  const fixture = await project("@/components/Button", {
    "jsconfig.json": `{
      // JavaScript projects commonly use this instead of tsconfig.
      "compilerOptions": {
        "baseUrl": "src",
        "paths": { "@/*": ["missing/*", "*"] },
      },
    }`,
  });
  try {
    const report = await analyzeProject(fixture.root);
    assert.deepEqual(report.detected.aliases, {
      "@/*": ["src/missing/*", "src/*"],
    });
    assert.equal(
      report.elements.find((element) => element.tag === "Button")?.componentId,
      "src/components/Button/index.jsx#Button",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("referenced tsconfig app files contribute aliases", async () => {
  const fixture = await project("~/components/Button", {
    "tsconfig.json": JSON.stringify({
      files: [],
      references: [{ path: "./tsconfig.app.json" }],
    }),
    "tsconfig.app.json": JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: { "~/*": ["src/*"] },
      },
    }),
  });
  try {
    const report = await analyzeProject(fixture.root);
    assert.deepEqual(report.detected.aliases, { "~/*": ["src/*"] });
    assert.equal(
      report.elements.find((element) => element.tag === "Button")?.componentId,
      "src/components/Button/index.jsx#Button",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("Vite object, array, CommonJS and ESM URL alias forms are parsed statically", () => {
  assert.deepEqual(
    parseViteAliases(
      "vite.config.js",
      `import path from "path";
       const sourceRoot = path.resolve(__dirname, "src");
       export default { resolve: { alias: { "@": sourceRoot } } };
       throw new Error("must never execute");`,
    ),
    { "@": ["src"] },
  );
  assert.deepEqual(
    parseViteAliases(
      "vite.config.mjs",
      `import { fileURLToPath } from "node:url";
       const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));
       export default { resolve: { alias: [{ find: "~", replacement: sourceRoot }] } };`,
    ),
    { "~": ["src"] },
  );
  assert.deepEqual(
    parseViteAliases(
      "vite.config.ts",
      `import { resolve } from "node:path";
       export default { resolve: { alias: [{ find: "#", replacement: resolve(import.meta.dirname, "src") }] } };`,
    ),
    { "#": ["src"] },
  );
});

test("dynamic and escaping aliases are ignored instead of guessed", () => {
  assert.deepEqual(
    parseViteAliases(
      "vite.config.ts",
      `export default {resolve:{alias:{
        "@": process.env.SOURCE_ROOT,
        "~": path.resolve(__dirname, "../outside")
      }}}`,
    ),
    {},
  );
});
