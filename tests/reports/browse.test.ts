import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startStudio } from "../../src/server/index.js";

test("browse lists project reports, suggests public/rpt, and skips excluded paths", async () => {
  const recent = await mkdtemp(path.join(os.tmpdir(), "uiux-browse-"));
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-browse-root-"));
  const studio = await startStudio({ recentDirectory: recent });
  try {
    await copyFile(
      path.resolve("fixtures/reports/synthetic/invoice.report.json"),
      path.join(root, "invoice.report.json"),
    );
    await mkdir(path.join(root, "public", "rpt"), { recursive: true });
    await copyFile(
      path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"),
      path.join(root, "public", "rpt", "sample.yrf"),
    );
    await mkdir(path.join(root, "node_modules"), { recursive: true });
    await copyFile(
      path.resolve("fixtures/reports/synthetic/invoice.report.json"),
      path.join(root, "node_modules", "hidden.report.json"),
    );
    await mkdir(path.join(root, "secrets"), { recursive: true });
    await copyFile(
      path.resolve("fixtures/reports/synthetic/invoice.report.json"),
      path.join(root, "secrets", "deep.report.json"),
    );
    await symlink(path.join(root, "invoice.report.json"), path.join(root, "link.report.json"));

    const session = (await (await fetch(`${studio.url}/api/session`)).json()) as { token: string };
    const headers = {
      "content-type": "application/json",
      origin: studio.url,
      "x-uiux-token": session.token,
    };
    const rootResponse = await fetch(`${studio.url}/api/reports/root`, {
      method: "POST",
      headers,
      body: JSON.stringify({ path: root }),
    });
    assert.equal(rootResponse.status, 200);

    const response = await fetch(`${studio.url}/api/reports/browse?format=all`, { headers });
    assert.equal(response.status, 200);
    const data = (await response.json()) as {
      entries: Array<{ path: string; kind: string }>;
      suggestions: Array<{ path: string }>;
      truncated: boolean;
    };
    const paths = data.entries.map((entry) => entry.path);
    assert.ok(paths.includes("invoice.report.json"));
    assert.ok(paths.includes("public/rpt/sample.yrf"));
    assert.ok(!paths.some((entry) => entry.includes("node_modules")));
    assert.ok(!paths.some((entry) => entry.includes("link.report.json")));
    assert.ok(!paths.some((entry) => entry.includes("secrets/deep.report.json")));
    assert.deepEqual(data.suggestions, [{ path: "public/rpt" }]);
    assert.equal(data.truncated, false);

    await mkdir(path.join(root, "sub"), { recursive: true });
    await copyFile(
      path.resolve("fixtures/reports/synthetic/invoice.report.json"),
      path.join(root, "sub", "nested.report.json"),
    );
    const nested = await fetch(`${studio.url}/api/reports/open`, {
      method: "POST",
      headers,
      body: JSON.stringify({ file: "sub/nested.report.json" }),
    });
    assert.equal(nested.status, 200);
    const nestedData = (await nested.json()) as { document: { title: string } };
    assert.match(nestedData.document.title, /Invoice/);

    const yrfOnly = await fetch(`${studio.url}/api/reports/browse?format=yrf`, { headers });
    const yrfData = (await yrfOnly.json()) as { entries: Array<{ kind: string; path: string }> };
    assert.deepEqual(yrfData.entries.map((entry) => entry.path), ["public/rpt/sample.yrf"]);
    assert.equal(yrfData.entries[0]!.kind, "yrf");
  } finally {
    await studio.close();
    await rm(recent, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});
