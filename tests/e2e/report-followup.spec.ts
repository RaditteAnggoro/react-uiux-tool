import { test, expect } from "./studio-fixture.js";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildTemplate, exportReport, serializeReport } from "../../dist/reports/index.js";

async function openInvoice(page: import("@playwright/test").Page, folder: string) {
  await page.route("**/api/pick-directory", route => route.fulfill({ json: { path: "", unavailable: false } }));
  await page.addInitScript(() => localStorage.setItem("uiux-language", "en"));
  await writeFile(path.join(folder, "invoice.report.json"), serializeReport(buildTemplate("invoice")));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Report Studio/ }).click();
  await page.getByRole("button", { name: "Open existing report" }).click();
  const folderInput = page.getByRole("textbox", { name: "Report folder", exact: true });
  await folderInput.fill(folder);
  await expect(folderInput).toHaveValue(folder);
  await page.getByRole("button", { name: "Use folder" }).click();
  await page.locator(".rs-files button").filter({ hasText: "invoice.report.json" }).click();
  await expect(page.getByRole("textbox", { name: "Report title" })).toBeVisible();
}

test("mapped CSV and XLSX imports preserve sample data until applied", async ({ page }, info) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-import-followup-"));
  try {
    await openInvoice(page, folder);
    const data = page.getByRole("textbox", { name: "Sample data" });
    await data.fill('{"invoice":{"number":"KEEP"}}');
    await page.getByRole("combobox", { name: "Import dataset" }).selectOption("lines");
    await page.getByRole("checkbox", { name: "Review and map CSV or TSV columns" }).check();
    const csv = page.locator('input[accept^=".csv"]');
    const sample = { name: "items.csv", mimeType: "text/csv", buffer: Buffer.from("Label,Amount\nItem A,12.50") };
    const invalidSample = { ...sample, buffer: Buffer.from("description,amount\nItem A,wrong") };
    await csv.setInputFiles(invalidSample);
    const diagnostics = page.getByRole("dialog", { name: "Map import columns" });
    await diagnostics.getByRole("button", { name: "Apply import" }).click();
    await expect(diagnostics.getByRole("status")).toContainText("lines · Row 1 · amount");
    await page.keyboard.press("Escape");
    await expect(data).toHaveValue('{"invoice":{"number":"KEEP"}}');
    await csv.setInputFiles(sample);
    const dialog = page.getByRole("dialog", { name: "Map import columns" });
    const label = dialog.getByRole("combobox", { name: "Field for Label" });
    await label.fill("Amount");
    await expect(dialog.getByRole("button", { name: "Apply import" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(data).toHaveValue('{"invoice":{"number":"KEEP"}}');
    await csv.setInputFiles(sample);
    await label.fill("description");
    await dialog.getByRole("combobox", { name: "Field for Amount" }).fill("amount");
    await dialog.getByRole("button", { name: "Apply import" }).press("Enter");
    await expect(data).toHaveValue(/"description": "Item A"/);

    const workbook = buildTemplate("invoice");
    const extra = structuredClone(workbook.bands.find(band => band.elements.some(element => element.type === "table"))!);
    extra.id = "extra-table-band";
    const table = extra.elements.find(element => element.type === "table")!;
    table.id = "extra-table";
    table.bindings = { path: "other" };
    extra.elements = [table];
    workbook.bands.push(extra);
    const xlsx = exportReport(workbook, "xlsx", { lines: [{ description: "Sheet one" }], other: [{ description: "Sheet two" }] });
    await page.locator('input[accept=".xlsx"]').setInputFiles({
      name: xlsx.filename, mimeType: xlsx.mime, buffer: Buffer.from(xlsx.bytes),
    });
    await dialog.getByRole("combobox", { name: "Worksheet" }).selectOption({ label: "Report 2" });
    await expect(dialog.getByText("Sheet two", { exact: true })).toBeVisible();
    const apply = dialog.getByRole("button", { name: "Apply import" });
    const desktop = page.viewportSize()!;
    await page.setViewportSize({ width: 360, height: 800 });
    await expect(apply).toBeInViewport({ ratio: 0.99 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
    const previewBounds = await dialog.locator(".rs-import-preview").boundingBox();
    const actionBounds = await apply.boundingBox();
    expect(actionBounds!.y - (previewBounds!.y + previewBounds!.height)).toBeGreaterThanOrEqual(8);
    await apply.focus();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("combobox", { name: "Worksheet" })).toBeFocused();
    await page.screenshot({ path: info.outputPath("xlsx-mapping-360.png") });
    await page.setViewportSize(desktop);
    await apply.click();
    await expect(data).toHaveValue(/"Deskripsi": "Sheet two"/);
    await expect(data).toHaveValue(/"number": "KEEP"/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("dataset rules reject invalid quick CSV and JSON without replacing the sample", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-field-rules-"));
  try {
    await openInvoice(page, folder);
    const data = page.getByRole("textbox", { name: "Sample data" });
    await data.fill('{"lines":[{"description":"Old","amount":"4.5"}],"invoice":{"number":"0001"}}');
    await page.getByRole("combobox", { name: "Import dataset" }).selectOption("lines");
    await page.getByText("Dataset field rules · lines", { exact: true }).click();
    await page.getByRole("checkbox", { name: "Required · amount" }).check();
    const importInput = page.locator('input[accept^=".csv"]');
    await importInput.setInputFiles({ name: "data.csv", mimeType: "text/csv", buffer: Buffer.from("description,amount\nNew,") });
    await expect(page.getByText("A value is required", { exact: false })).toBeVisible();
    await expect(data).toHaveValue(/Old/);
    await importInput.setInputFiles({ name: "data.json", mimeType: "application/json", buffer: Buffer.from('[{"description":"New","amount":"wrong"}]') });
    await expect(page.getByText("Expected a number or decimal text", { exact: false })).toBeVisible();
    await expect(data).toHaveValue(/Old/);
    await importInput.setInputFiles({ name: "data.csv", mimeType: "text/csv", buffer: Buffer.from("description,amount\nNew,9007199254740993.12") });
    await expect(data).toHaveValue(/9007199254740993\.12/);
    await expect(data).toHaveValue(/0001/);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => JSON.parse(await readFile(path.join(folder, "invoice.report.json"), "utf8"))
      .datasets.find((dataset: { id: string }) => dataset.id === "lines").schema.requiredFields).toEqual(["amount"]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("a delayed quick import cannot replace a newer manual sample edit", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-sample-race-"));
  try {
    await openInvoice(page, folder);
    await page.evaluate(() => {
      const read = File.prototype.text;
      File.prototype.text = async function() {
        if (this.name === "delayed.csv") {
          await new Promise<void>(resolve => {
            document.documentElement.dataset.importPending = "true";
            window.addEventListener("finish-fixture-import", () => resolve(), { once: true });
          });
        }
        return read.call(this);
      };
    });
    const sample = page.getByRole("textbox", { name: "Sample data" });
    await sample.fill('{"lines":[{"description":"Old"}]}');
    await page.getByRole("combobox", { name: "Import dataset" }).selectOption("lines");
    await page.locator('input[accept^=".csv"]').setInputFiles({
      name: "delayed.csv", mimeType: "text/csv", buffer: Buffer.from("description,amount\nFrom delayed file,1"),
    });
    await expect(page.locator("html")).toHaveAttribute("data-import-pending", "true");
    const manual = '{"lines":[{"description":"New manual sample"}],"invoice":{"number":"KEEP"}}';
    await sample.fill(manual);
    await page.evaluate(() => window.dispatchEvent(new Event("finish-fixture-import")));
    await expect(sample).toHaveValue(manual);
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.frameLocator('iframe[title="report-preview"]').getByText("New manual sample", { exact: true })).toBeVisible();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("linked report refreshes from disk while locked content can be hidden from output", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-live-links-"));
  try {
    await openInvoice(page, folder);
    const file = path.join(folder, "invoice.report.json");
    const childFile = path.join(folder, "child.report.json");
    const child = buildTemplate("invoice");
    const target = child.bands.flatMap(band => band.elements).find(element => element.type === "text")!;
    target.props.text = "CHILD V1";
    child.parameters.push({ id: "localLabel", type: "string", required: true });
    child.bands[0]!.elements.push({ id: "linked-value", type: "field", box: { x: 0, y: 20, width: 35, height: 6 }, props: {}, bindings: { path: "parameters.localLabel" } });
    await writeFile(childFile, serializeReport(child));
    await page.getByText("Linked subreports", { exact: true }).click();
    const relativePath = page.getByRole("textbox", { name: "Relative report path" });
    await relativePath.fill("../outside.report.json");
    await expect(page.getByRole("button", { name: "Link report" })).toBeDisabled();
    await relativePath.fill("child.report.json");
    await page.getByRole("button", { name: "Link report" }).click();
    await expect(page.getByRole("button", { name: "Unlink child.report.json" })).toBeVisible();
    await page.getByRole("button", { name: "Linked report parameters child.report.json" }).click();
    const args = page.getByRole("dialog", { name: "Linked report parameters" });
    await args.getByLabel("Parameter values (JSON)").fill('{"localLabel": "Child parameter"}');
    await args.getByRole("button", { name: "Apply parameters" }).click();
    await expect(args).toHaveCount(0);

    const canvas = page.locator(`.rs-el[data-id="${target.id}"]`);
    await canvas.click();
    const text = await canvas.innerText();
    await page.getByRole("checkbox", { name: "Lock contents and styling in Design" }).check();
    await canvas.dblclick();
    await expect(canvas.locator("textarea")).toHaveCount(0);
    await expect(canvas).toHaveText(text);
    await page.getByRole("checkbox", { name: "Hide in Preview and export" }).check();
    await expect(canvas).toHaveClass(/rs-output-hidden/);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => {
      const saved = JSON.parse(await readFile(file, "utf8"));
      const props = saved.bands.flatMap((band: { elements: { id: string; props: unknown }[] }) => band.elements)
        .find((element: { id: string }) => element.id === target.id)?.props;
      return { links: saved.linkedReports, props };
    }).toEqual({ links: ["child.report.json"], props: expect.objectContaining({ contentLocked: true, outputHidden: true }) });
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    const frame = page.frameLocator('iframe[title="report-preview"]');
    await expect(frame.getByText("CHILD V1", { exact: true })).toBeVisible();
    await expect(frame.getByText("Child parameter", { exact: true })).toBeVisible();
    await expect(frame.getByText(text, { exact: true })).toHaveCount(0);
    target.props.text = "CHILD V2";
    await writeFile(childFile, serializeReport(child));
    await page.getByRole("button", { name: "Refresh preview" }).click();
    await expect(frame.getByText("CHILD V2", { exact: true })).toBeVisible();
    await expect(frame.getByText("CHILD V1", { exact: true })).toHaveCount(0);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("native Layers keeps batch style atomic around a content lock through undo and reopen", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-content-lock-"));
  try {
    await openInvoice(page, folder);
    const title = page.getByRole("button", { name: "text · el-title", exact: true });
    const subtitle = page.getByRole("button", { name: "text · el-subtitle", exact: true });
    const locked = page.getByRole("checkbox", { name: "Lock contents and styling in Design" });
    const snapshot = async () => await page.locator('.rs-el[data-id="el-title"],.rs-el[data-id="el-subtitle"]')
      .evaluateAll(elements => elements.map(element => window.getComputedStyle(element).fontSize));
    const before = await snapshot();
    await title.click();
    await locked.check();
    await subtitle.click({ modifiers: ["Shift"] });
    await expect(page.getByText(/2 objects selected/)).toBeVisible();
    await page.locator(".rs-right .rs-style-chips").getByRole("button", { name: "Heading 1" }).press("Enter");
    await expect(page.getByText("Unlock contents before editing this object.", { exact: true })).toBeVisible();
    expect(await snapshot()).toEqual(before);

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await title.click();
    await expect(locked).not.toBeChecked();
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(locked).toBeChecked();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => {
      const saved = JSON.parse(await readFile(path.join(folder, "invoice.report.json"), "utf8"));
      return saved.bands[0].elements.find((element: { id: string }) => element.id === "el-title").props.contentLocked;
    }).toBe(true);
    await page.locator(".rs-files button").filter({ hasText: "invoice.report.json" }).click();
    await title.click();
    await expect(locked).toBeChecked();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("native image crop previews, undoes and saves the new image without changing its frame", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-crop-image-"));
  try {
    await openInvoice(page, folder);
    await page.getByRole("button", { name: "Add image", exact: true }).click();
    const source = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 20; canvas.height = 12;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "red"; context.fillRect(0, 0, 10, 12);
      context.fillStyle = "blue"; context.fillRect(10, 0, 10, 12);
      return canvas.toDataURL("image/png").split(",")[1]!;
    });
    await page.locator('input[accept="image/png,image/jpeg,image/webp"]').setInputFiles({
      name: "color.png", mimeType: "image/png", buffer: Buffer.from(source, "base64"),
    });
    const image = page.locator(".rs-image-thumb");
    await expect(image).toBeVisible();
    const src = await image.getAttribute("src");
    const object = page.locator('.rs-el').filter({ has: page.locator('img[alt="color.png"]') });
    const frame = await object.boundingBox();
    const open = page.getByRole("button", { name: "Crop image", exact: true });
    await open.click();
    const dialog = page.getByRole("dialog", { name: "Crop image" });
    await dialog.getByRole("spinbutton", { name: "Left (%)" }).fill("50");
    const apply = dialog.getByRole("button", { name: "Apply crop" });
    await expect(apply).toBeDisabled();
    await dialog.getByRole("spinbutton", { name: "Width (%)" }).fill("50");
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(10);
    expect(await image.getAttribute("src")).not.toBe(src);
    expect(frame).not.toBeNull();
    expect(await object.boundingBox()).toEqual(frame);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(image).toHaveAttribute("src", src!);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(10);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const file = path.join(folder, "invoice.report.json");
    const cropped = await image.getAttribute("src");
    await expect.poll(async () => (await readFile(file, "utf8")).includes(cropped!)).toBe(true);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("editable PDF import keeps the direction of rotated left-to-right text", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-pdf-rotated-"));
  try {
    await openInvoice(page, folder);
    const source = buildTemplate("blank");
    source.bands[0]!.elements.push({
      id: "turn", type: "text", box: { x: 70, y: 20, width: 30, height: 12 },
      props: { text: "TURN-TEST-90", fontSize: 10, rotation: 90 },
    });
    const pdf = exportReport(source, "pdf");
    expect(pdf.warnings.join("\n")).not.toMatch(/rotation/i);
    expect(Buffer.from(pdf.bytes).toString("latin1")).toMatch(/q 0\.0000000 -1\.0000000 1\.0000000 0\.0000000 [-\d. ]+ cm/);
    await page.locator('input[accept=".pdf,application/pdf"]').setInputFiles({
      name: "rotated.pdf", mimeType: pdf.mime, buffer: Buffer.from(pdf.bytes),
    });
    await expect(page.getByText(/Imported editable PDF text/)).toBeVisible({ timeout: 20_000 });
    const text = page.locator(".rs-el").filter({ hasText: "TURN-TEST-90" });
    await expect(text).toHaveCSS("transform", "matrix(0, 1, -1, 0, 0, 0)");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const file = path.join(folder, "invoice.report.json");
    await expect.poll(async () => (await readFile(file, "utf8")).includes("TURN-TEST-90")).toBe(true);
    const saved = JSON.parse(await readFile(file, "utf8"));
    const imported = saved.bands.find((band: { label: string }) => band.label === "rotated.pdf: 1");
    expect(imported.elements[0].props).toMatchObject({ text: "TURN-TEST-90", rotation: 90 });
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test("PDF pages, subreport sections, and QR stay in the draft until Save", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-sections-followup-"));
  const file = path.join(folder, "invoice.report.json");
  try {
    await openInvoice(page, folder);
    await page.getByRole("button", { name: "Add barcode" }).click();
    await page.getByRole("combobox", { name: "Barcode format" }).selectOption("qrcode");
    await expect(page.getByRole("img", { name: "QR Code", exact: true })).toBeVisible();
    const original = await readFile(file, "utf8");
    const child = buildTemplate("invoice");
    await page.locator('input[accept=".report.json"]').setInputFiles({
      name: "sub.report.json", mimeType: "application/json", buffer: Buffer.from(serializeReport(child)),
    });
    await expect(page.getByText("Subreport sections added", { exact: true })).toBeVisible();
    const pdf = exportReport(buildTemplate("invoice"), "pdf");
    await page.locator('input[accept=".pdf"]').setInputFiles({
      name: "reference.pdf", mimeType: pdf.mime, buffer: Buffer.from(pdf.bytes),
    });
    await expect(page.getByText("PDF pages added as images", { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.locator('input[accept=".pdf,application/pdf"]').setInputFiles({
      name: "editable.pdf", mimeType: pdf.mime, buffer: Buffer.from(pdf.bytes),
    });
    await expect(page.getByText(/Imported editable PDF text/)).toBeVisible({ timeout: 20_000 });
    expect(await readFile(file, "utf8")).toBe(original);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => (await readFile(file, "utf8")).includes("reference.pdf")).toBe(true);
    const saved = JSON.parse(await readFile(file, "utf8"));
    expect(saved.bands.some((band: { id: string }) => band.id.startsWith("sub-"))).toBe(true);
    expect(saved.bands.find((band: { label: string }) => band.label === "editable.pdf: 1").elements)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        type: "text", props: expect.objectContaining({ text: "INVOICE" }),
        box: expect.objectContaining({ x: expect.any(Number), width: expect.any(Number) }),
      })]));
    expect(saved.bands.flatMap((band: { elements: unknown[] }) => band.elements)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "barcode", props: expect.objectContaining({ barcodeKind: "qrcode" }) }),
      expect.objectContaining({ type: "image", props: expect.objectContaining({ alt: "reference.pdf: 1", src: expect.stringMatching(/^data:image\//) }) }),
    ]));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
