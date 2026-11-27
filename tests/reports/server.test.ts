import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startStudio } from "../../src/server/index.js";

async function withStudio(
  run: (call: (route: string, body?: object) => Promise<{ status: number; data: any }>, base: string) => Promise<void>,
) {
  const recentDirectory = await mkdtemp(path.join(os.tmpdir(), "uiux-report-server-"));
  const reportDirectory = await mkdtemp(path.join(os.tmpdir(), "uiux-reports-"));
  const studio = await startStudio({ recentDirectory });
  try {
    const session = (await (await fetch(`${studio.url}/api/session`)).json()) as { token: string };
    const call = async (route: string, body?: object) => {
      const response = await fetch(`${studio.url}/api/reports/${route}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "content-type": "application/json",
          origin: studio.url,
          "x-uiux-token": session.token,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, data: await response.json() };
    };
    const rooted = await call("root", { path: reportDirectory });
    assert.equal(rooted.status, 200, JSON.stringify(rooted.data));
    await run(call, reportDirectory);
  } finally {
    await studio.close();
    await rm(recentDirectory, { recursive: true, force: true });
    await rm(reportDirectory, { recursive: true, force: true });
  }
}

test("report API creates, opens and saves a native report with hash conflicts", async () => {
  await withStudio(async (call, directory) => {
    const created = await call("create", {
      templateId: "invoice",
      file: "invoice.report.json",
    });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    assert.match(created.data.hash, /^[a-f0-9]{64}$/);
    assert.equal(created.data.document.kind, "react-uiux-report");

    const onDisk = await readFile(path.join(directory, "invoice.report.json"), "utf8");
    assert.match(onDisk, /"kind": "react-uiux-report"/);

    const duplicate = await call("create", {
      templateId: "invoice",
      file: "invoice.report.json",
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.data.code, "FILE_EXISTS");

    const opened = await call("open", { file: "invoice.report.json" });
    assert.equal(opened.status, 200);
    assert.equal(opened.data.hash, created.data.hash);

    const staleSave = await call("save", {
      file: "invoice.report.json",
      expectedHash: "0".repeat(64),
      document: opened.data.document,
    });
    assert.equal(staleSave.status, 409);
    assert.equal(staleSave.data.code, "CONFLICT");

    opened.data.document.title = "Invoice Desember";
    const saved = await call("save", {
      file: "invoice.report.json",
      expectedHash: opened.data.hash,
      document: opened.data.document,
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.notEqual(saved.data.hash, opened.data.hash);

    const reopened = await call("open", { file: "invoice.report.json" });
    assert.equal(reopened.data.document.title, "Invoice Desember");
  });
});

test("linked subreports resolve current data and reject missing files, cycles and changed folders", async () => {
  await withStudio(async (call, directory) => {
    const expectedRoot = await realpath(directory);
    const childName = "Rincian Ω.report.json";
    const childFile = "Dokumen 字/" + childName;
    const parentFile = "parent.report.json";
    const child = await call("create", { templateId: "blank", file: childName });
    assert.equal(child.status, 200, JSON.stringify(child.data));
    await mkdir(path.join(directory, "Dokumen 字"));
    await rename(path.join(directory, childName), path.join(directory, childFile));
    const parent = await call("create", { templateId: "blank", file: parentFile });
    const document = { ...parent.data.document, linkedReports: [childFile] };
    const request = { document, expectedRoot, file: parentFile };
    assert.equal((await call("save", { ...request, expectedHash: parent.data.hash })).status, 200);
    assert.deepEqual((await call("open", { file: parentFile })).data.document.linkedReports, [childFile]);
    const linked = child.data.document;
    linked.bands[0].elements.push({
      id: "latest-label", type: "text", box: { x: 0, y: 1, width: 60, height: 5 }, props: { text: "Live child changed" },
    });
    const saved = await call("save", { document: linked, expectedRoot, file: childFile, expectedHash: child.data.hash });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const preview = await call("preview", request);
    assert.equal(preview.status, 200, JSON.stringify(preview.data));
    assert.match(preview.data.html, /Live child changed/);
    const exported = await call("export", { ...request, format: "html" });
    assert.equal(exported.status, 200);
    assert.match(Buffer.from(exported.data.base64, "base64").toString(), /Live child changed/);
    assert.equal((await call("preview", { ...request, expectedRoot: "elsewhere" })).data.code, "REPORT_FOLDER_CHANGED");
    assert.equal((await call("preview", { ...request, document: { ...document, linkedReports: ["missing.report.json"] } })).status, 404);
    assert.equal((await call("save", { document: { ...linked, linkedReports: [parentFile] }, file: childFile, expectedHash: saved.data.hash })).status, 200);
    assert.equal((await call("preview", request)).data.code, "LINKED_REPORT_CYCLE");
  });
});

test("linked arguments override each child's bindings and formulas for preview and PDF only", async () => {
  await withStudio(async (call, directory) => {
    const expectedRoot = await realpath(directory);
    const leftFile = "left.report.json", rightFile = "right.report.json", file = "parent.report.json";
    const build = async (name: string, parent = false) => {
      const created = await call("create", { templateId: "blank", file: name });
      assert.equal(created.status, 200);
      const document = created.data.document;
      document.parameters = [{ id: "caption", type: "string", required: true, defaultValue: parent ? "Parent default" : "Child default" }];
      document.bands[0].elements.push(
        { id: parent ? "parent-bound" : "child-bound", type: "field",
          box: { x: 5, y: 2, width: 60, height: 8 }, props: {}, bindings: { path: "parameters.caption" } },
        { id: parent ? "parent-expression" : "child-expression", type: "field",
          box: { x: 5, y: 12, width: 65, height: 8 }, props: { expression: 'IF(parameters.caption == "Left only", "Left formula", "Other formula")' } },
      );
      const saved = await call("save", { file: name, expectedHash: created.data.hash, expectedRoot, document });
      assert.equal(saved.status, 200, JSON.stringify(saved.data));
      return { document, hash: saved.data.hash };
    };
    await build(leftFile);
    await build(rightFile);
    const childBytes = await readFile(path.join(directory, leftFile), "utf8");
    const parent = await build(file, true);
    const document = {
      ...parent.document, linkedReports: [leftFile, rightFile],
      linkedReportArguments: { [leftFile]: { caption: "Left only" }, [rightFile]: { caption: "Right only" } },
    };
    const data = { parameters: { caption: "Parent live", link_1_argument_1: "Collision avoided" } };
    const request = { file, expectedRoot, document, data };
    assert.equal((await call("save", { ...request, expectedHash: parent.hash })).status, 200);
    assert.deepEqual((await call("open", { file })).data.document.linkedReportArguments, document.linkedReportArguments);
    const preview = await call("preview", request);
    assert.equal(preview.status, 200, JSON.stringify(preview.data));
    const pdf = await call("export", { ...request, format: "pdf" });
    assert.equal(pdf.status, 200);
    for (const output of [preview.data.html, Buffer.from(pdf.data.base64, "base64").toString("latin1")]) {
      for (const marker of ["Parent live", "Left only", "Right only", "Left formula"]) assert.ok(output.includes(marker), marker);
      assert.ok(!output.includes("Collision avoided"));
    }
    const unknown = { ...document, linkedReportArguments: { [leftFile]: { extra: true } } };
    assert.equal((await call("preview", { ...request, document: unknown })).data.code, "INVALID_LINKED_REPORT");
    const wrongType = { ...document, linkedReportArguments: { [leftFile]: { caption: 42 } } };
    assert.match((await call("preview", { ...request, document: wrongType })).data.error, /must be string/);
    assert.equal(await readFile(path.join(directory, leftFile), "utf8"), childBytes);
  });
});

test("report API rejects traversal, non-report names and invalid documents", async () => {
  await withStudio(async (call) => {
    for (const file of ["../escape.report.json", "/etc/passwd.report.json", "notes.txt"]) {
      const response = await call("create", { templateId: "blank", file });
      assert.equal(response.status, 400, `expected rejection for ${file}`);
      assert.ok(
        ["INVALID_FILE_NAME", "UNSAFE_PATH"].includes(response.data.code),
        `unexpected code ${response.data.code}`,
      );
    }

    const invalid = await call("validate", {
      document: { kind: "react-uiux-report", schemaVersion: 1, bands: [] },
    });
    assert.equal(invalid.status, 200);
    assert.equal(invalid.data.ok, false);
    assert.ok(invalid.data.errors.length > 0);
  });
});

test("a native draft cannot save over an identical copy in a different folder", async () => {
  await withStudio(async (call, directory) => {
    const file = "invoice.report.json";
    const created = await call("create", { templateId: "invoice", file });
    assert.equal(created.status, 200);
    assert.equal(created.data.root, await realpath(directory));
    const originalPath = path.join(directory, file);
    const original = await readFile(originalPath, "utf8");
    const other = path.join(directory, "copy");
    await mkdir(other);
    await copyFile(originalPath, path.join(other, file));
    assert.equal((await call("root", { path: other })).status, 200);

    const save = {
      file,
      expectedHash: created.data.hash,
      expectedRoot: created.data.root,
      document: { ...created.data.document, title: "Edited original" },
    };
    const rejected = await call("save", save);
    assert.equal(rejected.status, 409);
    assert.equal(rejected.data.code, "REPORT_FOLDER_CHANGED");
    assert.equal(await readFile(originalPath, "utf8"), original);
    assert.equal(await readFile(path.join(other, file), "utf8"), original);

    assert.equal((await call("root", { path: directory })).status, 200);
    assert.equal((await call("save", save)).status, 200);
    assert.match(await readFile(originalPath, "utf8"), /Edited original/);
    assert.equal(await readFile(path.join(other, file), "utf8"), original);
  });
});

test("preview renders HTML and validation never writes files", async () => {
  await withStudio(async (call, directory) => {
    const created = await call("create", {
      templateId: "receipt",
      file: "receipt.report.json",
    });
    assert.equal(created.status, 200);

    const preview = await call("preview", { document: created.data.document });
    assert.equal(preview.status, 200);
    assert.match(preview.data.html, /@page/);
    assert.match(preview.data.html, /BUKTI PEMBAYARAN/);

    const files = await readFile(path.join(directory, "receipt.report.json"));
    assert.ok(files.length > 0);
  });
});

test("concurrent creates never overwrite an existing report", async () => {
  await withStudio(async (call) => {
    const body = { templateId: "blank", file: "race.report.json" };
    const [first, second] = await Promise.all([call("create", body), call("create", body)]);
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [200, 409]);
  });
});

test("concurrent saves with the same base hash accept exactly one writer", async () => {
  await withStudio(async (call) => {
    const created = await call("create", { templateId: "invoice", file: "race-save.report.json" });
    assert.equal(created.status, 200);
    const base = created.data;
    const first = { ...base.document, title: "Writer A" };
    const second = { ...base.document, title: "Writer B" };
    const [a, b] = await Promise.all([
      call("save", { file: "race-save.report.json", expectedHash: base.hash, document: first }),
      call("save", { file: "race-save.report.json", expectedHash: base.hash, document: second }),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const reopened = await call("open", { file: "race-save.report.json" });
    assert.ok(["Writer A", "Writer B"].includes(reopened.data.document.title));
  });
});

test("report routes require the session capability", async () => {
  const recentDirectory = await mkdtemp(path.join(os.tmpdir(), "uiux-report-auth-"));
  const studio = await startStudio({ recentDirectory });
  try {
    const response = await fetch(`${studio.url}/api/reports/state`);
    assert.equal(response.status, 401);
  } finally {
    await studio.close();
    await rm(recentDirectory, { recursive: true, force: true });
  }
});

test("report folder restores after restart and falls back when it goes missing", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "uiux-report-preference-"));
  const recentDirectory = path.join(directory, "settings");
  const defaultReportDirectory = path.join(directory, "Documents", "React UIUX Reports");
  const selected = path.join(directory, "other reports");
  const start = async () => {
    const studio = await startStudio({ recentDirectory, defaultReportDirectory });
    const { token } = await (await fetch(`${studio.url}/api/session`)).json() as { token: string };
    const call = async (route: string, body?: object) => {
      const response = await fetch(`${studio.url}/api/reports/${route}`, {
        headers: { origin: studio.url, "x-uiux-token": token, "content-type": "application/json" },
        ...(body && { method: "POST", body: JSON.stringify(body) }),
      });
      assert.equal(response.status, 200);
      return response.json();
    };
    return { close: studio.close, call };
  };
  let studio = await start();
  try {
    assert.equal((await studio.call("state")).root, null);
    const first = await studio.call("root", { useDefault: true });
    assert.equal(first.root, await realpath(defaultReportDirectory));
    assert.equal(first.source, "default");
    await mkdir(selected);
    const selectedRoot = await realpath(selected);
    assert.equal((await studio.call("root", { path: selected })).root, selectedRoot);
    assert.equal((await studio.call("root", { useDefault: true })).root, selectedRoot);
    await studio.close();

    studio = await start();
    assert.equal((await studio.call("state")).root, selectedRoot);
    await rename(selected, path.join(directory, "moved reports"));
    assert.equal((await studio.call("state")).root, null);
    assert.equal((await studio.call("root", { useDefault: true })).root, first.root);
    assert.deepEqual((await studio.call("browse")).entries, []);
  } finally {
    await studio.close();
    await rm(directory, { recursive: true, force: true });
  }
});
