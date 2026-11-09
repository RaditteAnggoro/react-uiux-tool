import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createConnection } from "node:net";
import { startStudio } from "../src/server/index.js";
import { designModulePath } from "../src/server/preview.js";

test("design preview uses Vite-style module IDs on Windows and Unix", () => {
  assert.equal(designModulePath('C:\\Users\\tester\\project'), 'C:/Users/tester/project/__uiux_design.jsx');
  assert.equal(designModulePath('/tmp/project/'), '/tmp/project/__uiux_design.jsx');
});

test("successive insert, prop and event edits retain prior writes on success and conflict", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-sequential-edits-"));
  try {
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "sequential-edits", dependencies: { react: "^19.0.0", vite: "^7.0.0" } }));
    const sourcePath = path.join(root, "src/App.jsx");
    await writeFile(sourcePath, "export default function App(){const handleSearch=()=>{};return <main><form><span>Keep</span></form></main>}");
    await withStudio(async (base) => {
      const { token } = await (await fetch(`${base}/api/session`)).json() as { token: string };
      const headers = { "content-type": "application/json", origin: base, "x-uiux-token": token };
      const post = async (endpoint: string, data: object) => {
        const response = await fetch(`${base}/api/${endpoint}`, { method: "POST", headers, body: JSON.stringify(data) });
        return { status: response.status, value: await response.json() as any };
      };
      const opened = await post("open", { path: root });
      assert.equal(opened.status, 200);
      const project = opened.value.projectRoot;
      const form = opened.value.elements.find((element: any) => element.tag === "form");
      assert.ok(form);
      const inserted = await post("edit", { expectedProject: project, file: form.source.file, elementId: form.id, expectedHash: form.hash, operation: "insert", name: "p", value: "New paragraph", position: "inside", scope: "instance" });
      assert.equal(inserted.status, 200, JSON.stringify(inserted.value));
      const paragraph = inserted.value.analysis.elements.find((element: any) => element.tag === "p");
      assert.ok(paragraph);
      const afterInsert = await readFile(sourcePath, "utf8");
      assert.match(afterInsert, /<p>New paragraph<\/p>/);
      const prop = await post("edit", { expectedProject: project, file: paragraph.source.file, elementId: paragraph.id, expectedHash: paragraph.hash, operation: "prop", name: "title", value: "Example", scope: "instance" });
      assert.equal(prop.status, 200, JSON.stringify(prop.value));
      const updated = prop.value.analysis.elements.find((element: any) => element.tag === "p");
      const event = await post("edit", { expectedProject: project, file: updated.source.file, elementId: updated.id, expectedHash: updated.hash, operation: "event", name: "onClick", value: "handleSearch", scope: "instance" });
      assert.equal(event.status, 200, JSON.stringify(event.value));
      const afterEvent = await readFile(sourcePath, "utf8");
      assert.match(afterEvent, /<p[^>]*title="Example"[^>]*>New paragraph<\/p>/);
      assert.match(afterEvent, /onClick=\{handleSearch\}/);
      assert.match(afterEvent, /<span>Keep<\/span>/);
      const stale = await post("edit", { expectedProject: project, file: paragraph.source.file, elementId: paragraph.id, expectedHash: paragraph.hash, operation: "prop", name: "title", value: "Stale", scope: "instance" });
      assert.notEqual(stale.status, 200);
      assert.equal(await readFile(sourcePath, "utf8"), afterEvent);
    });
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

async function withStudio(run: (base: string) => Promise<void>) {
  const recentDirectory = await mkdtemp(
    path.join(os.tmpdir(), "uiux-server-test-"),
  );
  const studio = await startStudio({ recentDirectory });
  try {
    await run(studio.url);
  } finally {
    await studio.close();
    await rm(recentDirectory, { recursive: true, force: true });
  }
}

test("controller enforces same-origin capability and completes reviewed demo apply/undo", async () => {
  await withStudio(async (base) => {
    const sessionResponse = await fetch(`${base}/api/session`);
    assert.equal(sessionResponse.status, 200);
    const session = (await sessionResponse.json()) as { token: string };
    assert.match(session.token, /^[a-f0-9]{64}$/);

    assert.equal((await fetch(`${base}/api/status`)).status, 401);
    assert.equal(
      (
        await fetch(`${base}/api/session`, {
          headers: { Origin: "https://attacker.invalid" },
        })
      ).status,
      403,
    );

    let expectedProject = "";
    let expectedCheckpoint = "";
    const call = async (endpoint: string, data: object) => {
      const response = await fetch(`${base}/api/${endpoint}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: base,
          "x-uiux-token": session.token,
        },
        body: JSON.stringify({ ...data, expectedProject, expectedCheckpoint }),
      });
      const result = (await response.json()) as any;
      assert.equal(
        response.status,
        200,
        `${endpoint}: ${JSON.stringify(result)}`,
      );
      if (endpoint === "demo" || endpoint === "open") expectedProject = result.projectRoot;
      if (result.checkpoint?.id) expectedCheckpoint = result.checkpoint.id;
      return result;
    };

    const report = await call("demo", {});
    const treeHeaders = { "x-uiux-token": session.token };
    const rootTreeResponse = await fetch(`${base}/api/tree`, {
      headers: treeHeaders,
    });
    assert.equal(rootTreeResponse.status, 200);
    const rootTree = (await rootTreeResponse.json()) as {
      entries: { name: string; kind: string }[];
    };
    assert.ok(
      rootTree.entries.some(
        (entry) => entry.name === "src" && entry.kind === "directory",
      ),
      "tree starts at the real project root",
    );
    assert.ok(
      rootTree.entries.some((entry) => entry.name === "package.json"),
      "root source files are browsable",
    );
    const srcTree = (await (
      await fetch(`${base}/api/tree?path=src`, { headers: treeHeaders })
    ).json()) as { entries: { name: string }[] };
    assert.ok(
      srcTree.entries.some((entry) => entry.name === "App.tsx"),
      "a directory is loaded only when requested",
    );
    assert.equal(
      (await fetch(`${base}/api/tree?path=..`, { headers: treeHeaders }))
        .status,
      400,
      "project traversal is rejected",
    );
    const button = report.elements.find(
      (element: any) =>
        element.tag === "button" && element.text?.includes("Create project"),
    );
    assert.ok(button, "demo exposes the source-mapped static button");
    const sourcePath = path.join(report.projectRoot, button.source.file);
    const original = await readFile(sourcePath, "utf8");

    const patch = await call("patch", {
      file: button.source.file,
      elementId: button.id,
      expectedHash: button.hash,
      operation: "text",
      value: "Create workspace",
      scope: "instance",
    });
    assert.equal(
      await readFile(sourcePath, "utf8"),
      original,
      "staging does not write source",
    );
    assert.match(patch.diff, /Create workspace/);
    assert.match(patch.after, /onClick=/, "event handler is preserved");

    const preview = await call("preview/start", { approved: true });
    assert.match(preview.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    const previewHtml = await (await fetch(preview.url)).text();
    assert.match(previewHtml, /__uiux_bridge\.js/);

    const applied = await call("apply", { patchId: patch.id, approved: true });
    assert.equal(applied.checkpoint.file, button.source.file);
    assert.match(await readFile(sourcePath, "utf8"), /Create workspace/);
    assert.match(await readFile(sourcePath, "utf8"), /onClick=/);

    const staleUndo = await fetch(`${base}/api/undo`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, "x-uiux-token": session.token },
      body: JSON.stringify({ approved: true, expectedProject, expectedCheckpoint: "stale-checkpoint" }),
    });
    assert.equal(staleUndo.status, 409);
    assert.match(await readFile(sourcePath, "utf8"), /Create workspace/);
    const staleProject = await fetch(`${base}/api/undo`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base, "x-uiux-token": session.token },
      body: JSON.stringify({ approved: true, expectedProject: "/different/project", expectedCheckpoint }),
    });
    assert.equal(staleProject.status, 409);
    assert.match(await readFile(sourcePath, "utf8"), /Create workspace/);

    await call("undo", { approved: true });
    assert.equal(await readFile(sourcePath, "utf8"), original);

    const direct = await call("edit", {
      file: button.source.file,
      elementId: button.id,
      expectedHash: button.hash,
      operation: "text",
      value: "Create directly",
      scope: "instance",
    });
    assert.match(direct.patch.diff, /Create directly/);
    assert.match(await readFile(sourcePath, "utf8"), /Create directly/);
    await call("undo", { approved: true });
    assert.equal(await readFile(sourcePath, "utf8"), original);
  });
});

test("controller rejects mutation without explicit approval and oversized input", async () => {
  await withStudio(async (base) => {
    const session = (await (await fetch(`${base}/api/session`)).json()) as {
      token: string;
    };
    const headers = {
      "content-type": "application/json",
      origin: base,
      "x-uiux-token": session.token,
    };
    const demo = await fetch(`${base}/api/demo`, {
      method: "POST",
      headers,
      body: "{}",
    });
    assert.equal(demo.status, 200);

    const preview = await fetch(`${base}/api/preview/start`, {
      method: "POST",
      headers,
      body: "{}",
    });
    assert.equal(preview.status, 400);
    assert.equal(((await preview.json()) as any).code, "APPROVAL_REQUIRED");

    const oversized = await fetch(`${base}/api/open`, {
      method: "POST",
      headers,
      body: JSON.stringify({ path: "x".repeat(140_000) }),
    });
    assert.equal(oversized.status, 400);
  });
});

test("concurrent requests explain that the rejected action must be retried", async () => {
  await withStudio(async (base) => {
    const { token } = await (await fetch(`${base}/api/session`)).json() as { token: string };
    const headers = { "content-type": "application/json", origin: base, "x-uiux-token": token };
    const responses = await Promise.all(Array.from({ length: 6 }, () => fetch(`${base}/api/demo`, { method: "POST", headers, body: "{}" })));
    const rejected = responses.filter((response) => response.status === 409);
    assert.ok(rejected.length > 0);
    for (const response of rejected) {
      const value = await response.json() as { code: string; error: string };
      assert.equal(value.code, "BUSY");
      assert.match(value.error, /not performed.*wait.*repeat/i);
    }
    assert.equal(responses.filter((response) => response.status === 200).length, 1);
  });
});

test("controller contains malformed request targets and serves guide dependencies", async () => {
  await withStudio(async (base) => {
    const endpoint = new URL(base);
    const rawResponse = await new Promise<string>((resolve, reject) => {
      const socket = createConnection(Number(endpoint.port), endpoint.hostname);
      let response = "";
      socket.setEncoding("utf8");
      socket.once("error", reject);
      socket.on("data", (chunk) => {
        response += chunk;
      });
      socket.on("end", () => resolve(response));
      socket.once("connect", () => {
        socket.end(
          `GET http://% HTTP/1.1\r\nHost: ${endpoint.host}\r\nConnection: close\r\n\r\n`,
        );
      });
    });
    assert.match(rawResponse, /^HTTP\/1\.1 400 /);
    assert.equal(
      (await fetch(`${base}/api/session`)).status,
      200,
      "server remains available",
    );
    const security = await fetch(`${base}/SECURITY.md`);
    assert.equal(security.status, 200);
    assert.match(await security.text(), /Security/i);
    assert.equal((await fetch(`${base}/README.md`)).status, 200);
    assert.equal((await fetch(`${base}/README.id.md`)).status, 200);
    assert.equal((await fetch(`${base}/LICENSE`)).status, 200);
    assert.equal((await fetch(`${base}/NOTICE.md`)).status, 200);
    assert.equal((await fetch(`${base}/INSPIRATION.md`)).status, 200);
    assert.equal((await fetch(`${base}/THIRD_PARTY_NOTICES.md`)).status, 200);
  });
});

test("approved preview safely resolves tsconfig and static Vite aliases inside project root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-alias-preview-"));
  try {
    await mkdir(path.join(root, "src/components"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "alias-preview",
        dependencies: { react: "19", vite: "8" },
      }),
    );
    await writeFile(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@/*": ["missing/*", "src/*"] },
        },
      }),
    );
    await writeFile(
      path.join(root, "vite.config.js"),
      "import path from 'path';export default {resolve:{alias:{'#':path.resolve(__dirname,'src')}}};",
    );
    await writeFile(
      path.join(root, "index.html"),
      '<div id="root"></div><script type="module" src="/src/main.tsx"></script>',
    );
    await writeFile(
      path.join(root, "src/main.tsx"),
      "import React from 'react';import{createRoot}from'react-dom/client';import App from './App';createRoot(document.getElementById('root')!).render(<App/>);",
    );
    await writeFile(
      path.join(root, "src/App.tsx"),
      "import {Button} from '@/components/Button';import {Other} from '#/components/Other';export default function App(){return <main><Button/><Other/></main>}",
    );
    await writeFile(
      path.join(root, "src/components/Button.tsx"),
      "export function Button(){return <button>Aliased</button>}",
    );
    await writeFile(
      path.join(root, "src/components/Other.tsx"),
      "export function Other(){return <p>Vite alias</p>}",
    );
    await withStudio(async (base) => {
      const session = (await (await fetch(`${base}/api/session`)).json()) as {
        token: string;
      };
      const headers = {
        "content-type": "application/json",
        origin: base,
        "x-uiux-token": session.token,
      };
      const call = async (endpoint: string, data: object) => {
        const response = await fetch(`${base}/api/${endpoint}`, {
          method: "POST",
          headers,
          body: JSON.stringify(data),
        });
        const result = (await response.json()) as any;
        assert.equal(
          response.status,
          200,
          `${endpoint}: ${JSON.stringify(result)}`,
        );
        return result;
      };
      await call("open", { path: root });
      const preview = await call("preview/start", { approved: true });
      const transformed = await fetch(`${preview.url}/src/App.tsx`);
      assert.equal(transformed.status, 200);
      const transformedSource = await transformed.text();
      assert.match(transformedSource, /src\/components\/Button\.tsx/);
      assert.match(transformedSource, /src\/components\/Other\.tsx/);
      assert.equal(
        (await readdir(root)).includes("node_modules"),
        false,
        "controlled preview cache stays outside project",
      );
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
