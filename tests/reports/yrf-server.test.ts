import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, copyFile, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startStudio } from "../../src/server/index.js";

async function withYrf(run: (call: (route: string, body: object) => Promise<{ status: number; data: any }>, file: string) => Promise<void>) {
  const recent = await mkdtemp(path.join(os.tmpdir(), "uiux-yrf-"));
  const dir = await mkdtemp(path.join(os.tmpdir(), "uiux-yrf-files-"));
  const file = path.join(dir, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  const studio = await startStudio({ recentDirectory: recent });
  try {
    const session = (await (await fetch(`${studio.url}/api/session`)).json()) as { token: string };
    const call = async (route: string, body: object) => {
      const response = await fetch(`${studio.url}/api/reports/${route}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: studio.url,
          "x-uiux-token": session.token,
        },
        body: JSON.stringify(body),
      });
      return { status: response.status, data: (await response.json()) as any };
    };
    await run(call, file);
  } finally {
    await studio.close();
    await rm(recent, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
}

test("yrf open inspects, patch previews, save-copy preserves the source", async () => {
  await withYrf(async (call, file) => {
    const opened = await call("yrf/open", { path: file });
    assert.equal(opened.status, 200, JSON.stringify(opened.data));
    assert.equal(opened.data.inspection.pages.length, 1);
    assert.equal(opened.data.inspection.objectCount, 5);
    assert.match(opened.data.source, /"waiReportForm"/);
    assert.match(opened.data.source, /"layout"/);
    const original = await readFile(file, "utf8");

    const patched = await call("yrf/patch", {
      path: file,
      expectedHash: opened.data.hash,
      objectPath: "layout.pages[0].bands[0].objects[0].caption",
      expectedCaption: "Kop Halaman",
      caption: "Kop Halaman Baru",
    });
    assert.equal(patched.status, 200, JSON.stringify(patched.data));
    assert.equal(patched.data.changes[0].after, "Kop Halaman Baru");
    assert.equal(await readFile(file, "utf8"), original, "patch preview must not write");

    const saved = await call("yrf/save-copy", {
      path: file,
      expectedHash: opened.data.hash,
      objectPath: "layout.pages[0].bands[0].objects[0].caption",
      expectedCaption: "Kop Halaman",
      caption: "Kop Halaman Baru",
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.match(saved.data.file, /sample\.edited\.yrf$/);
    const copy = await readFile(saved.data.file, "utf8");
    assert.match(copy, /Kop Halaman Baru/);
    assert.equal(await readFile(file, "utf8"), original, "original stays byte-identical");
  });
});

test("in-place YRF save keeps path, creates no backup and rejects stale edits", async () => {
  await withYrf(async (call, file) => {
    const original = await readFile(file, "utf8");
    const unopened = await call("yrf/save", { path: file, expectedHash: "0".repeat(64), approved: true, changes: [] });
    assert.equal(unopened.status, 403);
    assert.equal(unopened.data.code, "YRF_NOT_OPEN");
    const opened = await call("yrf/open", { path: file });
    const request = { path: file, expectedHash: opened.data.hash, approved: true, changes: [{ objectPath: "layout.pages[0].bands[0].objects[0]", field: "caption", expected: "Kop Halaman", value: "Updated" }] };
    const withoutApproval = await call("yrf/save", { ...request, approved: false });
    assert.equal(withoutApproval.status, 403);
    assert.equal(await readFile(file, "utf8"), original);
    const saved = await call("yrf/save", request);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.file, await (await import("node:fs/promises")).realpath(file));
    assert.equal(saved.data.backup, undefined);
    assert.match(await readFile(file, "utf8"), /Updated/);
    const stale = await call("yrf/save", request);
    assert.equal(stale.status, 409);
    assert.match(await readFile(file, "utf8"), /Updated/);
    const again = await call("yrf/save", { ...request, expectedHash: saved.data.hash, changes: [{ ...request.changes[0], expected: "Updated", value: "Second update" }] });
    assert.equal(again.status, 200, JSON.stringify(again.data));
    assert.equal(again.data.backup, undefined);
    assert.deepEqual((await readdir(path.dirname(file))).filter((name) => name.endsWith(".yrf")), ["sample.yrf"]);
  });
});

test("concurrent in-place YRF saves cannot silently overwrite one another", async () => {
  await withYrf(async (call, file) => {
    if (process.platform !== "win32") await chmod(file, 0o751);
    const opened = await call("yrf/open", { path: file });
    const request = (value: string) => ({ path: file, expectedHash: opened.data.hash, approved: true, changes: [{ objectPath: "layout.pages[0].bands[0].objects[0]", field: "caption", expected: "Kop Halaman", value }] });
    const results = await Promise.all([call("yrf/save", request("First")), call("yrf/save", request("Second"))]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    const saved = results.find((result) => result.status === 200)!;
    assert.equal(await readFile(file, "utf8"), saved.data.source);
    if (process.platform !== "win32") assert.equal((await stat(file)).mode & 0o777, 0o751);
  });
});

test("yrf creation stays blocked and unsafe paths are rejected", async () => {
  await withYrf(async (call) => {
    const created = await call("yrf/create", { path: "/tmp/new.yrf" });
    assert.equal(created.status, 403);
    assert.equal(created.data.code, "YRF_ACK_REQUIRED");

    const wrongExtension = await call("yrf/open", { path: "/tmp/notes.txt" });
    assert.equal(wrongExtension.status, 400);

    const relative = await call("yrf/open", { path: "relative/sample.yrf" });
    assert.equal(relative.status, 400);
    assert.equal(relative.data.code, "ABSOLUTE_PATH_REQUIRED");

    const missing = await call("yrf/open", { path: "/tmp/definitely-missing.yrf" });
    assert.equal(missing.status, 404);
  });
});

test("geometry changes and experimental creation go through the API", async () => {
  await withYrf(async (call, file) => {
    const opened = await call("yrf/open", { path: file });
    const saved = await call("yrf/save-copy", {
      path: file,
      expectedHash: opened.data.hash,
      changes: [
        {
          objectPath: "layout.pages[0].bands[0].objects[0]",
          field: "left",
          expected: 80,
          value: 140,
        },
      ],
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const reopened = await call("yrf/open", { path: saved.data.file });
    assert.equal(reopened.data.inspection.pages[0].bands[0].objects[0].box.x, 140);
  });
});

test("creation needs explicit acknowledgement", async () => {
  await withYrf(async (call, file) => {
    const dir = path.dirname(file);
    const target = path.join(dir, "created.yrf");

    const blocked = await call("yrf/create", { templateId: "invoice", file: target });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.data.code, "YRF_ACK_REQUIRED");

    const created = await call("yrf/create", {
      templateId: "invoice",
      file: target,
      acknowledge: true,
    });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    assert.ok(created.data.warnings.some((warning: string) => /Experimental/.test(warning) || /unverified/i.test(warning)));
    const reopened = await call("yrf/open", { path: target });
    assert.equal(reopened.status, 200);
    assert.ok(reopened.data.inspection.objectCount > 0);
  });
});

test("collision-safe copies, external edits and parent symlinks are handled", async () => {
  await withYrf(async (call, file) => {
    const opened = await call("yrf/open", { path: file });
    const base = {
      path: file,
      expectedHash: opened.data.hash,
      objectPath: "layout.pages[0].bands[0].objects[0].caption",
      expectedCaption: "Kop Halaman",
    };
    const first = await call("yrf/save-copy", { ...base, caption: "Satu" });
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.match(first.data.file, /sample\.edited\.yrf$/);
    const second = await call("yrf/save-copy", { ...base, caption: "Dua" });
    assert.equal(second.status, 200, JSON.stringify(second.data));
    assert.match(second.data.file, /sample\.edited-2\.yrf$/);
    assert.match(await readFile(first.data.file as string, "utf8"), /Satu/);
    assert.match(await readFile(second.data.file as string, "utf8"), /Dua/);
  });
});

test("an external edit invalidates the hash before saving", async () => {
  await withYrf(async (call, file) => {
    const opened = await call("yrf/open", { path: file });
    const text = await readFile(file, "utf8");
    await writeFile(file, `${text}\n`, "utf8");
    const saved = await call("yrf/save-copy", {
      path: file,
      expectedHash: opened.data.hash,
      objectPath: "layout.pages[0].bands[0].objects[0].caption",
      expectedCaption: "Kop Halaman",
      caption: "Berubah",
    });
    assert.equal(saved.status, 409);
    assert.equal(saved.data.code, "CONFLICT");
  });
});

test("parent-directory symlinks are rejected", async () => {
  await withYrf(async (call, file) => {
    const alias = path.join(path.dirname(file), "alias");
    await symlink(path.dirname(file), alias, "dir");
    const opened = await call("yrf/open", { path: path.join(alias, "sample.yrf") });
    assert.equal(opened.status, 403);
    assert.equal(opened.data.code, "SYMLINK_PARENT");
  });
});

test("stale hash refuses to patch", async () => {
  await withYrf(async (call, file) => {
    const opened = await call("yrf/open", { path: file });
    const stale = await call("yrf/patch", {
      path: file,
      expectedHash: "0".repeat(64),
      objectPath: "layout.pages[0].bands[0].objects[0].caption",
      expectedCaption: "Kop Halaman",
      caption: "X",
    });
    assert.equal(stale.status, 409);
    void opened;
  });
});

test("report ancestor paths preserve Windows drive and UNC roots", async () => {
  const { reportAncestorPaths } = await import("../../src/server/report-routes.js");
  assert.deepEqual(reportAncestorPaths("D:\\reports\\alias\\sample.yrf", path.win32), [
    "D:\\reports", "D:\\reports\\alias",
  ]);
  assert.deepEqual(reportAncestorPaths("\\\\server\\share\\reports\\alias\\sample.yrf", path.win32), [
    "\\\\server\\share\\reports", "\\\\server\\share\\reports\\alias",
  ]);
  assert.deepEqual(reportAncestorPaths("/reports/alias/sample.yrf", path.posix), [
    "/reports", "/reports/alias",
  ]);
});


test("yrf save-source overwrites the original in place and rejects stale hashes", async () => {
  await withYrf(async (call, file) => {
    const opened = await call("yrf/open", { path: file });
    assert.equal(opened.status, 200, JSON.stringify(opened.data));
    const source = String(opened.data.source).replace("Kop Halaman", "Kop Halaman Asli");
    const saved = await call("yrf/save-source", {
      path: file,
      expectedHash: opened.data.hash,
      source,
      approved: true,
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.match(await readFile(file, "utf8"), /Kop Halaman Asli/);
    const backups = (await readdir(path.dirname(file))).filter((name) => name.includes(".yrf.bak-"));
    assert.equal(backups.length, 0);

    const stale = await call("yrf/save-source", {
      path: file,
      expectedHash: opened.data.hash,
      source,
      approved: true,
    });
    assert.equal(stale.status, 409, JSON.stringify(stale.data));

    const withoutApproval = await call("yrf/save-source", {
      path: file,
      expectedHash: saved.data.hash,
      source,
      approved: false,
    });
    assert.equal(withoutApproval.status, 403);
  });
});


test("moveYrfObject changes paint order without reformatting object bodies", async () => {
  const { moveYrfObject } = await import("../../src/reports/formats/yrf/patch.js");
  const source = await readFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), "utf8");
  const moved = moveYrfObject(source, "layout.pages[0].bands[1].objects[0]", "front");
  const before = JSON.parse(source).layout.pages[0].bands[1].objects;
  const after = JSON.parse(moved.text).layout.pages[0].bands[1].objects;
  assert.equal(after[after.length - 1].name, before[0].name);
  assert.equal(after.length, before.length);
  assert.match(moved.text, /"Kop Halaman"/);
  assert.equal(moved.objectPath, "layout.pages[0].bands[1].objects[1]");
  const unchanged = moveYrfObject(source, "layout.pages[0].bands[1].objects[0]", "back");
  assert.equal(unchanged.text, source);
});
