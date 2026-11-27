import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rmdir,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createConnection } from "node:net";
import { startStudio } from "../src/server/index.js";
import { designModulePath } from "../src/server/preview.js";
import { vscodeSourceUrl } from "../studio/src/source-location.js";

test("VS Code source handoff escapes spaces and Unicode and rejects parent paths", () => {
  assert.equal(vscodeSourceUrl("C:\\Workspace\\Report Ω", "src/表.tsx", 42),
    "vscode://file/C:/Workspace/Report%20%CE%A9/src/%E8%A1%A8.tsx:42:1");
  assert.equal(vscodeSourceUrl("/local/Blank Project", "Dockerfile", 0), "vscode://file/local/Blank%20Project/Dockerfile");
  assert.equal(vscodeSourceUrl("C:\\Workspace", "..\\external.tsx", 1), undefined);
});

test("design preview uses Vite-style module IDs on Windows and Unix", () => {
  assert.equal(designModulePath('C:\\Users\\tester\\project'), 'C:/Users/tester/project/__uiux_design.jsx');
  assert.equal(designModulePath('/tmp/project/'), '/tmp/project/__uiux_design.jsx');
});

test("controller draft keeps source unchanged until save and retains it after a conflict", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-draft-"));
  try {
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "draft", dependencies: { react: "19", vite: "7" } }));
    const file = path.join(root, "src/App.jsx");
    const original = "// before\r\nexport default function App(){return <main><button>Old</button></main>}\r\n// after\r\n";
    await writeFile(file, original);
    await withStudio(async (base) => {
      const { token } = await (await fetch(`${base}/api/session`)).json() as { token: string };
      const headers = { "content-type": "application/json", origin: base, "x-uiux-token": token };
      const post = async (endpoint: string, data: object) => {
        const response = await fetch(`${base}/api/${endpoint}`, { method: "POST", headers, body: JSON.stringify(data) });
        return { status: response.status, value: await response.json() as any };
      };
      const opened = await post("open", { path: root });
      const expectedProject = opened.value.projectRoot;
      const button = opened.value.elements.find((element: any) => element.tag === "button");
      const edit = await post("draft/edit", { expectedProject, file: button.source.file, elementId: button.id, expectedHash: button.hash, operation: "text", value: "New", scope: "instance" });
      assert.equal(edit.status, 200, JSON.stringify(edit.value));
      assert.equal(await readFile(file, "utf8"), original);
      assert.equal((await post("open", { path: root })).status, 200);
      const otherProject = await mkdtemp(path.join(os.tmpdir(), "uiux-other-project-"));
      assert.notEqual((await post("open", { path: otherProject })).status, 200);
      await rm(otherProject, { recursive: true, force: true });
      assert.equal((await post("draft/undo", { expectedProject })).value.count, 0);
      assert.equal((await post("draft/redo", { expectedProject })).value.count, 1);
      const overlapping = original.replace(">Old<", ">External<");
      await writeFile(file, overlapping);
      assert.equal((await post("draft/commit", { expectedProject, approved: true })).status, 409);
      assert.equal(await readFile(file, "utf8"), overlapping);
      await writeFile(file, original.replace("// before", "// external header").replace("// after", "// external footer"));
      const saved = await post("draft/commit", { expectedProject, approved: true });
      assert.equal(saved.status, 200);
      assert.deepEqual(saved.value.rebased, ["src/App.jsx"]);
      const combined = original.replace("// before", "// external header")
        .replace(">Old<", ">New<").replace("// after", "// external footer");
      assert.equal(await readFile(file, "utf8"), combined);
      const recentButton = saved.value.analysis.elements.find((element: any) => element.tag === "button");
      const identical = await post("draft/edit", { expectedProject, file: recentButton.source.file, elementId: recentButton.id,
        expectedHash: recentButton.hash, operation: "text", value: "Agreed", scope: "instance" });
      assert.equal(identical.status, 200, JSON.stringify(identical.value));
      const separateDisk = "// external prefix\r\n" + combined.replace(">New<", ">Agreed<") + "// external EOF";
      await writeFile(file, separateDisk);
      const preservedTime = new Date("2025-01-01T00:00:00Z");
      await utimes(file, preservedTime, preservedTime);
      const beforeCommit = await stat(file);
      const reconciled = await post("draft/commit", { expectedProject, approved: true });
      assert.equal(reconciled.status, 200, JSON.stringify(reconciled.value));
      assert.equal(reconciled.value.count, 0);
      assert.equal(await readFile(file, "utf8"), separateDisk);
      assert.equal((await stat(file)).mtimeMs, beforeCommit.mtimeMs);
    });
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
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

test("discard removes the recoverable draft across controller restarts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-discard-restart-"));
  const draftDirectory = path.join(root, "snapshots");
  const project = path.join(root, "project");
  const file = path.join(project, "src/App.jsx");
  const original = "export default function App(){return <button>Original</button>}";
  await mkdir(path.dirname(file), { recursive: true });
  await mkdir(draftDirectory);
  await writeFile(path.join(project, "package.json"), JSON.stringify({ name: "discard-restart", dependencies: { react: "19", vite: "8" } }));
  await writeFile(file, original);
  const secondFile = path.join(project, "src/Second.jsx");
  await writeFile(secondFile, "export default function Second(){return <p>Second original</p>}");
  const withProject = async (run: (post: (endpoint: string, data?: object, status?: number) => Promise<any>, opened: any) => Promise<void>) => {
    const studio = await startStudio({ draftDirectory, recentDirectory: path.join(root, "recent") });
    try {
      const { token } = await (await fetch(`${studio.url}/api/session`)).json() as { token: string };
      const headers = { "content-type": "application/json", origin: studio.url, "x-uiux-token": token };
      const send = (endpoint: string, data: object) => fetch(`${studio.url}/api/${endpoint}`, { method: "POST", headers, body: JSON.stringify(data) });
      const opened = await (await send("open", { path: project })).json() as any;
      assert.ok(opened.projectRoot);
      await run(async (endpoint, data = {}, status = 200) => {
        const response = await send(endpoint, { ...data, expectedProject: opened.projectRoot });
        const value = await response.json();
        assert.equal(response.status, status, JSON.stringify(value));
        return value;
      }, opened);
    } finally {
      await studio.close();
    }
  };
  try {
    await withProject(async (post, opened) => {
      const button = opened.elements.find((element: any) => element.tag === "button");
      const edited = await post("draft/edit", { file: button.source.file, elementId: button.id, expectedHash: button.hash, operation: "text", value: "Draft", scope: "instance" });
      assert.equal(edited.count, 1);
      assert.deepEqual(edited.files, ["src/App.jsx"]);
    });
    await withProject(async post => {
      const recovered = await post("draft/state");
      assert.equal(recovered.count, 1);
      assert.deepEqual(recovered.history.applied.map(({ action, file, object, anchor }: any) => ({ action, file, object, line: anchor.line })),
        [{ action: "text", file: "src/App.jsx", object: "button", line: 1 }]);
      const [snapshotName] = await readdir(draftDirectory);
      const snapshot = path.join(draftDirectory, snapshotName!);
      const savedSnapshot = snapshot + ".saved";
      await rename(snapshot, savedSnapshot);
      await mkdir(snapshot);
      assert.match((await post("draft/discard", {}, 400)).error, /Could not remove the local draft snapshot/);
      assert.equal((await post("draft/state")).count, 1);
      await rmdir(snapshot);
      await rename(savedSnapshot, snapshot);
      await post("draft/discard");
      assert.deepEqual(await post("draft/state"), { open: false });
    });
    await withProject(async post => assert.deepEqual(await post("draft/state"), { open: false }));
    assert.deepEqual(await readdir(draftDirectory), []);
    assert.equal(await readFile(file, "utf8"), original);

    await withProject(async (post, opened) => {
      for (const [tag, value] of [["button", "Saved from one tab"], ["p", "Other tab stays pending"]]) {
        const element = opened.elements.find((entry: any) => entry.tag === tag);
        await post("draft/edit", { file: element.source.file, elementId: element.id, expectedHash: element.hash,
          operation: "text", value, scope: tag === "p" ? "shared" : "instance", confirmScope: tag === "p" });
      }
      const saved = await post("draft/commit", { approved: true, file: "src/App.jsx" });
      assert.deepEqual(saved.files, ["src/Second.jsx"]);
      assert.equal(saved.count, 1);
      assert.match(await readFile(file, "utf8"), /Saved from one tab/);
      assert.match(await readFile(secondFile, "utf8"), /Second original/);
    });
    await withProject(async (post, opened) => {
      const recovered = await post("draft/state");
      assert.deepEqual(recovered.files, ["src/Second.jsx"]);
      const button = opened.elements.find((entry: any) => entry.tag === "button");
      await post("draft/edit", { file: button.source.file, elementId: button.id, expectedHash: button.hash,
        operation: "text", value: "Discard me", scope: "instance" });
      const discarded = await post("draft/discard", { file: "src/App.jsx" });
      assert.deepEqual(discarded.files, ["src/Second.jsx"]);
      assert.equal(discarded.count, 1);
    });
    await withProject(async post => {
      assert.deepEqual((await post("draft/state")).files, ["src/Second.jsx"]);
      assert.match(await readFile(file, "utf8"), /Saved from one tab/);
      await post("draft/discard");
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


test("runProjectBuild runs the declared build script and reports failure", async () => {
  const { runProjectBuild } = await import("../src/server/build.js");
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-build-"));
  try {
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "build-fixture", scripts: { build: "node -e \"require('fs').writeFileSync('built.txt','ok')\"" } }),
    );
    const ok = await runProjectBuild(root);
    assert.equal(ok.ok, true);
    assert.equal(await readFile(path.join(root, "built.txt"), "utf8"), "ok");

    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "build-fixture", scripts: { build: "node -e \"process.exit(3)\"" } }));
    const failed = await runProjectBuild(root);
    assert.equal(failed.ok, false);
    assert.equal(failed.code, 3);

    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "build-fixture", scripts: {} }));
    await assert.rejects(() => runProjectBuild(root), /no npm build script/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
