import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
