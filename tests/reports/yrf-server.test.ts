import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, copyFile, mkdtemp, readFile, readdir, realpath as fsRealpath, rm, stat, symlink, writeFile } from "node:fs/promises";
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

test("YRF raw source prevents removal or changes to scripted objects", async () => {
  await withYrf(async (call, file) => {
    const source = JSON.parse(await readFile(file, "utf8"));
    const objects = source.layout.pages[0].bands[0].objects;
    objects[0].onBeforePrint = "fixture script";
    const original = JSON.stringify(source);
    await writeFile(file, original);
    const opened = await call("yrf/open", { path: file });
    assert.equal(opened.status, 200);
    const save = (source: string) => call("yrf/save-source", { path: file, expectedHash: opened.data.hash, approved: true, source });

    const copy = JSON.parse(original);
    copy.layout.pages[0].bands[0].objects.splice(0, 1);
    const rejected = await save(JSON.stringify(copy));
    assert.equal(rejected.status, 422);
    assert.equal(rejected.data.code, "PATCH_REJECTED");
    assert.equal(await readFile(file, "utf8"), original);

    source.layout.pages[0].bands[1].objects[0].caption = "Unprotected edit";
    assert.equal((await save(JSON.stringify(source))).status, 200);
    assert.match(await readFile(file, "utf8"), /Unprotected edit/);
  });
});

test("raw YRF copy and original share validation and leave no failed output", async () => {
  await withYrf(async (call, file) => {
    const document = JSON.parse(await readFile(file, "utf8"));
    document.script = { OnFormat: "fixture root" };
    const band = document.layout.pages[0].bands[0];
    band.script = { OnBeforePrint: "fixture band" };
    band.objects[0].onAfterPrint = "fixture object";
    band.objects.push({ type: "AR.DataControl", vendor: { expression: "fixture" } });
    const original = "\uFEFF" + JSON.stringify(document);
    await writeFile(file, original);
    const { data } = await call("yrf/open", { path: file });
    const request = { path: file, expectedHash: data.hash, approved: true };
    const saveCopy = (text: string) => call("yrf/source", { ...request, text });
    const duplicate = JSON.stringify(document).replace(/"layout":/, '"layout":{},"layout":');
    for (const route of ["yrf/source", "yrf/save-source"]) {
      const save = (source: string) => call(route, { ...request, text: source, source });
      assert.equal((await save(duplicate)).status, 422);
      for (const script of ["fixture root", "fixture band", "fixture object"]) {
        assert.equal((await save(original.replace(script, "changed script"))).data.code, "PATCH_REJECTED");
      }
      assert.equal((await save(original.replace('"expression":"fixture"', '"expression":"changed"'))).data.code, "PATCH_REJECTED");
    }
    assert.deepEqual(await readdir(path.dirname(file)), ["sample.yrf"]);
    const source = original.replace("Kop Halaman", "Changed headline");
    const copies = await Promise.all([saveCopy(source), saveCopy(source)]);
    assert.ok(copies.every(copy => copy.status === 422), "scripted object caption is protected as well");
    const acceptedSource = original.replace(/"waiReportForm":\{/, '"waiReportForm":{"localNote":"kept",');
    const accepted = await Promise.all([saveCopy(acceptedSource), saveCopy(acceptedSource)]);
    assert.ok(accepted.every(copy => copy.status === 200));
    assert.equal(new Set(accepted.map(copy => copy.data.file)).size, 2);
    assert.equal(await readFile(file, "utf8"), original);
    assert.equal(await readFile(accepted[0]!.data.file, "utf8"), acceptedSource);
    await writeFile(file, original + "\n");
    assert.equal((await saveCopy(acceptedSource)).status, 409);
  });
});

test("YRF Save and Save copy accept known local fields while protecting format payloads", async () => {
  await withYrf(async (call, file) => {
    const original = JSON.parse(await readFile(file, "utf8"));
    original.layout.pages[0].bands[0].objects.push(
      { type: "AR.XML", visible: "0", fileURL: "keep.xml", recordsetPattern: "/root/item" },
      { type: "AR.DataControl", visible: "0", lockType: "1" },
      { type: "AR.Barcode", text: "preserve vendor data", left: 2 },
      { type: "rtf", data: "First line" },
      { type: "subReport", reportName: "details.rpx" },
    );
    original.extension = { objects: [{ type: "rtf", data: "Outside layout" }] };
    const text = JSON.stringify(original);
    await writeFile(file, text);
    const opened = await call("yrf/open", { path: file });
    assert.equal(opened.status, 200);
    const save = (source: string, route = "yrf/save-source") => call(route, {
      path: file, expectedHash: opened.data.hash, approved: true, source, text: source,
    });
    const accepted = text.replace("/root/item", "/root/newItem").replace('"visible":"0","lockType"', '"visible":"1","lockType"')
      .replace('"left":2}', '"left":4}').replace("First line", "Local update").replace("details.rpx", "rincian.rpx");
    for (const candidate of [
      accepted.replace("keep.xml", "remote.xml"),
      accepted.replace("preserve vendor data", "changed"),
      accepted.replace("rincian.rpx", "../rincian.rpx"),
      accepted.replace('"data":"Local update"', '"data":null'),
      accepted.replace("Outside layout", "Changed extension"),
    ]) assert.equal((await save(candidate)).status, 422);
    assert.equal(await readFile(file, "utf8"), text);
    const copy = await save(accepted, "yrf/source");
    assert.equal(copy.status, 200);
    assert.equal(await readFile(copy.data.file, "utf8"), accepted);
    assert.equal(await readFile(file, "utf8"), text);
    assert.equal((await save(accepted)).status, 200);
    assert.equal(await readFile(file, "utf8"), accepted);
  });
});

test("an opened YRF can navigate to a same-folder YRF file without changing either file", async () => {
  await withYrf(async (call, file) => {
    const target = path.join(path.dirname(file), "detail.yrf");
    const original = await readFile(file, "utf8");
    const child = original.replace("Kop Halaman", "Child layout");
    await writeFile(target, child);
    assert.equal((await call("yrf/open", { path: file, sibling: "detail.yrf" })).status, 403);
    const parent = await call("yrf/open", { path: file });
    assert.equal(parent.status, 200);
    const parentPath = parent.data.file;
    for (const name of ["../detail.yrf", "nested/child.yrf", "same.rpx"]) {
      const rejected = await call("yrf/open", { path: parentPath, sibling: name });
      assert.equal(rejected.data.code, "INVALID_YRF_LINK");
    }
    assert.equal((await call("yrf/open", { path: parentPath, sibling: "missing.yrf" })).status, 404);
    const opened = await call("yrf/open", { path: parentPath, sibling: "detail.yrf" });
    assert.equal(opened.status, 200);
    assert.equal(opened.data.file, await fsRealpath(target));
    assert.equal(opened.data.source, child);
    assert.equal(await readFile(file, "utf8"), original);
    assert.equal(await readFile(target, "utf8"), child);
  });
});

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

test("YRF writes are coordinated across separate Studio processes", { timeout: 15000 }, async () => {
  await withYrf(async (call, file) => {
    const recent = await mkdtemp(path.join(os.tmpdir(), "uiux-yrf-second-studio-"));
    const studioEntry = new URL("../../src/server/index.ts", import.meta.url).href;
    const script = `
      import { startStudio } from ${JSON.stringify(studioEntry)};
      const studio = await startStudio({ recentDirectory: ${JSON.stringify(recent)} });
      process.once("disconnect", () => void studio.close());
      process.send(studio.url);
    `;
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script],
      { stdio: ["ignore", "ignore", "inherit", "ipc"], windowsHide: true });
    const closed = once(child, "exit");
    try {
      const url = await Promise.race([
        once(child, "message").then(([url]) => String(url)),
        closed.then(() => { throw new Error("The second Studio exited before listening."); }),
      ]);
      const { token } = await (await fetch(url + "/api/session")).json() as { token: string };
      const other = async (route: string, body: object) => {
        const response = await fetch(url + "/api/reports/" + route, { method: "POST",
          headers: { origin: url, "content-type": "application/json", "x-uiux-token": token }, body: JSON.stringify(body) });
        return { status: response.status, data: await response.json() as any };
      };
      const [first, second] = await Promise.all([call("yrf/open", { path: file }), other("yrf/open", { path: file })]);
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      const request = { path: file, expectedHash: first.data.hash, approved: true };
      const outcomes = await Promise.all([
        call("yrf/save-source", { ...request, source: first.data.source.replace("Kop Halaman", "Writer A") }),
        other("yrf/save-source", { ...request, source: second.data.source.replace("Kop Halaman", "Writer B") }),
      ]);
      assert.deepEqual(outcomes.map(result => result.status).sort(), [200, 409]);
      const winner = outcomes.find(result => result.status === 200)!;
      assert.equal(await readFile(file, "utf8"), winner.data.source);
      assert.deepEqual(await readdir(path.dirname(file)), ["sample.yrf"]);
      assert.equal((await other("yrf/source", { path: file, expectedHash: winner.data.hash, text: winner.data.source })).status, 200);
    } finally {
      if (child.connected) child.disconnect();
      await closed;
      await rm(recent, { recursive: true, force: true });
    }
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
    const immediate = await call("yrf/save-source", {
      path: target, expectedHash: created.data.hash, approved: true,
      source: created.data.source.replace('"version": "1.0.0"', '"version": "1.0.0", "localNote": "created"'),
    });
    assert.equal(immediate.status, 200, JSON.stringify(immediate.data));
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
    await symlink(path.dirname(file), alias, process.platform === "win32" ? "junction" : "dir");
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
