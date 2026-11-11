import { test, expect } from "@playwright/test";
import { cp, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("uiux-language", "en");
    localStorage.setItem("uiux-theme", "light");
  });
});

async function setReportFolder(page: import("@playwright/test").Page, folder: string) {
  await page.getByPlaceholder("/path/to/reports").fill(folder);
  await page.getByRole("button", { name: "Use folder" }).click();
  const create = page.getByRole("button", { name: "Create report" });
  if (!(await create.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Create new report" }).click();
  }
}

async function selectYrfTreeObject(page: import("@playwright/test").Page, text: string, additive = false) {
  const object = page.locator(".yrf-tree button").filter({ hasText: text });
  const band = page.locator(".yrf-band-tree").filter({ has: page.locator("button").filter({ hasText: text }) });
  if (!(await band.evaluate((element) => (element as HTMLDetailsElement).open))) await band.locator("summary").click();
  await object.click(additive ? { modifiers: ["Shift"] } : {});
}

test("Report Studio creates, edits, saves and previews a native report", async ({
  page,
}) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-reports-"));
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();

    await expect(page.locator(".rs-brand strong")).toHaveText("Report Studio");
    await expect(page.getByText(/Create report writes the new file/)).toBeVisible();
    await setReportFolder(page, folder);

    await page.getByRole("button", { name: "Create report" }).click();
    const title = page.getByRole("textbox", { name: "Report title" });
    await expect(title).toHaveValue("Invoice / Faktur");
    expect(await readFile(path.join(folder, "invoice.report.json"), "utf8")).toContain('"kind": "react-uiux-report"');

    await title.fill("Invoice November");
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();

    const onDisk = await readFile(
      path.join(folder, "invoice.report.json"),
      "utf8",
    );
    expect(onDisk).toContain('"title": "Invoice November"');
    expect(onDisk).toContain('"kind": "react-uiux-report"');

    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByText("Rendered by the native print engine using the report's preview data.")).toBeVisible();
    const frame = page.frameLocator("iframe");
    await expect(frame.locator("page")).toBeVisible({ timeout: 10_000 });
    await expect(frame.locator("page")).toContainText("INVOICE");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("report guide and structure groups work in native and YRF workspaces", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-report-help-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "Report guide" }).click();
    await expect(page.getByRole("dialog", { name: "Report guide" })).toContainText("Sample data");
    await expect(page.getByRole("dialog", { name: "Report guide" }).locator('a[href$=".md"]')).toHaveCount(0);
    await page.getByRole("navigation", { name: "Guide topics" }).getByRole("button", { name: /Images and styling/ }).click();
    await expect(page.getByRole("dialog", { name: "Report guide" })).toContainText("choose an image file");
    await page.getByRole("dialog").getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("dialog", { name: "Report guide" })).toContainText("Import data");
    await page.setViewportSize({ width: 390, height: 740 });
    await expect(page.getByRole("dialog", { name: "Report guide" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Report guide" })).toContainText("Import data");
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await page.setViewportSize({ width: 1280, height: 800 });
    await setReportFolder(page, folder);
    await page.getByRole("button", { name: "Create report" }).click();
    const band = page.locator(".rs-tree > li > button").first();
    await expect(band).toBeVisible();
    const wasOpen = (await band.getAttribute("aria-expanded")) === "true";
    await band.click();
    await expect(band).toHaveAttribute("aria-expanded", String(!wasOpen));
    await band.click();
    await expect(band).toHaveAttribute("aria-expanded", String(wasOpen));
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    await expect(page.locator(".yrf-band-tree").first()).toBeVisible();
    await expect.poll(() => page.locator(".yrf-band-tree[open]").count()).toBe(1);
    const index = await page.locator(".yrf-band-tree[open]").first().evaluate((element) => [...element.parentElement!.parentElement!.children].indexOf(element.parentElement!));
    const first = page.locator(".yrf-band-tree").nth(index);
    await first.locator("summary").click();
    await expect(first).not.toHaveAttribute("open", "");
    await first.locator("summary").click();
    await expect(first).toHaveAttribute("open", "");
    await page.getByRole("button", { name: "Report guide" }).click();
    await expect(page.getByRole("dialog", { name: "Report guide" })).toContainText("Save copy");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Report guide" })).toHaveCount(0);
  } finally {
    await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("Report Studio keeps unsupported formats out of the create flow", async ({
  page,
}) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-reports-"));
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await setReportFolder(page, folder);

    await page.getByLabel("File name").fill("legacy.yrf");
    await page.getByRole("button", { name: "Create report" }).click();
    await expect(page.locator(".rs-status")).toContainText(/Problems|Masalah/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("inline text edit, drag and undo work on the canvas", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-edit-"));
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await setReportFolder(page, folder);
    await page.getByRole("button", { name: "Create report" }).click();

    const title = page.locator('.rs-el[data-id="el-title"]');
    await title.dblclick();
    const editor = page.locator(".rs-inline-edit");
    await editor.fill("INVOICE BARU");
    await editor.press("Escape");
    await expect(title).toContainText("INVOICE BARU");

    const before = await title.boundingBox();
    expect(before).not.toBeNull();
    await page.mouse.move(before!.x + 10, before!.y + 10);
    await page.mouse.down();
    await page.mouse.move(before!.x + 54, before!.y + 10, { steps: 6 });
    await page.mouse.up();
    const moved = await title.boundingBox();
    expect(moved!.x).toBeGreaterThan(before!.x + 20);

    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+z`);
    const restored = await title.boundingBox();
    expect(Math.abs(restored!.x - before!.x)).toBeLessThan(6);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("leaving with unsaved changes asks before discarding", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-guard-"));
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await setReportFolder(page, folder);
    await page.getByRole("button", { name: "Create report" }).click();
    await page.getByRole("textbox", { name: "Report title" }).fill("Belum disimpan");

    await page.getByRole("button", { name: "Back to home" }).click();
    const dialog = page.getByRole("dialog", { name: "Unsaved changes" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("textbox", { name: "Report title" })).toHaveValue("Belum disimpan");

    await page.getByRole("button", { name: "Back to home" }).click();
    await page.getByRole("dialog", { name: "Unsaved changes" }).getByRole("button", { name: "Discard changes" }).click();
    await expect(page.getByRole("button", { name: /Report Studio/ })).toBeVisible();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});


test("YRF inspector views a report and saves a caption patch as a copy", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrf-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  const original = await readFile(file, "utf8");
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();

    await expect(page.getByText(/units are unverified/i)).toBeVisible();
    await page.getByRole("button", { name: /^label · ph$/ }).click();
    await page.getByLabel("Caption").fill("Kop Halaman Baru");
    await page.getByRole("button", { name: "Preview change" }).click();
    await expect(page.getByText("Before")).toBeVisible();

    await page.getByRole("button", { name: "Save copy", exact: true }).last().click();
    await expect(page.getByText(/Copy saved/)).toBeVisible();
    const copy = await readFile(path.join(folder, "sample.edited.yrf"), "utf8");
    expect(copy).toContain("Kop Halaman Baru");
    expect(await readFile(file, "utf8")).toBe(original);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});


test("YRF creation needs an explicit acknowledgement and produces an inspectable file", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrf-create-"));
  const file = path.join(folder, "created.yrf");
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByRole("button", { name: "+ New .yrf" }).click();
    await page.getByLabel("New .yrf path").fill(file);

    const create = page.getByRole("button", { name: "Create file" });
    await expect(create).toBeDisabled();
    await page.getByRole("checkbox").check();
    await create.click();

    await expect(page.getByText(/Created:/)).toBeVisible();
    await expect(page.getByText("pageHeader ·")).toBeVisible();
    const produced = await readFile(file, "utf8");
    expect(produced).toContain('"waiReportForm"');
    expect(produced).toContain('"layout"');
    await page.getByRole("button", { name: "Code", exact: true }).click();
    await expect(page.getByLabel("Code", { exact: true })).toHaveValue(produced);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});


test("report list opens native and yrf files without typing a path", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-list-"));
  await copyFile(path.resolve("fixtures/reports/synthetic/invoice.report.json"), path.join(folder, "invoice.report.json"));
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), path.join(folder, "sample.yrf"));
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await setReportFolder(page, folder);

    await expect(page.getByRole("button", { name: /NATIVE.*invoice\.report\.json/ })).toBeVisible();
    await expect(page.getByLabel("File name")).toHaveValue("invoice.report.json");
    const yrfRow = page.getByRole("button", { name: /YRF.*sample\.yrf/ });
    await expect(yrfRow).toBeVisible();

    await yrfRow.click();
    await expect(page.getByText("WaiReport (.yrf)").first()).toBeVisible();
    await expect(page.getByText(/units are unverified/i)).toBeVisible();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});


test("project sidebar keeps report and history actions on the home screen", async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-project-report-"));
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  try {
    await page.goto("/");
    const origin = new URL(page.url()).origin;
    const session = (await (await page.request.get("/api/session")).json()) as { token: string };
    await page.request.post("/api/reports/root", {
      headers: { origin, "x-uiux-token": session.token },
      data: { clear: true },
    });
    await page.getByRole("button", { name: /Open Existing Project/ }).click();
    await page.getByLabel("Project directory").fill(root);
    await page.getByRole("button", { name: "Analyze project" }).click();
    await page.getByRole("button", { name: "Inspect only" }).click();
    await expect(page.locator(".icon-rail")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".rail-exit")).toHaveCount(1);

    await expect(page.locator(".icon-rail").getByRole("button", { name: "Report Studio" })).toHaveCount(0);
    await expect(page.locator(".icon-rail").getByRole("button", { name: "Change history" })).toHaveCount(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("native Design and Code tabs keep the draft and selection, rejecting invalid JSON", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-code-"));
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await setReportFolder(page, folder);
    await page.getByRole("button", { name: "Create report" }).click();
    await expect(page.locator(".rs-page")).toBeVisible();

    const clipped = await page
      .locator('.rs-el[data-id="el-title"]')
      .evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(clipped, "title text must not be clipped after the pt→px fix").toBe(false);
    await expect(page.locator(".rs-status")).toContainText("Elements overflow their box");

    await page.locator('.rs-el[data-id="el-title"]').click();
    await expect(page.locator('.rs-el[data-id="el-title"]')).toHaveCSS("cursor", "move");
    await expect(page.locator('.rs-el[data-id="el-title"]')).toHaveClass(/on/);

    await page.getByRole("button", { name: "Code", exact: true }).click();
    const editor = page.locator(".rs-code-area");
    await expect(editor).toContainText('"kind": "react-uiux-report"');
    await editor.fill("{ not json");
    await page.getByRole("button", { name: "Apply JSON" }).click();
    await expect(page.getByText(/Expected property name|Unexpected token/)).toBeVisible();

    await page.getByRole("button", { name: "Design", exact: true }).click();
    await expect(page.locator('.rs-el[data-id="el-title"]')).toHaveClass(/on/);
    await expect(page.getByRole("textbox", { name: "Report title" })).toHaveValue("Invoice / Faktur");

    await page.getByRole("button", { name: "Code", exact: true }).click();
    const document = JSON.parse(await readFile(path.join(folder, "invoice.report.json"), "utf8"));
    document.title = "Invoice dari Kode";
    await editor.fill(JSON.stringify(document, null, 2));
    await page.getByRole("button", { name: "Apply JSON" }).click();
    await expect(page.getByRole("textbox", { name: "Report title" })).toHaveValue("Invoice dari Kode");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("YRF code tab is inert and read-only while design keeps its selection", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrf-code-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    await page.getByRole("button", { name: /^label · ph$/ }).click();

    await page.getByRole("button", { name: "Code", exact: true }).click();
    const source = page.getByLabel("Code", { exact: true });
    await expect(source).toContainText('"waiReportForm"');
    expect(await source.getAttribute("readonly")).not.toBeNull();

    await page.getByRole("button", { name: "Design (approximate)" }).click();
    await expect(page.getByRole("button", { name: /^label · ph$/ })).toHaveClass(/on/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});


async function createInvoice(page: import("@playwright/test").Page, folder: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /Report Studio/ }).click();
  await setReportFolder(page, folder);
  await page.getByRole("button", { name: "Create report" }).click();
  await expect(page.locator(".rs-page")).toBeVisible();
}

async function elementWidth(page: import("@playwright/test").Page, id: string) {
  return page.locator(`.rs-el[data-id="${id}"]`).evaluate((el) => parseFloat((el as HTMLElement).style.width));
}

test("resize handles resize, cancel cleanly, and undo restores", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-resize-"));
  try {
    await createInvoice(page, folder);
    await page.locator('.rs-el[data-id="el-title"]').click();
    const before = await elementWidth(page, "el-title");

    const se = page.locator('[data-handle="se"]');
    const handle = await se.boundingBox();
    expect(handle).not.toBeNull();
    await page.mouse.move(handle!.x + 4, handle!.y + 4);
    await page.mouse.down();
    await page.mouse.move(handle!.x + 64, handle!.y + 24, { steps: 6 });
    await page.mouse.up();
    const grown = await elementWidth(page, "el-title");
    expect(grown).toBeGreaterThan(before + 5);

    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+z`);
    expect(Math.abs((await elementWidth(page, "el-title")) - before)).toBeLessThan(2);

    const east = page.locator('[data-handle="e"]');
    const eastBox = await east.boundingBox();
    await page.mouse.move(eastBox!.x + 4, eastBox!.y + 4);
    await page.mouse.down();
    await page.mouse.move(eastBox!.x + 40, eastBox!.y + 4, { steps: 4 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(Math.abs((await elementWidth(page, "el-title")) - before)).toBeLessThan(2);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("resize respects the left/top boundary and works when zoomed", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-zoom-"));
  try {
    await createInvoice(page, folder);
    await page.locator('input[type="range"]').evaluate((el) => {
      (el as HTMLInputElement).value = "1.25";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator('.rs-el[data-id="el-title"]').click();

    const nw = page.locator('[data-handle="nw"]');
    const box = await nw.boundingBox();
    await page.mouse.move(box!.x + 4, box!.y + 4);
    await page.mouse.down();
    await page.mouse.move(box!.x - 400, box!.y - 400, { steps: 6 });
    await page.mouse.up();
    const style = await page
      .locator('.rs-el[data-id="el-title"]')
      .evaluate((el) => ({ left: parseFloat((el as HTMLElement).style.left), top: parseFloat((el as HTMLElement).style.top) }));
    expect(style.left).toBeGreaterThanOrEqual(0);
    expect(style.top).toBeGreaterThanOrEqual(0);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("palette adds elements by click and by drag onto a band", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-palette-"));
  try {
    await createInvoice(page, folder);
    const before = await page.locator(".rs-el").count();
    await page.getByRole("button", { name: "Add text" }).click();
    await expect(page.locator(".rs-el")).toHaveCount(before + 1);

    const box = page.getByRole("button", { name: "Add box" });
    await box.dragTo(page.locator(".rs-band").first(), { targetPosition: { x: 60, y: 30 } });
    await expect(page.locator(".rs-el")).toHaveCount(before + 2);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("all eight handles resize and keyboard resize works", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-handles-"));
  try {
    await createInvoice(page, folder);
    await page.locator('.rs-el[data-id="el-title"]').click();

    const readBox = () =>
      page.locator('.rs-el[data-id="el-title"]').evaluate((el) => {
        const style = (el as HTMLElement).style;
        return {
          x: parseFloat(style.left),
          y: parseFloat(style.top),
          width: parseFloat(style.width),
          height: parseFloat(style.height),
        };
      });

    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    for (const handle of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
      const before = await readBox();
      const target = page.locator(`[data-handle="${handle}"]`);
      const expectedCursor: Record<string, string> = { nw: "nwse-resize", n: "ns-resize", ne: "nesw-resize", e: "ew-resize", se: "nwse-resize", s: "ns-resize", sw: "nesw-resize", w: "ew-resize" };
      await expect(target).toHaveCSS("cursor", expectedCursor[handle]);
      const box = await target.boundingBox();
      expect(box, `handle ${handle} exists`).not.toBeNull();
      await page.mouse.move(box!.x + 4, box!.y + 4);
      await page.mouse.down();
      await page.mouse.move(box!.x + 20, box!.y + 20, { steps: 3 });
      await page.mouse.up();
      const after = await readBox();
      const changed =
        after.x !== before.x ||
        after.y !== before.y ||
        after.width !== before.width ||
        after.height !== before.height;
      expect(changed, `handle ${handle} changed the box`).toBe(true);
      await page.keyboard.press(`${modifier}+z`);
    }

    const beforeKeyboard = await readBox();
    await page.locator(".rs-canvas").focus();
    await page.keyboard.press("Alt+ArrowRight");
    await page.keyboard.press("Shift+Alt+ArrowDown");
    const afterKeyboard = await readBox();
    expect(afterKeyboard.width).toBeGreaterThan(beforeKeyboard.width);
    expect(afterKeyboard.height).toBeGreaterThan(beforeKeyboard.height);

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});


test("image import, CSV sample data and style controls update the draft", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-phase4-"));
  const pngPath = path.join(folder, "dot.png");
  const csvPath = path.join(folder, "lines.csv");
  await writeFile(
    pngPath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  await writeFile(
    csvPath,
    "description,quantity,unitPrice,amount\nJasa CSV,1,250000,250000\nDiskon,1,-50000,-50000\n",
  );
  try {
    await createInvoice(page, folder);
    const png = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 128;
      const context = canvas.getContext("2d")!; const pixels = context.createImageData(128, 128);
      let seed = 1234567;
      for (let i = 0; i < pixels.data.length; i += 4) {
        for (let c = 0; c < 3; c++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; pixels.data[i + c] = seed >>> 24; }
        pixels.data[i + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
      return canvas.toDataURL("image/png").split(",")[1]!;
    });
    await writeFile(pngPath, Buffer.from(png, "base64"));
    expect(Buffer.from(png, "base64").length).toBeGreaterThan(20000);

    await page.locator('.rs-el[data-id="el-logo"]').click();
    await page.locator('input[type=file][accept*="image"]').setInputFiles(pngPath);
    await expect(page.locator(".rs-image-thumb")).toBeVisible();
    await expect(page.locator('.rs-el[data-id="el-logo"] img')).toBeVisible();
    await page.getByLabel("Image fit").selectOption("cover");
    await expect(page.locator('.rs-el[data-id="el-logo"] img')).toHaveCSS("object-fit", "cover");
    await page.getByLabel("Image position horizontal (%)").fill("20");
    await page.getByLabel("Image position vertical (%)").fill("80");
    await expect(page.locator('.rs-el[data-id="el-logo"] img')).toHaveCSS("object-position", "20% 80%");
    await page.locator(".rs-right").getByLabel("W", { exact: true }).fill("40");

    await page.getByRole("button", { name: "Import data (CSV/JSON)" }).click();
    await page.locator('input[type=file][accept*="csv"]').setInputFiles(csvPath);
    await expect(page.getByText(/Sample schema/)).toContainText("lines (2)");
    await expect(page.locator(".rs-table-row", { hasText: "Jasa CSV" })).toBeVisible();

    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.frameLocator("iframe").locator("body")).toContainText("Jasa CSV", {
      timeout: 10_000,
    });
    await expect(page.frameLocator("iframe").locator('img[alt="dot.png"]')).toHaveCSS("object-fit", "cover");
    await expect(page.frameLocator("iframe").locator('img[alt="dot.png"]')).toHaveCSS("object-position", "20% 80%");
    await page.getByRole("button", { name: "Design", exact: true }).click();

    await page.locator('.rs-el[data-id="el-title"]').click();
    await page.getByLabel("Font weight").selectOption("700");
    await page.getByRole("checkbox", { name: "Italic" }).check();
    await page.locator('input[type="color"]').last().fill("#112233");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();
    const saved = await readFile(path.join(folder, "invoice.report.json"), "utf8");
    expect(saved).toContain('"fontWeight": 700');
    expect(saved).toContain('"italic": true');
    expect(saved).toContain('"background": "#112233"');
    expect(saved).toContain('"src": "data:image/png;base64,');
    expect(saved).toContain('"fit": "cover"');
    expect(saved).toContain('"positionX": 20');
    expect(saved).toContain('"positionY": 80');
    const savedLogo = JSON.parse(saved).bands.flatMap((band: { elements: Array<{ id: string; box: { width: number } }> }) => band.elements).find((element: { id: string }) => element.id === "el-logo");
    expect(savedLogo.box.width).toBe(40);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const download = await downloadPromise;
    const pdfPath = await download.path();
    expect(pdfPath).not.toBeNull();
    const pdf = (await readFile(pdfPath!)).toString("latin1");
    expect(pdf).toContain("/Subtype /Image");
    expect(pdf).toContain("/Im1 Do");
    const jpeg = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
      const context = canvas.getContext("2d")!; context.fillStyle = "#ff3300"; context.fillRect(0, 0, 8, 8);
      return canvas.toDataURL("image/jpeg").split(",")[1]!;
    });
    await page.locator('.rs-el[data-id="el-logo"]').click();
    await page.locator('input[type=file][accept*="image"]').setInputFiles({ name: "logo.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpeg, "base64") });
    await expect(page.locator('.rs-el[data-id="el-logo"] img')).toHaveAttribute("alt", "logo.jpg");
    const jpegDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const jpegPdfPath = await (await jpegDownloadPromise).path();
    expect((await readFile(jpegPdfPath!)).toString("latin1")).toContain("/DCTDecode");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});


test("formats panel states what every adapter supports", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Report Studio/ }).click();
  await page.getByRole("button", { name: "Formats" }).click();
  const dialog = page.getByRole("dialog", { name: "Formats" });
  await expect(dialog).toContainText("Report project (.report.json)");
  await expect(dialog).toContainText("JasperReports template (.jrxml)");
  await expect(dialog).toContainText("Unsupported");
  await expect(dialog).toContainText("Editable");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

test("JSON data import is labelled data-only and reaches the table", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-json-data-"));
  const jsonPath = path.join(folder, "lines.json");
  await writeFile(
    jsonPath,
    JSON.stringify({
      lines: [{ description: "Jasa JSON", quantity: 2, unitPrice: 75000, amount: 150000 }],
    }),
  );
  try {
    await createInvoice(page, folder);
    await page.getByRole("button", { name: "Import data (CSV/JSON)" }).click();
    await page.locator('input[type=file][accept*="csv"]').setInputFiles(jsonPath);

    await expect(page.getByText(/Data imported into lines/)).toBeVisible();
    await expect(page.getByText(/data only, not a design import/)).toBeVisible();
    await expect(page.locator(".rs-table-row", { hasText: "Jasa JSON" })).toBeVisible();
    await expect(page.getByText(/Sample schema/)).toContainText("lines (1)");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});


test("invalid sample data blocks preview and export instead of producing empty output", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-invalid-data-"));
  try {
    await createInvoice(page, folder);
    await page.locator(".rs-data").fill("{ broken json");
    await page.getByRole("button", { name: "Export" }).click();
    await expect(page.getByText(/Fix the sample data before previewing or exporting/)).toBeVisible();
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByText(/Fix the sample data/)).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("importing data merges datasets and nested reports open from the list", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-merge-"));
  await mkdir(path.join(folder, "sub"), { recursive: true });
  await copyFile(
    path.resolve("fixtures/reports/synthetic/invoice.report.json"),
    path.join(folder, "sub", "nested.report.json"),
  );
  const csvPath = path.join(folder, "lines.csv");
  const jsonPath = path.join(folder, "invoice.json");
  await writeFile(csvPath, "description,quantity,unitPrice,amount\nBaris,1,1000,1000\n");
  await writeFile(jsonPath, JSON.stringify({ invoice: { number: "INV-9", total: 1000 } }));
  try {
    await createInvoice(page, folder);
    await page.getByRole("button", { name: "Import data (CSV/JSON)" }).click();
    await page.locator('input[type=file][accept*="csv"]').setInputFiles(csvPath);
    await expect(page.getByText(/Sample schema/)).toContainText("lines (1)");

    await page.getByRole("button", { name: "Import data (CSV/JSON)" }).click();
    await page.locator('input[type=file][accept*="csv"]').setInputFiles(jsonPath);
    const schema = page.getByText(/Sample schema/);
    await expect(schema).toContainText("lines (1)");
    await expect(schema).toContainText("invoice");

    await page.getByRole("button", { name: /NATIVE.*sub\/nested\.report\.json/ }).click();
    await expect(page.getByRole("textbox", { name: "Report title" })).toHaveValue("Invoice / Faktur");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("unsaved draft blocks opening another report from the list", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-listguard-"));
  try {
    await createInvoice(page, folder);
    await page.getByRole("textbox", { name: "Report title" }).fill("Belum disimpan");
    await page.getByRole("button", { name: /NATIVE.*invoice\.report\.json/ }).click();
    const dialog = page.getByRole("dialog", { name: "Unsaved changes" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("textbox", { name: "Report title" })).toHaveValue("Belum disimpan");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("YRF saving a copy continues from the copy", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrfcopy-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    await page.getByRole("button", { name: /^label · ph$/ }).click();

    await page.getByLabel("Caption").fill("Satu");
    await page.getByRole("button", { name: "Save copy", exact: true }).last().click();
    const savedMessage = page.getByText(/Copy saved/).last();
    await expect(savedMessage).toBeVisible();
    const firstMessage = await savedMessage.textContent();

    await page.getByLabel("Caption").fill("Dua");
    await page.getByRole("button", { name: "Save copy", exact: true }).last().click();
    await expect
      .poll(async () => savedMessage.textContent())
      .not.toBe(firstMessage);
    const savedPath = (await savedMessage.textContent())?.split(":").slice(1).join(":").trim();
    expect(savedPath).toBeTruthy();
    const second = await readFile(savedPath!, "utf8");
    expect(second).toContain("Dua");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("Code draft survives tab switches and must be applied before saving", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-codedraft-"));
  try {
    await createInvoice(page, folder);
    await page.getByRole("button", { name: "Code", exact: true }).click();
    const editor = page.locator(".rs-code-area");
    await editor.fill("// draf belum diterapkan");
    await page.getByRole("button", { name: "Design", exact: true }).click();
    await page.getByRole("button", { name: "Code", exact: true }).click();
    await expect(editor).toHaveValue("// draf belum diterapkan");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/Apply or discard the Code draft before saving/)).toBeVisible();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});


test("landing offers open or create and the report list is searchable with a small badge", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-p0-"));
  await copyFile(path.resolve("fixtures/reports/synthetic/invoice.report.json"), path.join(folder, "invoice.report.json"));
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), path.join(folder, "sample.yrf"));
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await expect(page.getByRole("heading", { name: "How do you want to start?" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Open existing report/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Create new report/ })).toBeVisible();
    expect(await readdir(folder)).toEqual(expect.arrayContaining(["invoice.report.json", "sample.yrf"]));
    expect((await readdir(folder)).sort()).toEqual(["invoice.report.json", "sample.yrf"]);

    await page.getByPlaceholder("/path/to/reports").fill(folder);
    await page.getByRole("button", { name: "Use folder" }).click();
    await expect(page.getByText(/2 report\(s\) found/)).toBeVisible();

    const badge = page.locator(".rs-badge").first();
    const box = await badge.boundingBox();
    expect(box!.width).toBeLessThan(80);
    expect(box!.height).toBeLessThan(30);

    await page.getByLabel("Search reports").fill("sample");
    await expect(page.getByText(/1 report\(s\) found/)).toBeVisible();
    await expect(page.getByRole("button", { name: /YRF.*sample\.yrf/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /NATIVE.*invoice\.report\.json/ })).toHaveCount(0);

    await page.getByLabel("Search reports").fill("");
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByText(/2 report\(s\) found/)).toBeVisible();

    await page.getByRole("button", { name: /NATIVE.*invoice\.report\.json/ }).click();
    await expect(page.getByRole("textbox", { name: "Report title" })).toHaveValue("Invoice / Faktur");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("create flow reveals templates only after choosing it and writes nothing before Create", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-createflow-"));
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByPlaceholder("/path/to/reports").fill(folder);
    await page.getByRole("button", { name: "Use folder" }).click();
    await expect(page.getByRole("heading", { name: "Templates" })).toHaveCount(0);
    await page.getByRole("button", { name: "Create new report" }).click();
    await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();
    expect(await readdir(folder)).toEqual([]);
    await page.getByRole("button", { name: "Create report" }).click();
    await expect(page.locator(".rs-page")).toBeVisible();
    expect((await readdir(folder)).sort()).toEqual(["invoice.report.json"]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});


test("palette adds field, table and form and the result persists after reopen", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-palette2-"));
  try {
    await createInvoice(page, folder);
    const before = await page.locator(".rs-el").count();
    await page.getByRole("button", { name: "Field", exact: true }).click();
    await expect(page.locator(".rs-el")).toHaveCount(before + 1);
    await page.getByRole("button", { name: "Table", exact: true }).click();
    await expect(page.locator(".rs-el")).toHaveCount(before + 2);
    await page.getByRole("button", { name: "Form", exact: true }).click();
    await expect(page.locator(".rs-el")).toHaveCount(before + 4);

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: /NATIVE.*invoice\.report\.json/ }).click();
    await expect(page.locator(".rs-el")).toHaveCount(before + 4);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("box fill and border color appear in the design canvas", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-report-colors-"));
  try {
    await createInvoice(page, folder);
    await page.getByRole("button", { name: "Add box", exact: true }).click();
    await page.getByLabel("Background", { exact: true }).fill("#aabbcc");
    await page.getByLabel("Border color", { exact: true }).fill("#123456");
    const box = page.locator(".rs-el-rect.on");
    await expect(box).toHaveCSS("background-color", "rgb(170, 187, 204)");
    await expect(box).toHaveCSS("border-top-color", "rgb(18, 52, 86)");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();
    const saved = JSON.parse(await readFile(path.join(folder, "invoice.report.json"), "utf8"));
    const stored = saved.bands.flatMap((band: any) => band.elements).find((element: any) => element.type === "rect" && element.props.borderColor === "#123456");
    expect(stored.props.background).toBe("#aabbcc");
    expect(stored.props.borderWidth).toBeGreaterThan(0);
  } finally { await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test("A4 workspace zoom, grid and ruler are visual-only", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-report-ruler-"));
  try {
    await createInvoice(page, folder);
    const paper = page.locator(".rs-page");
    await expect(page.locator(".rs-toolbar")).toContainText("A4 · 210 × 297 mm");
    const initial = await paper.evaluate((element) => element.getBoundingClientRect().width);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    expect(await paper.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(initial);
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await expect.poll(() => paper.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(initial, 0);
    await page.getByRole("button", { name: "Grid", exact: true }).click();
    await expect(paper).toHaveCSS("background-image", /linear-gradient/);
    await page.getByRole("button", { name: "Ruler", exact: true }).click();
    await expect(paper.locator(".report-rulers")).toBeAttached();
    await page.getByRole("button", { name: "Grid", exact: true }).click();
    await expect(paper).toHaveCSS("background-image", "none");
    const original = await readFile(path.join(folder, "invoice.report.json"), "utf8");
    for (let step = 0; step < 5; step++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    expect(await paper.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(initial);
    for (let step = 0; step < 10; step++) await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    expect(await paper.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(initial);
    for (let step = 0; step < 5; step++) await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect.poll(() => paper.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(initial, 0);
    expect(await readFile(path.join(folder, "invoice.report.json"), "utf8")).toBe(original);
  } finally { await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test("table column configuration and dataset binding survive save and reopen", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-table-columns-"));
  try {
    await createInvoice(page, folder);
    await page.getByRole("button", { name: "Table", exact: true }).click();
    const panel = page.locator(".rs-table-columns");
    await panel.getByLabel("Data field 1").fill("description");
    await panel.getByLabel("Column heading 1").fill("Description");
    await panel.getByLabel("Header group (optional) 1").fill("Details");
    await panel.getByLabel("Header group (optional) 2").fill("Details");
    await panel.getByLabel("Column width 1").fill("80");
    await panel.getByLabel("Header background").fill("#334455");
    await panel.getByLabel("Table border color").fill("#123456");
    await expect(page.locator(".rs-el.on .rs-table-row.header").last()).toHaveCSS("background-color", "rgb(51, 68, 85)");
    await expect(page.locator(".rs-el.on .rs-table-row.header").last().locator("span").first()).toHaveCSS("border-top-color", "rgb(18, 52, 86)");
    await panel.getByLabel("Number format 2").selectOption("currency");
    await panel.getByRole("button", { name: "Add column" }).click();
    await panel.getByLabel("Column heading 3").fill("Total");
    await panel.getByRole("button", { name: "Remove column 3" }).click();
    await panel.getByRole("button", { name: "Add row", exact: true }).click();
    await panel.getByLabel("Static rows (when no binding path) 1 description").fill("Synthetic item");
    await panel.getByLabel("Binding path", { exact: true }).fill("lines");
    await panel.getByLabel("Conditional table rows Condition expression").fill("row.amount < 0");
    await panel.getByLabel("Conditional table rows Conditional fill color").fill("#aabbcc");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();
    const saved = JSON.parse(await readFile(path.join(folder, "invoice.report.json"), "utf8"));
    const table = saved.bands.flatMap((band: any) => band.elements).find((element: any) => element.type === "table" && element.props.columns?.[0]?.label === "Description");
    expect(table.bindings.path).toBe("lines");
    expect(table.props.columns).toHaveLength(2);
    expect(table.props.columns[0]).toMatchObject({ key: "description", label: "Description", width: 80 });
    expect(table.props.columns[1].format).toBe("currency");
    expect(table.props.columns[0].headerGroup).toBe("Details");
    expect(table.props.staticRows[0].description).toBe("Synthetic item");
    expect(table.props.rowCondition).toMatchObject({ when: "row.amount < 0", background: "#aabbcc" });
    await page.reload();
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: /NATIVE.*invoice\.report\.json/ }).click();
    await expect(page.locator(".rs-table-row.header", { hasText: "Description" })).toBeVisible();
    await page.locator(".rs-data").fill('{"lines":[{"description":"Negative row","amount":-1}]}');
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.frameLocator("iframe").locator('th[colspan="2"]', { hasText: "Details" })).toBeVisible();
    await expect(page.frameLocator("iframe").locator("td", { hasText: "Negative row" }).first()).toHaveCSS("background-color", "rgb(170, 187, 204)");
  } finally { await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test("advanced table headings, merges and multiple rules persist and appear in preview", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-table-advanced-"));
  try {
    await createInvoice(page, folder);
    await page.getByRole("button", { name: "Table", exact: true }).click();
    const panel = page.locator(".rs-table-columns");
    await panel.getByLabel("Binding path", { exact: true }).fill("lines");
    await panel.getByLabel("Data field 1").fill("description");
    await panel.getByRole("button", { name: "Edit header rows" }).click();
    await panel.getByLabel("Header 1.1", { exact: true }).fill("Group");
    await panel.getByLabel("Column span 1.1").fill("2");
    await panel.getByRole("button", { name: "Remove header cell 1.2" }).click();
    await panel.getByRole("button", { name: "Add header row" }).click();
    await panel.getByRole("button", { name: "Add merge", exact: true }).click();
    await panel.getByLabel("Columns spanned 1").fill("2");
    await panel.getByLabel("Conditional table rows Condition expression").fill("row.amount < 0");
    await panel.getByRole("button", { name: "Add row rule" }).click();
    await panel.getByLabel("Condition expression 2").fill("row.amount > 0");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();
    const saved = JSON.parse(await readFile(path.join(folder, "invoice.report.json"), "utf8"));
    const table = saved.bands.flatMap((band: any) => band.elements).find((element: any) => element.type === "table" && element.props.headerRows);
    expect(table.props.headerRows).toHaveLength(2);
    expect(table.props.headerRows[0][0]).toMatchObject({ label: "Group", colSpan: 2 });
    expect(table.props.merges[0]).toMatchObject({ row: 0, col: 0, colSpan: 2 });
    expect(table.props.rowRules.map((rule: any) => rule.when)).toEqual(["row.amount < 0", "row.amount > 0"]);
    await page.reload();
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: /NATIVE.*invoice\.report\.json/ }).click();
    await page.locator(".rs-data").fill('{"lines":[{"description":"Merged value","amount":1}]}');
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.frameLocator("iframe").locator('th[colspan="2"]', { hasText: "Group" })).toBeVisible();
    await expect(page.frameLocator("iframe").locator('td[colspan="2"]', { hasText: "Merged value" })).toBeVisible();
  } finally { await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test("total builder creates a validated formula and previews the calculated total", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-total-builder-"));
  try {
    await createInvoice(page, folder);
    await page.locator(".rs-data").fill('{"lines":[{"amount":"10.10"},{"amount":"2.20"}]}');
    await page.getByRole("button", { name: "Field", exact: true }).click();
    const input = page.getByLabel("Dataset and field for total");
    await input.fill("lines.amount + 1");
    await expect(page.getByRole("button", { name: "Use total formula" })).toBeDisabled();
    await input.fill("lines.amount");
    await page.getByRole("button", { name: "Use total formula" }).click();
    await expect(page.getByLabel("Expression", { exact: true })).toHaveValue("FORMAT_NUMBER(SUM(lines.amount), 2)");
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.frameLocator("iframe").locator("body")).toContainText("12.30");
  } finally { await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test("multi-page table preview keeps every row visible without overlapping bands", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-paged-table-"));
  try {
    await createInvoice(page, folder);
    await page.locator(".rs-data").fill(JSON.stringify({ lines: Array.from({ length: 90 }, (_, i) => ({ description: `Row ${i + 1}`, quantity: 1, unitPrice: 1, amount: 1 })) }));
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const frame = page.frameLocator("iframe");
    await expect.poll(() => frame.locator(".report-page").count()).toBeGreaterThan(1);
    await expect(frame.locator(".el-table tbody tr")).toHaveCount(90);
    const invalid = await frame.locator(".el-table").evaluateAll((tables) => tables.flatMap((table) => {
      const box = table.getBoundingClientRect();
      return [...table.querySelectorAll("tbody tr")].filter((row) => row.getBoundingClientRect().bottom > box.bottom + 1).map(() => "clipped");
    }));
    expect(invalid).toEqual([]);
  } finally { await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test("conditional colors can be configured and rendered with sample data", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-report-condition-"));
  try {
    await createInvoice(page, folder);
    await page.locator(".rs-data").fill('{"invoice":{"total":150}}');
    await page.getByRole("button", { name: "Add text", exact: true }).click();
    await page.locator(".rs-right textarea").first().fill("Condition marker");
    await page.getByLabel("Condition expression").fill("invoice.total > 100");
    await page.getByLabel("Conditional fill color").fill("#aabbcc");
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.frameLocator("iframe").locator(".el-text", { hasText: "Condition marker" })).toHaveCSS("background-color", "rgb(170, 187, 204)");
  } finally { await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test("a narrative section flows over multiple report pages", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-report-narrative-"));
  try {
    await createInvoice(page, folder);
    await page.getByRole("button", { name: "Add flowing text section" }).click();
    const words = Array.from({ length: 800 }, (_, i) => `WORD${i.toString().padStart(4, "0")}`);
    await page.locator(".rs-right textarea").first().fill(words.join(" "));
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const frame = page.frameLocator("iframe");
    await expect.poll(() => frame.locator(".report-page").count()).toBeGreaterThan(1);
    await expect(frame.locator('.el-text[data-id^="el-narrative-"]').first()).toBeVisible();
    const fragments = await frame.locator('.el-text[data-id^="el-narrative-"]').allTextContents();
    expect(fragments.join(" ").trim().split(/\s+/)).toEqual(words);
    const clipped = await frame.locator('.el-text[data-id^="el-narrative-"]').evaluateAll((elements) => elements.filter((element) => element.scrollHeight > element.clientHeight + 2).length);
    expect(clipped).toBe(0);
  } finally { await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test("narrow viewport can reopen the reports and properties panels", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-narrow-"));
  try {
    await page.setViewportSize({ width: 900, height: 900 });
    await createInvoice(page, folder);
    const left = page.locator(".rs-left");
    const right = page.locator(".rs-right");
    if (await left.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "Reports", exact: true }).click();
    }
    await expect(left).toBeHidden();
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    await expect(left).toBeVisible();
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    await expect(left).toBeHidden();

    await page.getByRole("button", { name: "Properties", exact: true }).click();
    await expect(right).toBeVisible();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});


test("YRF source editing applies to design and saves a copy", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrfsource-"));
  const file = path.join(folder, "sample.yrf");
  const original = await readFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), "utf8");
  await writeFile(file, original);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    await page.getByRole("button", { name: "Code", exact: true }).click();
    await page.getByRole("button", { name: "Edit source" }).click();
    const editor = page.getByLabel("Code", { exact: true });
    await editor.fill(original.replace("Kop Halaman", "Kop Sumber"));
    await page.getByRole("button", { name: "Apply & save copy" }).click();

    const saved = page.getByText(/Copy saved/);
    await expect(saved).toBeVisible();
    const savedPath = (await saved.textContent())?.split(":").slice(1).join(":").trim();
    expect(savedPath).toBeTruthy();
    expect(await readFile(savedPath!, "utf8")).toContain("Kop Sumber");
    expect(await readFile(file, "utf8")).toBe(original);
    await expect(page.getByText("Kop Sumber").first()).toBeVisible();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("YRF objects can be dragged and resized before saving a copy", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrfdrag-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();

    const object = page.locator(".yrf-object").filter({ hasText: "Kop Halaman" }).first();
    await object.click();
    await expect(object).toHaveCSS("cursor", "move");
    for (const [handle, cursor] of Object.entries({ nw: "nwse-resize", n: "ns-resize", ne: "nesw-resize", e: "ew-resize", se: "nwse-resize", s: "ns-resize", sw: "nesw-resize", w: "ew-resize" }))
      await expect(page.locator(`[data-yrf-handle="${handle}"]`)).toHaveCSS("cursor", cursor);
    const box = await object.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.move(box!.x + box!.width / 2 + 40, box!.y + box!.height / 2, { steps: 8 });
    await page.mouse.up();

    await page.getByRole("button", { name: "Save copy", exact: true }).last().click();
    const saved = page.getByText(/Copy saved/);
    await expect(saved).toBeVisible();
    const savedPath = (await saved.textContent())?.split(":").slice(1).join(":").trim();
    const copy = JSON.parse(await readFile(savedPath!, "utf8"));
    const moved = copy.layout.pages[0].bands[0].objects[0];
    expect(moved.left).toBeGreaterThan(80);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("unsupported YRF objects do not advertise moving or resizing", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-yrf-cursor-"));
  const file = path.join(folder, "sample.yrf");
  const fixture = JSON.parse(await readFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), "utf8"));
  fixture.layout.pages[0].bands[0].objects.push({ type: "unsupportedKind", name: "unsupported", left: 20, top: 150, width: 200, height: 30 });
  await writeFile(file, JSON.stringify(fixture));
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    const object = page.locator('.yrf-object[title="unsupportedKind unsupported"]');
    await object.click();
    await expect(object).not.toHaveCSS("cursor", "move");
    await expect(page.locator(".yrf-handle")).toHaveCount(0);
  } finally { await rm(folder, { recursive: true, force: true }); }
});


test("parameters and band repeat persist after save", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-params-"));
  try {
    await createInvoice(page, folder);
    await page.getByRole("button", { name: "Add parameter" }).click();
    await page.getByLabel("Parameter name parameter-1").fill("customer");
    await page.getByRole("checkbox", { name: "Required", exact: true }).check();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByText(/Required parameter customer has no value/)).toBeVisible();
    await page.getByRole("button", { name: "Design", exact: true }).click();
    await page.getByLabel("Default value customer").fill("Example customer");
    const header = page.locator(".rs-tree > li").filter({ hasText: "pageHeader" });
    if (await header.locator("button").first().getAttribute("aria-expanded") !== "true") await header.locator("button").first().click();
    await header.getByRole("checkbox", { name: "Repeat" }).uncheck();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();
    const saved = JSON.parse(await readFile(path.join(folder, "invoice.report.json"), "utf8"));
    expect(saved.parameters).toHaveLength(1);
    expect(saved.parameters[0]).toMatchObject({ id: "customer", defaultValue: "Example customer" });
    expect(saved.bands.find((band: { kind: string }) => band.kind === "pageHeader").repeat).toBe(false);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});


test("multi-select aligns and deletes several native objects", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-multi-"));
  try {
    await createInvoice(page, folder);
    await page.locator('.rs-el[data-id="el-title"]').click();
    await page.locator('.rs-el[data-id="el-subtitle"]').click({ modifiers: ["Shift"] });
    await expect(page.locator(".rs-el.on")).toHaveCount(2);
    await expect(page.getByText("2 objects selected")).toBeVisible();

    await page.getByRole("button", { name: "Align left" }).click();
    const lefts = await page.locator(".rs-el.on").evaluateAll((elements) =>
      elements.map((element) => parseFloat((element as HTMLElement).style.left)),
    );
    expect(new Set(lefts).size).toBe(1);

    await page.getByRole("button", { name: "Remove element" }).click();
    await expect(page.locator(".rs-el.on")).toHaveCount(0);
    await expect(page.locator('.rs-el[data-id="el-title"]')).toHaveCount(0);
    await expect(page.locator('.rs-el[data-id="el-subtitle"]')).toHaveCount(0);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("YRF visual save refreshes the Code source and keeps earlier edits", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrfsync-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();

    const object = page.locator(".yrf-object").filter({ hasText: "Kop Halaman" }).first();
    await object.click();
    const box = await object.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 30, box!.y + box!.height / 2, { steps: 5 });
    await page.mouse.up();

    await page.getByRole("button", { name: "Save copy", exact: true }).last().click();
    const saved = page.getByText(/Copy saved/);
    await expect(saved).toBeVisible();
    const firstCopy = (await saved.textContent())?.split(":").slice(1).join(":").trim();

    await page.getByRole("button", { name: "Code", exact: true }).click();
    const editor = page.getByLabel("Code", { exact: true });
    const source = await editor.inputValue();
    expect(JSON.parse(source).layout.pages[0].bands[0].objects[0].left).toBeGreaterThan(80);

    await page.getByRole("button", { name: "Edit source" }).click();
    await editor.fill(source.replace("Kop Halaman", "Kop Setelah Drag"));
    await page.getByRole("button", { name: "Apply & save copy" }).click();
    const savedTwo = page.getByText(/Copy saved/).last();
    await expect.poll(async () => (await savedTwo.textContent())?.split(":").slice(1).join(":").trim()).not.toBe(firstCopy);
    const secondCopy = (await savedTwo.textContent())?.split(":").slice(1).join(":").trim();
    const parsed = JSON.parse(await readFile(secondCopy!, "utf8"));
    expect(parsed.layout.pages[0].bands[0].objects[0].left).toBeGreaterThan(80);
    expect(parsed.layout.pages[0].bands[0].objects[0].caption).toBe("Kop Setelah Drag");
    void firstCopy;
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("YRF unsaved changes prompt before leaving", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrfguard-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    await page.locator(".yrf-object").filter({ hasText: "Kop Halaman" }).first().click();
    await page.getByLabel("Caption").fill("Belum disimpan");

    await page.getByRole("button", { name: "← Back to native reports" }).click();
    const dialog = page.getByRole("dialog", { name: "Unsaved YRF changes" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("WaiReport (.yrf)").first()).toBeVisible();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("YRF resize handles change the saved width", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrfresize-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    await page.locator(".yrf-object").filter({ hasText: "Kop Halaman" }).first().click();

    const handle = page.locator('[data-yrf-handle="se"]');
    await expect(handle).toBeVisible();
    const box = await handle.boundingBox();
    await page.mouse.move(box!.x + 4, box!.y + 4);
    await page.mouse.down();
    await page.mouse.move(box!.x + 54, box!.y + 24, { steps: 5 });
    await page.mouse.up();
    await page.getByRole("button", { name: "Save copy", exact: true }).last().click();
    const saved = page.getByText(/Copy saved/);
    await expect(saved).toBeVisible();
    const copyPath = (await saved.textContent())?.split(":").slice(1).join(":").trim();
    const parsed = JSON.parse(await readFile(copyPath!, "utf8"));
    expect(parsed.layout.pages[0].bands[0].objects[0].width).toBeGreaterThan(1200);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});


test("formatting palette, borders, rotation and grouping persist", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-format-"));
  try {
    await createInvoice(page, folder);
    await page.locator('.rs-el[data-id="el-title"]').click();
    await page.getByRole("button", { name: "Underline" }).click();
    await page.getByRole("button", { name: "Strikethrough" }).click();
    await page.getByRole("button", { name: "Numbered list" }).click();
    await page.getByLabel("Border width").fill("0.6");
    await page.getByLabel("Rotation").fill("5");
    await expect(page.locator('.rs-el[data-id="el-title"]')).toHaveCSS(
      "text-decoration-line",
      /underline line-through|underline/,
    );

    await page.locator('.rs-el[data-id="el-title"]').click();
    await page.locator('.rs-el[data-id="el-subtitle"]').click({ modifiers: ["Shift"] });
    await expect(page.getByText("2 objects selected")).toBeVisible();
    await page.getByRole("button", { name: "Group", exact: true }).click();
    await page.locator(".rs-canvas").click({ position: { x: 5, y: 5 } });
    await page.locator('.rs-el[data-id="el-title"]').click();
    await expect(page.getByText("2 objects selected")).toBeVisible();
    await page.getByRole("button", { name: "Ungroup" }).click();

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();
    const saved = JSON.parse(await readFile(path.join(folder, "invoice.report.json"), "utf8"));
    const title = saved.bands[0].elements.find((element: { id: string }) => element.id === "el-title");
    expect(title.props.underline).toBe(true);
    expect(title.props.strike).toBe(true);
    expect(title.props.list).toBe("number");
    expect(title.props.borderWidth).toBe(0.6);
    expect(title.props.rotation).toBe(5);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("YRF canvas switching preserves a caption draft and guards leaving", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrfdraft-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    await page.locator(".yrf-object").filter({ hasText: "Kop Halaman" }).first().click();
    await page.getByLabel("Caption").fill("Draft yang aman");
    await page.locator(".yrf-object").filter({ hasText: "Judul Sintetis" }).first().click();
    await page.getByRole("button", { name: "← Back to native reports" }).click();
    const dialog = page.getByRole("dialog", { name: "Unsaved YRF changes" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.locator(".yrf-object").filter({ hasText: "Draft yang aman" }).first().click();
    await expect(page.getByLabel("Caption")).toHaveValue("Draft yang aman");
    await page.getByRole("button", { name: "Save copy", exact: true }).last().click();
    const saved = await page.getByText(/Copy saved/).textContent();
    const copy = JSON.parse(await readFile(saved!.split(":").slice(1).join(":").trim(), "utf8"));
    expect(copy.layout.pages[0].bands[0].objects[0].caption).toBe("Draft yang aman");
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("YRF preview and saved copy use the same typed value after a drag", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrfvalue-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    const object = page.locator(".yrf-object").filter({ hasText: "Kop Halaman" }).first();
    await object.click();
    const box = (await object.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 5 }); await page.mouse.up();
    await page.getByLabel("left", { exact: true }).fill("250");
    await page.getByRole("button", { name: "Preview change" }).click();
    await expect(page.locator(".yrf-diff")).toContainText("After: 250");
    await page.getByRole("button", { name: "Save copy", exact: true }).last().click();
    const saved = await page.getByText(/Copy saved/).textContent();
    const copy = JSON.parse(await readFile(saved!.split(":").slice(1).join(":").trim(), "utf8"));
    expect(copy.layout.pages[0].bands[0].objects[0].left).toBe(250);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("native report typography affects the design canvas", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-type-"));
  try {
    await createInvoice(page, folder);
    const title = page.locator('.rs-el[data-id="el-title"]');
    await title.click();
    await page.getByLabel("Font family").fill("Georgia");
    await page.getByLabel("Font weight").selectOption("700");
    await page.getByRole("checkbox", { name: "Italic" }).check();
    await page.getByLabel("Line height").fill("1.8");
    await expect(title).toHaveCSS("font-family", /Georgia/);
    await expect(title).toHaveCSS("font-weight", "700");
    await expect(title).toHaveCSS("font-style", "italic");
    await expect(title).toHaveCSS("line-height", /43\.2px/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("alignment and grouping explain when selection crosses bands", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-cross-band-"));
  try {
    await createInvoice(page, folder);
    await page.locator('.rs-el[data-id="el-title"]').click();
    await page.locator('.rs-el[data-id="el-seller"]').click({ modifiers: ["Shift"] });
    await expect(page.getByText("Align and group objects within the same band.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Align top" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Group", exact: true })).toBeDisabled();
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("YRF Code draft is guarded before returning to Design", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrfcodedraft-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    await page.getByRole("button", { name: "Code", exact: true }).click();
    await page.getByRole("button", { name: "Edit source" }).click();
    const code = page.getByLabel("Code", { exact: true });
    await code.fill((await code.inputValue()).replace("Kop Halaman", "Code draft"));
    await page.getByRole("button", { name: "Design (approximate)" }).click();
    const dialog = page.getByRole("dialog", { name: "Unsaved YRF changes" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(code).toHaveValue(/Code draft/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("YRF textbox using text and dataField is editable and saves a copy", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrf-textbox-"));
  const file = path.join(folder, "textbox.yrf");
  const document = JSON.parse(await readFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), "utf8"));
  const textbox = document.layout.pages[0].bands[1].objects[0];
  delete textbox.caption;
  textbox.text = "";
  textbox.dataField = "invoice.number";
  const original = JSON.stringify(document, null, 2);
  await writeFile(file, original);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    await expect(page.locator(".yrf-object.on")).toHaveCount(1);
    await selectYrfTreeObject(page, "textbox · tb");
    await expect(page.getByLabel("Caption")).toBeEnabled();
    await page.getByLabel("Caption").fill("Customer");
    await page.getByLabel("Data field").fill("invoice.customer");
    await page.getByRole("button", { name: "Save copy", exact: true }).last().click();
    const saved = await page.getByText(/Copy saved/).textContent();
    const copy = JSON.parse(await readFile(saved!.split(":").slice(1).join(":").trim(), "utf8"));
    expect(copy.layout.pages[0].bands[1].objects[0].text).toBe("Customer");
    expect(copy.layout.pages[0].bands[1].objects[0].dataField).toBe("invoice.customer");
    expect(await readFile(file, "utf8")).toBe(original);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("YRF palette adds and drags objects into a report and saves a copy", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrf-palette-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  const original = await readFile(file, "utf8");
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    await expect(page.getByRole("heading", { name: "Palette" })).toBeVisible();
    await page.locator(".yrf-palette").getByRole("button", { name: "Text" }).click();
    await page.getByLabel("Caption").fill("New report text");
    const band = page.locator(".yrf-band").nth(1);
    await page.locator(".yrf-palette").getByRole("button", { name: "Field" }).dragTo(band);
    await page.getByLabel("Data field").fill("invoice.customer");
    await page.getByRole("button", { name: "Save copy", exact: true }).last().click();
    const saved = await page.getByText(/Copy saved/).textContent();
    const copy = JSON.parse(await readFile(saved!.split(":").slice(1).join(":").trim(), "utf8"));
    const objects = [...copy.layout.pages.flatMap((entry: any) => entry.bands.flatMap((item: any) => item.objects)), ...(copy.layout.reportHeader?.objects ?? []), ...(copy.layout.reportFooter?.objects ?? [])];
    expect(objects.some((object: any) => object.caption === "New report text")).toBe(true);
    expect(objects.some((object: any) => object.dataField === "invoice.customer")).toBe(true);
    expect(await readFile(file, "utf8")).toBe(original);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("YRF image and static table and form layouts save to a copy", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrf-image-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  const original = await readFile(file, "utf8");
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    await page.locator(".yrf-palette").getByRole("button", { name: "Image" }).click();
    await page.getByLabel("Import image").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aWQAAAAASUVORK5CYII=", "base64") });
    await expect(page.locator(".yrf-object.kind-image img")).toBeVisible();
    await page.locator(".yrf-right").getByLabel("width", { exact: true }).fill("650");
    await page.locator(".yrf-palette").getByRole("button", { name: "Table layout" }).click();
    await page.locator(".yrf-palette").getByRole("button", { name: "Form layout" }).dragTo(page.locator(".yrf-band").first());
    await page.getByRole("button", { name: "Save copy", exact: true }).last().click();
    const saved = await page.getByText(/Copy saved/).textContent();
    const copy = JSON.parse(await readFile(saved!.split(":").slice(1).join(":").trim(), "utf8"));
    const objects = [...copy.layout.pages.flatMap((entry: any) => entry.bands.flatMap((item: any) => item.objects)), ...(copy.layout.reportHeader?.objects ?? []), ...(copy.layout.reportFooter?.objects ?? [])];
    expect(objects.some((object: any) => object.type === "image" && object.width === 650 && object.data.startsWith("data:image/png;base64,"))).toBe(true);
    expect(objects.some((object: any) => object.caption === "Column 1")).toBe(true);
    expect(objects.some((object: any) => object.caption === "Field")).toBe(true);
    expect(await readFile(file, "utf8")).toBe(original);
  } finally { await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test("YRF zoom, raw ruler and colors apply to a saved copy", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-yrf-view-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  const original = await readFile(file, "utf8");
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    const paper = page.locator(".yrf-page");
    const initial = await paper.evaluate((element) => element.getBoundingClientRect().width);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    expect(await paper.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(initial);
    await page.getByRole("button", { name: "Grid", exact: true }).click();
    await expect(paper).toHaveCSS("background-image", /linear-gradient/);
    await page.getByRole("button", { name: "Ruler", exact: true }).click();
    await expect(paper.locator(".report-rulers")).toContainText("raw units");
    await page.locator(".yrf-palette").getByRole("button", { name: "Box", exact: true }).click();
    await page.getByLabel("Fill color").fill("#aabbcc");
    await page.getByLabel("Border color").fill("#123456");
    const box = page.locator(".yrf-object.kind-shape.on");
    await expect(box).toHaveCSS("background-color", "rgb(170, 187, 204)");
    await expect(box).toHaveCSS("border-top-color", "rgb(18, 52, 86)");
    const beforeLeft = Number(await page.getByLabel("left", { exact: true }).inputValue());
    const bounds = await box.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width / 2 + 25, bounds!.y + bounds!.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => Number(await page.getByLabel("left", { exact: true }).inputValue())).toBeGreaterThan(beforeLeft);
    await page.getByRole("button", { name: "Save copy", exact: true }).last().click();
    const saved = await page.getByText(/Copy saved/).textContent();
    const copy = JSON.parse(await readFile(saved!.split(":").slice(1).join(":").trim(), "utf8"));
    const objects = [...copy.layout.pages.flatMap((entry: any) => entry.bands.flatMap((band: any) => band.objects)), ...(copy.layout.reportHeader?.objects ?? []), ...(copy.layout.reportFooter?.objects ?? [])];
    expect(objects.some((object: any) => object.type === "shape" && object.style?.includes("background-color: #aabbcc") && object.style?.includes("border-color: #123456"))).toBe(true);
    expect(await readFile(file, "utf8")).toBe(original);
  } finally { await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test("YRF endpoint lines move and existing scalar values can be edited", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrf-line-"));
  const file = path.join(folder, "line.yrf");
  const document = JSON.parse(await readFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), "utf8"));
  const line = document.layout.pages[0].bands[1].objects[1];
  delete line.left; delete line.top; delete line.width; delete line.height;
  Object.assign(line, { x1: 80, y1: 160, x2: 600, y2: 160, style: "color:blue", visible: true });
  await writeFile(file, JSON.stringify(document, null, 2));
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    await selectYrfTreeObject(page, "line · ln");
    await expect(page.getByLabel("left", { exact: true })).toBeEnabled();
    await page.getByLabel("left", { exact: true }).fill("100");
    await page.getByLabel("style", { exact: true }).fill("color:red");
    await page.getByLabel("style", { exact: true }).blur();
    await page.getByLabel("visible", { exact: true }).selectOption("false");
    await page.getByRole("button", { name: "Save copy", exact: true }).last().click();
    const saved = await page.getByText(/Copy saved/).textContent();
    const copy = JSON.parse(await readFile(saved!.split(":").slice(1).join(":").trim(), "utf8"));
    expect(copy.layout.pages[0].bands[1].objects[1].x1).toBe(100);
    expect(copy.layout.pages[0].bands[1].objects[1].x2).toBe(620);
    expect(copy.layout.pages[0].bands[1].objects[1].style).toBe("color:red");
    expect(copy.layout.pages[0].bands[1].objects[1].visible).toBe(false);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("YRF can remove an existing object and save a copy", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrf-remove-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  const original = await readFile(file, "utf8");
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    await selectYrfTreeObject(page, "textbox · tb");
    await page.getByRole("button", { name: "Remove object" }).click();
    await expect(page.locator(".yrf-tree button").filter({ hasText: "textbox · tb" })).toHaveCount(0);
    await page.getByRole("button", { name: "Save copy", exact: true }).first().click();
    const saved = await page.getByText(/Copy saved/).textContent();
    const copy = JSON.parse(await readFile(saved!.split(":").slice(1).join(":").trim(), "utf8"));
    expect(copy.layout.pages[0].bands[1].objects.some((object: any) => object.name === "tb")).toBe(false);
    expect(await readFile(file, "utf8")).toBe(original);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("YRF exit protects unsaved changes", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrf-exit-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    await page.getByLabel("Caption").fill("Unsaved");
    await page.getByRole("button", { name: "Exit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Unsaved YRF changes" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByLabel("Caption")).toHaveValue("Unsaved");
  } finally { await rm(folder, { recursive: true, force: true }); }
});


test("palette is grouped with icons, remove is red and exit is available", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-ui-"));
  try {
    await createInvoice(page, folder);
    await expect(page.getByText("Text & data")).toBeVisible();
    await expect(page.getByText("Layout", { exact: true })).toBeVisible();
    await expect(page.getByText("Tables", { exact: true })).toBeVisible();
    expect(await page.locator(".rs-palette svg").count()).toBeGreaterThanOrEqual(7);

    await page.locator('.rs-el[data-id="el-title"]').click();
    const remove = page.getByRole("button", { name: "Remove element" });
    await expect(remove).toBeVisible();
    const background = await remove.evaluate((element) => getComputedStyle(element).backgroundColor);
    const channels = background.match(/\d+/g)?.map(Number) ?? [0, 0, 0];
    expect(channels[0]).toBeGreaterThan(120);
    expect(channels[1]).toBeLessThan(120);

    await page.getByRole("button", { name: "Exit" }).click();
    await expect(page.getByRole("button", { name: /Report Studio/ })).toBeVisible();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("YRF canvas distinguishes object kinds instead of uniform boxes", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrfstyle-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    await expect(page.locator(".yrf-object.kind-label").first()).toBeVisible();
    await expect(page.locator(".yrf-object.kind-line").first()).toBeVisible();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});


test("existing YRF style reflects on canvas and in the saved copy", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrfstyle2-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();
    await page.getByRole("button", { name: /^label · ph$/ }).click();

    const object = page.locator(".yrf-object.on");
    await expect(object).toHaveCSS("font-weight", "700");
    await page.locator(".yrf-style-chips").getByRole("button", { name: "Italic" }).click();
    await expect(object).toHaveCSS("font-style", "italic");

    await page.getByRole("button", { name: "Save copy", exact: true }).last().click();
    const saved = page.getByText(/Copy saved/);
    await expect(saved).toBeVisible();
    const copyPath = (await saved.textContent())?.split(":").slice(1).join(":").trim();
    const copy = JSON.parse(await readFile(copyPath!, "utf8"));
    const style = copy.layout.pages[0].bands[0].objects[0].style;
    expect(style).toContain("font-style: italic");
    expect(style).toContain("font-weight: bold");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("YRF multi-select alignment is written to the saved copy", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-yrfalign-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("button", { name: "YRF (.yrf)" }).click();
    await page.getByLabel("YRF file path").fill(file);
    await page.getByRole("button", { name: "Open .yrf" }).click();

    await selectYrfTreeObject(page, "label · hd");
    await selectYrfTreeObject(page, "label · ph", true);
    await expect(page.getByText("2 objects selected")).toBeVisible();
    await page.getByRole("button", { name: "Align left" }).click();

    await page.getByRole("button", { name: "Save copy", exact: true }).last().click();
    const saved = page.getByText(/Copy saved/);
    await expect(saved).toBeVisible();
    const copyPath = (await saved.textContent())?.split(":").slice(1).join(":").trim();
    const copy = JSON.parse(await readFile(copyPath!, "utf8"));
    const headerLeft = copy.layout.reportHeader.objects[0].left;
    const pageLeft = copy.layout.pages[0].bands[0].objects[0].left;
    expect(headerLeft).toBe(pageLeft);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});


test("structure sections can be reordered and persist", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-reorder-"));
  try {
    await createInvoice(page, folder);
    await page.getByRole("button", { name: "Move section down: reportTitle" }).click();
    await page.locator(".rs-tree > li > button").first().click();
    await page.getByRole("checkbox", { name: "Page break before" }).first().check();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();
    const saved = JSON.parse(await readFile(path.join(folder, "invoice.report.json"), "utf8"));
    expect(saved.bands[0].kind).not.toBe("reportTitle");
    expect(saved.bands[1].kind).toBe("reportTitle");
    expect(saved.bands.some((band: { pageBreakBefore?: boolean }) => band.pageBreakBefore === true)).toBe(true);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("pre-analysis template creates, saves, reopens and exports", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-pretpl-"));
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await setReportFolder(page, folder);
    await page.getByRole("button", { name: /Create new report/i }).click();
    await page.getByRole("button", { name: /Credit pre-analysis/ }).click();
    await page.getByRole("button", { name: "Create report", exact: true }).click();
    await expect(page.locator(".rs-page")).toBeVisible();
    await expect(page.getByText("LAPORAN ANALISIS KREDIT").first()).toBeVisible();
    await page.locator('.rs-el[data-id="el-pre-title"]').click();
    await page.getByLabel("Content").fill("LAPORAN ANALISIS KREDIT 2026");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();
    const savedPath = path.join(folder, "preAnalysis.report.json");
    const saved = JSON.parse(await readFile(savedPath, "utf8"));
    expect(saved.bands.some((band: { id: string }) => band.id === "band-signature")).toBe(true);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const download = await downloadPromise;
    expect(await download.path()).not.toBeNull();
    await page.getByRole("button", { name: "Back to home" }).click();
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await expect(page.getByRole("button", { name: /preAnalysis|Pra-analisis|Credit pre-analysis/ }).first()).toBeVisible();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
