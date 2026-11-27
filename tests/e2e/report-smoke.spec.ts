import { test, expect } from "./studio-fixture.js";
import { copyFile, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/pick-directory", (route) => route.fulfill({ json: { path: "", unavailable: false } }));
  await page.addInitScript(() => {
    if (window.top !== window) return;
    localStorage.setItem("uiux-language", "en");
    localStorage.setItem("uiux-theme", "light");
  });
});

async function openStudio(page: import("@playwright/test").Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Report Studio/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("Indonesian Home and Report guides fit and retain keyboard focus on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 720 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("id");
  await expect(page.getByRole("button", { name: "Riwayat perubahan" })).toBeInViewport({ ratio: 0.99 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  const homeGuide = page.locator(".guide-front-card");
  await homeGuide.press("Enter");
  const homeDialog = page.getByRole("dialog", { name: "Panduan pengguna interaktif" });
  await expect(homeDialog).toBeVisible();
  for (let step = 0; step < 8; step++) {
    await page.keyboard.press("Tab");
    const focused = await homeDialog.evaluate(dialog => {
      const active = document.activeElement;
      if (!active || !dialog.contains(active)) return false;
      const box = active.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth;
    });
    expect(focused).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(homeGuide).toBeFocused();
  await page.getByRole("combobox", { name: "Bahasa", exact: true }).selectOption("en");
  await page.getByRole("button", { name: /Report Studio/ }).click();
  await page.getByRole("button", { name: "Open existing report" }).click();
  const guide = page.getByRole("button", { name: "Report guide", exact: true });
  await guide.press("Enter");
  const guideDialog = page.getByRole("dialog", { name: "Report guide" });
  await expect(guideDialog.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(guideDialog.getByRole("button", { name: "Next" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(guide).toBeFocused();
});

test("Open existing report opens the folder picker and remembers the selected folder", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux smoke folder – "));
  const pickerStartPaths: string[] = [];
  try {
    const canonicalFolder = await realpath(folder);
    await copyFile(path.resolve("fixtures/reports/synthetic/invoice.report.json"), path.join(folder, "invoice.report.json"));
    await page.route("**/api/pick-directory", (route) => {
      pickerStartPaths.push(route.request().postDataJSON().startPath);
      return route.fulfill({ json: { path: pickerStartPaths.length === 1 ? folder : "", unavailable: false } });
    });
    await openStudio(page);
    const launcher = page.getByRole("dialog");
    const open = launcher.getByRole("button", { name: "Open existing report" });
    await expect(launcher.getByRole("button")).toHaveCount(2);
    await open.click();
    await expect(launcher).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Search reports" })).toBeFocused();
    const folderInput = page.getByRole("textbox", { name: "Report folder", exact: true });
    await expect(folderInput).toHaveCount(1);
    await expect(folderInput).toHaveValue(canonicalFolder);
    await expect(page.getByText(canonicalFolder, { exact: false })).toHaveCount(0);
    expect(pickerStartPaths).toEqual([expect.stringMatching(/[\\/]Documents[\\/]React UIUX Reports$/)]);
    const report = page.getByRole("button", { name: /invoice\.report\.json/ });
    await report.click();
    await expect(page.getByRole("textbox", { name: "Report title" })).toHaveValue("Invoice / Faktur");

    await page.getByRole("button", { name: "Back to home" }).click();
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await open.click();
    await expect(page.getByRole("textbox", { name: "Search reports" })).toBeFocused();
    await report.click();
    await expect(page.getByRole("textbox", { name: "Report title" })).toHaveValue("Invoice / Faktur");
    expect(pickerStartPaths).toHaveLength(2);
    expect(pickerStartPaths[1]).toBe(canonicalFolder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("Report Studio explains picker failure and accepts a manual folder", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-smoke-folder-"));
  try {
    await openStudio(page);
    await page.getByRole("button", { name: "Open existing report" }).click();
    const folderInput = page.getByPlaceholder("/path/to/reports");
    await expect(page.getByRole("textbox", { name: "Search reports" })).toBeFocused();
    await expect(page.getByRole("alert")).toHaveCount(0);

    await page.route("**/api/pick-directory", (route) => route.fulfill({ json: { path: "", unavailable: true } }));
    await page.getByRole("button", { name: "Choose report folder" }).click();
    const pickerError = page.getByRole("alert").filter({ hasText: "The folder picker could not open." });
    await expect(pickerError).toBeVisible();
    await expect(folderInput).toBeFocused();
    await folderInput.fill(folder);
    await page.getByRole("button", { name: "Use folder" }).click();
    await expect(folderInput).toHaveValue(await realpath(folder));
    await expect(page.getByRole("button", { name: "Use folder" })).toBeDisabled();
    await expect(pickerError).toHaveCount(0);
    await expect(page.getByText("No reports found in this folder yet.")).toBeVisible();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("changing report folder keeps the draft and saves only to the original path", async ({ page }) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "uiux-report-save-path-"));
  const other = await mkdtemp(path.join(os.tmpdir(), "uiux-report-save-copy-"));
  const name = "invoice.report.json";
  const original = path.join(directory, name);
  const copy = path.join(other, name);
  try {
    await copyFile(path.resolve("fixtures/reports/synthetic/invoice.report.json"), original);
    await copyFile(original, copy);
    const content = await readFile(original, "utf8");
    await openStudio(page);
    await page.getByRole("button", { name: "Open existing report" }).click();
    const folder = page.getByRole("textbox", { name: "Report folder", exact: true });
    const use = page.getByRole("button", { name: "Use folder" });
    await folder.fill(directory);
    await use.click();
    await page.locator(".rs-files button").filter({ hasText: name }).click();
    const title = page.getByRole("textbox", { name: "Report title" });
    await title.fill("Original report updated");
    await folder.fill(other);
    await use.click();
    await expect(use).toBeDisabled();
    const save = page.getByRole("button", { name: "Save", exact: true });
    await save.click();
    await expect(page.getByText(/Switch back to its original folder to save this draft/)).toBeVisible();
    await expect(title).toHaveValue("Original report updated");
    expect(await readFile(original, "utf8")).toBe(content);
    expect(await readFile(copy, "utf8")).toBe(content);
    await folder.fill(directory);
    await use.click();
    await expect(use).toBeDisabled();
    await save.click();
    await expect.poll(() => readFile(original, "utf8")).toContain("Original report updated");
    expect(await readFile(copy, "utf8")).toBe(content);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(other, { recursive: true, force: true });
  }
});

test("sample data is restored per report and malformed imports preserve it", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-report-samples-"));
  try {
    for (const name of ["first", "second"]) {
      await copyFile(path.resolve("fixtures/reports/synthetic/invoice.report.json"), path.join(folder, `${name}.report.json`));
    }
    await openStudio(page);
    await page.getByRole("button", { name: "Open existing report" }).click();
    await page.getByRole("textbox", { name: "Report folder", exact: true }).fill(folder);
    await page.getByRole("button", { name: "Use folder" }).click();
    const first = page.locator(".rs-files button").filter({ hasText: "first.report.json" });
    const second = page.locator(".rs-files button").filter({ hasText: "second.report.json" });
    await first.click();
    const sample = page.getByRole("textbox", { name: "Sample data" });
    const dataset = page.getByRole("combobox", { name: "Import dataset" });
    await dataset.selectOption("lines");
    const input = page.locator('input[type="file"][accept^=".csv"]');
    await input.setInputFiles({ name: "good.tsv", mimeType: "text/tab-separated-values", buffer: Buffer.from("description\tamount\nFirst sample\t123") });
    await expect(sample).toHaveValue(/First sample/);
    const original = await sample.inputValue();
    await input.setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("description,description\nA,B") });
    await expect(page.getByText("CSV contains duplicate header names")).toBeVisible();
    await expect(sample).toHaveValue(original);
    await second.click();
    await expect(sample).toHaveValue("");
    await first.click();
    await expect(sample).toHaveValue(original);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Report Studio" }).click();
    await page.getByRole("button", { name: "Open existing report" }).click();
    await first.click();
    await expect(sample).toHaveValue(original);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("native and YRF dialogs retain keyboard focus and guard draft navigation", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-report-draft-flow-"));
  try {
    await copyFile(path.resolve("fixtures/reports/synthetic/invoice.report.json"), path.join(folder, "invoice.report.json"));
    await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), path.join(folder, "sample.yrf"));
    await openStudio(page);
    await page.getByRole("button", { name: "Open existing report" }).click();
    await page.getByRole("textbox", { name: "Report folder", exact: true }).fill(folder);
    await page.getByRole("button", { name: "Use folder" }).click();
    await page.locator(".rs-files button").filter({ hasText: "invoice.report.json" }).click();
    const title = page.getByRole("textbox", { name: "Report title" });
    await title.fill("Draft title");
    const yrf = page.locator(".rs-files button").filter({ hasText: "sample.yrf" });
    await yrf.click();
    const nativeDialog = page.getByRole("dialog", { name: "Unsaved changes" });
    await expect(nativeDialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(nativeDialog.getByRole("button", { name: /save/i }).first()).toBeVisible();
    expect(await nativeDialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(nativeDialog).toHaveCount(0);
    await expect(yrf).toBeFocused();
    await expect(title).toHaveValue("Draft title");
    await yrf.click();
    await nativeDialog.getByRole("button", { name: /discard/i }).click();

    await page.getByLabel("Caption").fill("YRF draft title");
    await page.setViewportSize({ width: 360, height: 900 });
    const panels = page.getByRole("navigation", { name: "Editor panels" });
    await panels.getByRole("button", { name: "Properties" }).click();
    await expect(page.getByLabel("Caption")).toHaveValue("YRF draft title");
    await expect(page.locator(".yrf-canvas-wrap")).toBeHidden();
    const exit = page.getByRole("button", { name: "Exit", exact: true });
    await exit.click();
    const yrfDialog = page.getByRole("dialog", { name: "Unsaved YRF changes" });
    await expect(yrfDialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    expect(await yrfDialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(yrfDialog).toHaveCount(0);
    await expect(exit).toBeFocused();
    await expect(page.getByLabel("Caption")).toHaveValue("YRF draft title");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("Report Studio create flow writes a native report to the default folder", async ({ page }) => {
  let pickerCalls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/pick-directory")) pickerCalls += 1;
  });
  await openStudio(page);
  await page.getByRole("dialog").getByRole("button", { name: "Create new report" }).click();
  const folder = page.getByRole("textbox", { name: "Report folder", exact: true });
  await expect(folder).toHaveValue(/[\\/]Documents[\\/]React UIUX Reports$/);
  await expect(page.getByRole("button", { name: "Choose report folder" })).toBeFocused();
  await page.getByRole("button", { name: "Create report", exact: true }).click();
  await expect(page.locator(".rs-page")).toBeVisible({ timeout: 20_000 });
  const files = await readdir(await folder.inputValue());
  expect(files.some((name) => name.endsWith(".report.json"))).toBe(true);
  expect(pickerCalls).toBe(0);
});

test("YRF one Save updates the opened original without a backup", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-smoke-yrf-"));
  const file = path.join(folder, "sample.yrf");
  await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
  try {
    await page.goto("/");
    const origin = new URL(page.url()).origin;
    const session = (await (await page.request.get("/api/session")).json()) as { token: string };
    await page.request.post("/api/reports/root", {
      headers: { origin, "x-uiux-token": session.token },
      data: { path: folder },
    });
    await page.getByRole("button", { name: /Report Studio/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Open existing report" }).click();
    await page.locator(".rs-files button").filter({ hasText: "sample.yrf" }).click();
    await expect(page.locator(".yrf")).toBeVisible({ timeout: 20_000 });
    await page.locator(".yrf-tree button").filter({ hasText: "label · ph" }).click();
    await page.getByLabel("Caption").fill("Smoke caption");
    await page.getByRole("button", { name: "Save", exact: true }).last().click();
    await expect(page.getByText(/Original updated/)).toBeVisible();
    expect(await readFile(file, "utf8")).toContain("Smoke caption");
    expect((await readdir(folder)).filter((name) => name.includes(".bak-")).length).toBe(0);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("Report launcher traps focus and the toolbar fits desktop, tablet and mobile", async ({ page }, info) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-responsive-report-"));
  try {
    await openStudio(page);
    const dialog = page.getByRole("dialog", { name: "How do you want to start?" });
    const open = dialog.getByRole("button", { name: "Open existing report" });
    const create = dialog.getByRole("button", { name: "Create new report" });
    await expect(open).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(create).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(open).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(create).toBeFocused();
    await page.keyboard.press("Escape");
    const launcher = page.getByRole("button", { name: /Report Studio/ });
    await expect(launcher).toBeFocused();
    await launcher.press("Enter");
    await create.press("Enter");
    const folderInput = page.getByPlaceholder("/path/to/reports");
    const choose = page.getByRole("button", { name: "Choose report folder" });
    await expect(choose).toBeFocused();
    await page.route("**/api/pick-directory", (route) => route.fulfill({ json: { path: folder, unavailable: false } }));
    await choose.press("Enter");
    await expect(folderInput).toHaveValue(await realpath(folder));
    const createReport = page.getByRole("button", { name: "Create report", exact: true });
    await expect(createReport).toBeEnabled();
    await createReport.press("Enter");
    const title = page.getByRole("textbox", { name: "Report title" });
    await expect(title).toBeVisible();
    await title.fill("Responsive invoice");
    const toolbar = page.locator(".rs-bar-actions");
    for (const width of [1440, 768, 360]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      for (const name of ["Preview", "Export", "Save"]) {
        const action = toolbar.getByRole("button", { name, exact: true });
        await expect(action).toBeInViewport({ ratio: 0.99 });
      }
      await page.screenshot({ path: info.outputPath(`report-studio-${width}.png`) });
    }
    await toolbar.getByRole("button", { name: "Save", exact: true }).press("Enter");
    await expect.poll(async () => (await readFile(path.join(folder, "invoice.report.json"), "utf8")).includes("Responsive invoice")).toBe(true);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("PDF export asks before downloading changes to content and invalid data stays in the editor", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-export-preview-"));
  try {
    await copyFile(path.resolve("fixtures/reports/synthetic/invoice.report.json"), path.join(folder, "invoice.report.json"));
    await openStudio(page);
    await page.getByRole("dialog").getByRole("button", { name: "Open existing report" }).click();
    await page.getByPlaceholder("/path/to/reports").fill(folder);
    await page.getByRole("button", { name: "Use folder" }).click();
    await page.locator(".rs-files button").filter({ hasText: "invoice.report.json" }).click();
    const data = page.locator(".rs-data");
    const exporter = page.getByRole("button", { name: "Export", exact: true });
    await data.fill("{ incomplete");
    await exporter.click();
    await expect(page.getByText(/Fix the sample data before previewing or exporting/)).toBeVisible();
    await expect(data).toHaveValue("{ incomplete");
    await data.fill(JSON.stringify({ invoice: { customerName: "Unicode Ω example" } }));
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.frameLocator("iframe").getByText("Unicode Ω example", { exact: true })).toBeVisible();
    const downloaded: string[] = [];
    page.on("download", download => downloaded.push(download.suggestedFilename()));
    await exporter.click();
    const confirmation = page.getByRole("dialog", { name: "Review export warnings" });
    await expect(confirmation).toContainText("unsupported character");
    expect(downloaded).toEqual([]);
    await confirmation.getByRole("button", { name: "Change format" }).click();
    const format = page.getByRole("combobox", { name: "Export" });
    await expect(format).toBeFocused();
    await format.selectOption("html");
    const html = page.waitForEvent("download");
    await exporter.click();
    expect((await html).suggestedFilename()).toMatch(/\.html$/);
    await format.selectOption("pdf");
    await exporter.click();
    await expect(confirmation).toBeVisible();
    const pdf = page.waitForEvent("download");
    await confirmation.getByRole("button", { name: "Download anyway" }).click();
    expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("YRF draft uses one undo step for a drag and keeps source unchanged until keyboard Save", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-yrf-history-"));
  const file = path.join(folder, "sample.yrf");
  try {
    await copyFile(path.resolve("fixtures/reports/synthetic/yrf/minimal.yrf"), file);
    const original = await readFile(file, "utf8");
    await openStudio(page);
    await page.getByRole("dialog").getByRole("button", { name: "Open existing report" }).click();
    await page.getByPlaceholder("/path/to/reports").fill(folder);
    await page.getByRole("button", { name: "Use folder" }).click();
    await page.locator(".rs-files button").filter({ hasText: "sample.yrf" }).click();
    const caption = page.getByLabel("Caption");
    await caption.fill("Draft heading");
    const object = page.locator(".yrf-object").filter({ hasText: "Draft heading" }).first();
    const previousX = (await object.boundingBox())!.x;
    const box = (await object.boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 42, box.y + box.height / 2, { steps: 7 });
    await page.mouse.up();
    await expect.poll(async () => (await object.boundingBox())!.x).toBeGreaterThan(previousX + 20);
    const undo = page.getByRole("button", { name: "Undo YRF draft change" });
    await undo.focus();
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => (await object.boundingBox())!.x).toBeCloseTo(previousX, 0);
    await undo.click();
    await expect(caption).toHaveValue("Kop Halaman");
    const redo = page.getByRole("button", { name: "Redo YRF draft change" });
    await redo.click();
    await expect(caption).toHaveValue("Draft heading");
    await redo.click();
    await expect.poll(async () => (await object.boundingBox())!.x).toBeGreaterThan(previousX + 20);
    expect(await readFile(file, "utf8")).toBe(original);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.locator(".yrf-bar").getByRole("button", { name: "Save", exact: true }).press("Enter");
    await expect(page.getByText(/Original updated/)).toBeVisible();
    expect(await readFile(file, "utf8")).toContain("Draft heading");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
