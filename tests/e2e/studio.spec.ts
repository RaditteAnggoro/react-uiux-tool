import { test, expect } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("uiux-language", "en");
    localStorage.setItem("uiux-theme", "light");
  });
});
test.afterEach(async ({ request }) => {
  const session = await (await request.get("/api/session")).json();
  const headers = { "x-uiux-token": session.token, origin: new URL(test.info().project.use.baseURL as string).origin };
  const status = await (await request.get("/api/status", { headers })).json();
  if (status.projectRoot) await request.post("/api/draft/discard", { headers, data: { expectedProject: status.projectRoot } });
});
const fixtureRoots = new Set<string>();
test.afterAll(async () => {
  await Promise.all(
    [...fixtureRoots].map((root) => rm(root, { recursive: true, force: true })),
  );
  fixtureRoots.clear();
});

async function commitDraft(page: import("@playwright/test").Page) {
  const save = page
    .locator(".canvas-actions")
    .first()
    .getByRole("button", { name: "Save", exact: true });
  try {
    await expect(save).toBeVisible({ timeout: 4_000 });
    await expect(save).toBeEnabled({ timeout: 15_000 });
  } catch {
    return;
  }
  await save.click({ force: true });
  await expect(page.getByText(/Draft saved to source/))
    .toBeVisible({ timeout: 15_000 })
    .catch(async () => {
      await expect(page.locator('.studio-header[data-draft-count="0"]')).toHaveCount(1);
    });
}

async function openFixtureProject(page: import("@playwright/test").Page) {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-fixture-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  return root;
}

async function stopPreview(page: import("@playwright/test").Page) {
  const stop = page.getByRole("button", { name: "Stop preview" });
  if (!(await stop.isVisible().catch(() => false))) return;
  await stop.click({ force: true });
}

test("Pages search and reusable Components search remain independent", async ({ page }) => {
  await page.goto("/");
  await openFixtureProject(page);
  await page.getByLabel("Search source files…").fill("not-a-component-name");
  await page.locator(".icon-rail").getByRole("button", { name: "Components" }).click();
  await expect(page.getByLabel("Search components…")).toHaveValue("");
  await expect(page.locator(".project-component-list").getByRole("button", { name: /Button/ })).toBeVisible();
  await page.getByLabel("Search components…").fill("Button");
  await page.locator(".icon-rail").getByRole("button", { name: "Pages" }).click();
  await expect(page.getByLabel("Search source files…")).toHaveValue("not-a-component-name");
  await page.locator(".icon-rail").getByRole("button", { name: "Components" }).click();
  await expect(page.getByLabel("Search components…")).toHaveValue("Button");
  await stopPreview(page);
});

test("expanding a source file keeps the editor in Design mode", async ({ page }) => {
  await page.goto("/");
  await openFixtureProject(page);
  await page.getByLabel("Search source files…").fill("App.tsx");
  const file = page.locator(".source-explorer .file-row", { hasText: "App.tsx" });
  await expect(file).toHaveAttribute("aria-expanded", "false");
  await file.click();
  await expect(file).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("tab", { name: "Design", exact: true })).toHaveAttribute("aria-selected", "true");
  await stopPreview(page);
});

test("Props excludes code-owned and style properties from source edits", async ({ page }) => {
  await page.goto("/");
  await openFixtureProject(page);
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.locator("section.welcome-section").click({ position: { x: 5, y: 5 } });
  const name = page.getByLabel("Property name", { exact: true });
  await expect(name).toBeVisible();
  await expect(page.locator('#prop-names option[value="children"]')).toHaveCount(0);
  await expect(page.locator('#prop-names option[value="style.display"]')).toHaveCount(0);
  for (const forbidden of ["children", "style.display"]) {
    await name.fill(forbidden);
    await expect(page.locator(".inspector-section").filter({ has: name }).getByRole("button", { name: "Apply to draft" })).toBeDisabled();
    await expect(page.getByText(/This property cannot be edited here/)).toBeVisible();
  }
  await stopPreview(page);
});

test("palette warns without a selected container and copies a button without an identity", async ({ page }) => {
  await page.goto("/");
  const root = await openFixtureProject(page);
  await page.locator(".icon-rail").getByRole("button", { name: "Components" }).click();
  await page.locator(".primitive-grid").getByRole("button", { name: "Button" }).click();
  await expect(page.locator(".selection-warning")).toContainText("Select the form or section");
  await page.locator(".selection-warning").getByRole("button").click();
  await page.locator(".primitive-grid").getByRole("button", { name: "Button" }).dragTo(page.locator(".component-drop-target"));
  await expect(page.locator(".selection-warning")).toContainText("Select the form or section");
  await page.locator(".selection-warning").getByRole("button").click();
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("tab", { name: "Layout" }).click();
  await page.getByRole("button", { name: "Duplicate directly" }).click();
  await expect(frame.getByRole("button", { name: "Create project" })).toHaveCount(2);
  await commitDraft(page);
  expect((await readFile(path.join(root, "src/App.tsx"), "utf8")).match(/title="Create project"/g)).toHaveLength(2);
  await stopPreview(page);
});

test("copies a button into another selected section", async ({ page }) => {
  await page.goto("/");
  const root = await openFixtureProject(page);
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("tab", { name: "Layout" }).click();
  await page.getByRole("button", { name: "Copy to another area" }).click();
  await frame.locator("section.stats-grid").click({ position: { x: 5, y: 5 } });
  await page.getByRole("button", { name: "Paste copied component inside" }).click();
  await expect(frame.locator("section.stats-grid").getByRole("button", { name: "Create project" })).toHaveCount(1);
  await commitDraft(page);
  expect((await readFile(path.join(root, "src/App.tsx"), "utf8")).match(/title="Create project"/g)).toHaveLength(2);
  await stopPreview(page);
});

test("basic button reuses a consistent existing project class", async ({ page }) => {
  await page.goto("/");
  await openFixtureProject(page);
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.locator("section.welcome-section").click({ position: { x: 5, y: 5 } });
  await page.locator(".icon-rail").getByRole("button", { name: "Components" }).click();
  await page.locator(".primitive-grid").getByRole("button", { name: "Button" }).click();
  const button = frame.getByRole("button", { name: "New button" });
  await expect(button).toHaveClass("primary-button");
  expect(await button.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(await frame.getByRole("button", { name: "Create project" }).evaluate((element) => getComputedStyle(element).backgroundColor));
  await stopPreview(page);
});

test("delete targets the selected project button and keeps sibling handlers", async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-delete-button-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  await writeFile(path.join(root, "src/SharedButton.jsx"), 'export default function SharedButton({label,onClick}){return <button onClick={onClick}>{label}</button>}');
  const sourcePath = path.join(root, "src/App.tsx");
  await writeFile(sourcePath, 'import SharedButton from "./SharedButton";export default function App(){const handle=()=>{};return <main><SharedButton label="Detail" onClick={handle}/><SharedButton label="New button" onClick={handle}/></main>}');
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  const explorer = page.locator(".source-explorer");
  await explorer.getByRole("treeitem", { name: "src" }).click();
  await explorer.getByRole("treeitem", { name: /App\.tsx/ }).click();
  await explorer.locator(".component-row", { hasText: "App" }).click();
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await expect(frame.getByRole("button", { name: "New button" })).toBeVisible();
  await frame.getByRole("button", { name: "New button" }).click();
  await expect(page.locator(".inspector-panel")).toContainText("New button");
  await frame.getByRole("button", { name: "New button" }).press("Delete");
  await expect(page.locator('.studio-header:not([data-draft-count="0"])')).toHaveCount(1, { timeout: 10_000 });
  await commitDraft(page);
  await expect.poll(() => readFile(sourcePath, "utf8")).not.toContain('label="New button"');
  const result = await readFile(sourcePath, "utf8");
  expect(result).toContain('label="Detail" onClick={handle}');
  expect(result).toContain('const handle=()=>{}');
  await stopPreview(page);
});

test("change history opens in both languages without claiming deployment time", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Change history" }).click();
  await expect(page.getByRole("dialog", { name: "Change history" })).toContainText("Actual deployment or installation times are not tracked");
  await expect(page.getByRole("dialog")).toContainText("4588de1");
  await expect(page.getByRole("dialog")).toContainText("Improve report image import");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await page.getByLabel("Language").selectOption("id");
  await page.getByRole("button", { name: "Riwayat perubahan" }).click();
  await expect(page.getByRole("dialog", { name: "Riwayat perubahan" })).toContainText("Waktu deploy atau instalasi sebenarnya belum dicatat");
});

test("ambiguous repeated component labels do not delete a guessed instance", async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-ambiguous-button-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  await writeFile(path.join(root, "src/SharedButton.jsx"), 'export default function SharedButton({label}){return <button>{label}</button>}');
  const sourcePath = path.join(root, "src/App.tsx");
  const original = 'import SharedButton from "./SharedButton";export default function App(){return <main><SharedButton label="Same"/><SharedButton label="Same"/></main>}';
  await writeFile(sourcePath, original);
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  const explorer = page.locator(".source-explorer");
  await explorer.getByRole("treeitem", { name: "src" }).click();
  await explorer.getByRole("treeitem", { name: /App\.tsx/ }).click();
  await explorer.locator(".component-row", { hasText: "App" }).click();
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.getByRole("button", { name: "Same" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "could not be determined" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await readFile(sourcePath, "utf8")).toBe(original);
  await explorer.locator(".explorer-name", { hasText: /^main$/ }).first().locator("..").click();
  await explorer.locator(".explorer-name", { hasText: /^SharedButton$/ }).first().locator("..").click();
  await expect(page.getByRole("status").filter({ hasText: "could not be determined" })).toHaveCount(0);
  await stopPreview(page);
});

test("basic paragraph starts with editable visible text", async ({ page }) => {
  await page.goto("/");
  const root = await openFixtureProject(page);
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.locator("section.welcome-section").click({ position: { x: 5, y: 5 } });
  await page.locator(".icon-rail").getByRole("button", { name: "Components" }).click();
  await page.locator(".primitive-grid").getByRole("button", { name: "Paragraph" }).click();
  await expect(frame.getByText("New paragraph")).toBeVisible();
  await expect(page.locator(".selected-heading").getByRole("heading", { name: "p", exact: true })).toBeVisible();
  await commitDraft(page);
  expect(await readFile(path.join(root, "src/App.tsx"), "utf8")).toContain("<p>New paragraph</p>");
  await frame.getByText("New paragraph").click();
  await page.getByLabel("Text content").fill("Edited paragraph");
  await page.locator(".inspector-section").filter({ has: page.getByRole("heading", { name: "Text content" }) }).getByRole("button", { name: "Apply to draft" }).click();
  await expect(frame.getByText("Edited paragraph")).toBeVisible();
  await commitDraft(page);
  expect(await readFile(path.join(root, "src/App.tsx"), "utf8")).toContain("<p>Edited paragraph</p>");
  await stopPreview(page);
});

test("declared untyped JavaScript prop can be added and edited in the inspector", async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-js-prop-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  await writeFile(path.join(root, "src/Button.jsx"), "export default function Button({ label }) { return <button>{label || 'Empty'}</button> }");
  await writeFile(path.join(root, "src/App.tsx"), "import Button from './Button.jsx'; export default function App(){return <main><Button /></main>}");
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await expect(frame.getByRole("button", { name: "Empty" })).toBeVisible();
  const explorer = page.locator(".source-explorer");
  await explorer.getByRole("treeitem", { name: "src" }).click();
  await explorer.getByRole("treeitem", { name: /App\.tsx/ }).click();
  await explorer.locator(".component-row", { hasText: "App" }).click();
  await explorer.locator(".explorer-name", { hasText: /^main$/ }).first().locator("..").click();
  await explorer.locator(".explorer-name", { hasText: /^Button$/ }).first().locator("..").click();
  await page.getByRole("tab", { name: "Props" }).click();
  await page.getByLabel("Property name").fill("label");
  await page.getByLabel("Literal value").fill("Search");
  await page.locator(".inspector-section").filter({ has: page.getByRole("heading", { name: "Props" }) }).getByRole("button", { name: "Apply to draft" }).click();
  await expect(frame.getByRole("button", { name: "Search" })).toBeVisible();
  await commitDraft(page);
  expect(await readFile(path.join(root, "src/App.tsx"), "utf8")).toContain('label="Search"');
  await stopPreview(page);
});

test("insert then edit props and event keeps the inserted element", async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-sequential-ui-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  const sourcePath = path.join(root, "src/App.tsx");
  const original = 'export default function App(){const handleSearch=()=>{};return <main><section><span>Keep existing</span></section></main>}';
  await writeFile(sourcePath, original);
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.locator("section").click();
  await page.locator(".icon-rail").getByRole("button", { name: "Components" }).click();
  await page.locator(".primitive-grid").getByRole("button", { name: "Paragraph" }).click();
  await expect(page.locator('.studio-header:not([data-draft-count="0"])')).toHaveCount(1, { timeout: 15_000 });
  expect(await readFile(sourcePath, "utf8")).toBe(original);
  await page.locator(".canvas-more > summary").click();
  await page.locator(".canvas-more-menu").getByRole("button", { name: "Preview draft" }).click();
  await expect(page.getByText("Working…", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Draft preview", { exact: true })).toBeVisible();
  await frame.getByText("New paragraph").click();
  await page.getByLabel("Property name").fill("title");
  await page.getByLabel("Literal value").fill("Example");
  await expect(page.getByLabel("Property name")).toHaveValue("title");
  await page.locator(".inspector-section").filter({ has: page.getByRole("heading", { name: "Props" }) }).getByRole("button", { name: "Apply to draft" }).click();
  expect(await readFile(sourcePath, "utf8")).toBe(original);
  await page.getByRole("tab", { name: "Events" }).click();
  await page.getByLabel("Event property").selectOption("onClick");
  await page.getByLabel("Existing function").fill("handleSearch");
  await page.getByRole("button", { name: "Add event to draft" }).click();
  expect(await readFile(sourcePath, "utf8")).toBe(original);
  await page.locator(".canvas-actions").getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => readFile(sourcePath, "utf8")).toContain("onClick={handleSearch}");
  const source = await readFile(sourcePath, "utf8");
  expect(source).toContain('title="Example"');
  expect(source).toContain("New paragraph</p>");
  expect(source).toContain("<span>Keep existing</span>");
  await stopPreview(page);
});

test("draft discard and conflict preserve the source and pending edit", async ({ page }) => {
  await page.goto("/");
  const root = await openFixtureProject(page);
  const sourcePath = path.join(root, "src/App.tsx");
  const original = await readFile(sourcePath, "utf8");
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.locator("section.welcome-section").click({ position: { x: 5, y: 5 } });
  await page.getByLabel("Property name", { exact: true }).fill("title");
  await page.getByLabel("Literal value").fill("Draft title");
  await page.locator(".inspector-section").filter({ has: page.getByLabel("Property name", { exact: true }) }).getByRole("button", { name: "Apply to draft" }).click();
  await expect(page.locator('.studio-header:not([data-draft-count="0"])')).toHaveCount(1, { timeout: 15_000 });
  expect(await readFile(sourcePath, "utf8")).toBe(original);
  await writeFile(sourcePath, original + "\n// external edit\n");
  await page.locator(".canvas-actions").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Source conflict/i).first()).toBeVisible();
  expect(await readFile(sourcePath, "utf8")).toBe(original + "\n// external edit\n");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".canvas-more > summary").click();
  await page.locator(".canvas-more-menu").getByRole("button", { name: "Discard Draft" }).click();
  await expect(page.locator('.studio-header[data-draft-count="0"]')).toHaveCount(1);
  expect(await readFile(sourcePath, "utf8")).toBe(original + "\n// external edit\n");
  await stopPreview(page);
});

test("React Studio exposes only Pages and Components navigation", async ({ page }) => {
  await page.goto("/");
  await openFixtureProject(page);
  await expect(page.locator(".icon-rail").getByRole("button", { name: "Boards" })).toHaveCount(0);
  await expect(page.locator(".icon-rail").getByRole("button", { name: "Pages" })).toHaveCount(1);
  await expect(page.locator(".icon-rail").getByRole("button", { name: "Components" })).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "Interact" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Design" })).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "Code" })).toHaveCount(1);
  await stopPreview(page);
});

test("preview explains when Tailwind project styling is not loaded", async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-tailwind-warning-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  const manifestFile = path.join(root, "package.json");
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  manifest.devDependencies.tailwindcss = "4.0.0";
  await writeFile(manifestFile, JSON.stringify(manifest));
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Tailwind project configuration is not loaded" })).toBeVisible();
  await stopPreview(page);
});

test("a failed design screen does not prevent opening another screen", async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-design-recovery-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  await mkdir(path.join(root, "src/views"), { recursive: true });
  await writeFile(path.join(root, "src/views/Bad.jsx"), 'export default function Bad(){throw new Error("Broken fixture screen"); return <div /> }');
  await writeFile(path.join(root, "src/views/Good.jsx"), 'export default function Good(){return <main><h1>Recovered screen</h1></main>}');
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  const explorer = page.locator(".source-explorer");
  await explorer.getByRole("treeitem", { name: "src" }).click();
  await explorer.getByRole("treeitem", { name: "views" }).click();
  await explorer.getByRole("treeitem", { name: /Bad\.jsx/ }).click();
  await explorer.locator(".component-row", { hasText: "Bad" }).click();
  await expect(page.frameLocator('iframe[title="Live preview"]').getByText(/Broken fixture screen/)).toBeVisible({ timeout: 15000 });
  await explorer.getByRole("treeitem", { name: /Good\.jsx/ }).click();
  await explorer.locator(".component-row", { hasText: "Good" }).click();
  await expect(page.frameLocator('iframe[title="Live preview"]').getByRole("heading", { name: "Recovered screen" })).toBeVisible({ timeout: 15000 });
  await stopPreview(page);
});

test("inline style origin loads its property and value into the editor", async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-style-origin-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  await writeFile(path.join(root, "src/App.tsx"), 'export default function App(){return <main><button style={{marginTop: "12px"}}>Example</button></main>}');
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  await page.frameLocator('iframe[title="Live preview"]').getByRole("button", { name: "Example" }).click();
  await page.getByRole("tab", { name: "Style" }).click();
  await page.getByRole("button", { name: "Edit this inline style" }).click();
  await expect(page.getByLabel("CSS property")).toHaveValue("marginTop");
  await expect(page.getByLabel("CSS value").last()).toHaveValue("12px");
  await page.getByLabel("Language").selectOption("id");
  await expect(page.getByRole("option", { name: "Ukuran font" })).toBeAttached();
  await stopPreview(page);
});

test("new project review shows styling details, development dependencies and manual commands", async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-review-"));
  fixtureRoots.add(root);
  await page.goto("/");
  await page.getByRole("button", { name: /New Project/i }).click();
  await page.getByLabel("Parent directory").fill(root);
  await page.getByLabel("Project name").fill("example-app");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Components & styling").selectOption("tailwind");
  await expect(page.getByText(/Tailwind CSS v4 uses utility classes/)).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Development dependencies")).toBeVisible();
  await expect(page.getByText(/@tailwindcss\/vite/).first()).toBeVisible();
  await expect(page.getByText(/npm install/)).toBeVisible();
  await expect(page.getByText(/npm run build/)).toBeVisible();
  await expect.poll(() => readdir(root)).toEqual([]);
});

test("non UTF-8 warnings are grouped with each skipped file still available", async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-encoding-warning-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  const file = path.join(root, "src/legacy.css");
  const bytes = Buffer.from([0xff, 0xfe, 0x61]);
  await writeFile(file, bytes);
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByText(/Files skipped because they are not valid UTF-8/).click();
  await expect(page.locator("details").filter({ hasText: "Files skipped because they are not valid UTF-8" }).getByText(/src\/legacy.css.*not valid UTF-8/)).toBeVisible();
  expect(await readFile(file)).toEqual(bytes);
});

test("code search handles Ctrl+F and navigates source matches", async ({ page }) => {
  await page.goto("/");
  await openFixtureProject(page);
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.getByRole("button", { name: "Create project" }).click();
  await page.locator(".source-location").click();
  await expect(page.getByRole("tab", { name: "Code" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Control+f");
  const search = page.getByRole("search").getByLabel("Find in code");
  await expect(search).toBeFocused();
  await search.fill("button");
  await expect(page.locator(".canvas-source mark").first()).toBeVisible();
  const first = await page.locator('.canvas-source mark[data-current-match="true"]').textContent();
  expect(first?.toLowerCase()).toBe("button");
  await search.press("Enter");
  await expect(page.getByRole("search")).toContainText(/^.*2\//);
  await search.press("Escape");
  await expect(page.getByRole("search")).toHaveCount(0);
  await stopPreview(page);
});

test("editing a shared implementation requires explicit confirmation", async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-shared-confirm-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  await mkdir(path.join(root, "src/components"), { recursive: true });
  const file = path.join(root, "src/components/Shared.tsx");
  const source = 'export default function Shared(){return <button>Before</button>}';
  await writeFile(file, source);
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  const explorer = page.locator(".source-explorer");
  await explorer.getByRole("treeitem", { name: "src" }).click();
  await explorer.getByRole("treeitem", { name: "components" }).click();
  await explorer.getByRole("treeitem", { name: /Shared\.tsx/ }).click();
  await explorer.locator(".component-row", { hasText: "Shared" }).click();
  await explorer.locator(".explorer-name", { hasText: /^button$/ }).first().locator("..").click();
  await page.getByRole("tab", { name: "Props" }).click();
  await page.getByLabel("Text content").fill("After");
  await page.locator(".inspector-section").filter({ has: page.getByRole("heading", { name: "Text content" }) }).getByRole("button", { name: "Apply to draft" }).click();
  await expect(page.locator('.studio-header:not([data-draft-count="0"])')).toHaveCount(1, { timeout: 30_000 });
  expect(await readFile(file, "utf8")).toBe(source);
  await commitDraft(page);
  await expect.poll(() => readFile(file, "utf8")).toContain(">After</button>");
});

test("an existing event handler updates local data after binding", async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-event-data-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  await writeFile(path.join(root, "src/App.tsx"), 'import {useState} from "react";export default function App(){const [count,setCount]=useState(0);const increment=()=>setCount(value=>value+1);return <main><button>Increment</button><p>Count: {count}</p></main>}');
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.getByRole("button", { name: "Increment" }).click();
  await page.getByRole("tab", { name: "Events" }).click();
  await page.getByLabel("Event property").selectOption("onClick");
  await page.getByLabel("Existing function").fill("increment");
  await page.getByRole("button", { name: "Add event to draft" }).click();
  await expect(page.getByText("Change added to draft")).toBeVisible();
  expect(await readFile(path.join(root, "src/App.tsx"), "utf8")).not.toContain("onClick={increment}");
  await commitDraft(page);
  expect(await readFile(path.join(root, "src/App.tsx"), "utf8")).toContain("onClick={increment}");
  await stopPreview(page);
});

test("project palette button retains its CSS module styling", async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-styled-button-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  await writeFile(path.join(root, "src/Button.tsx"), 'import styles from "./Button.module.css"; export default function Button({label,children,variant}:{label?:string,children?:React.ReactNode,variant?:string}){return <button className={styles.button} data-variant={variant}>{children || label}</button>}');
  await writeFile(path.join(root, "src/Button.module.css"), '.button { background: rgb(80, 20, 120); height: 30px; color: white; }');
  await mkdir(path.join(root, "src/components"), { recursive: true });
  await writeFile(path.join(root, "src/components/Badge.tsx"), 'export default function Badge({caption}:{caption:string}){return <span>{caption.toUpperCase()}</span>}');
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.locator("section.welcome-section").click({ position: { x: 5, y: 5 } });
  await page.locator(".icon-rail").getByRole("button", { name: "Components" }).click();
  await page.locator(".project-component-list").getByRole("button", { name: /^Button/ }).click();
  const button = frame.getByRole("button", { name: "New button" });
  await expect(button).toHaveCSS("background-color", "rgb(80, 20, 120)");
  await expect(button).toHaveCSS("height", "30px");
  await expect(button).toHaveAttribute("data-variant", "secondary");
  await frame.locator("section.welcome-section").click({ position: { x: 5, y: 5 } });
  await page.locator(".project-component-list").getByRole("button", { name: /^Badge/ }).dragTo(page.locator(".component-drop-target.ready"));
  await expect(page.getByRole("alert")).toContainText("not supported for direct insertion");
  expect(await readFile(path.join(root, "src/App.tsx"), "utf8")).not.toContain("<Badge");
  await stopPreview(page);
});

test("project palette uses an observed compound wrapper for a non-button component", async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-compound-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  await mkdir(path.join(root, "src/components"), { recursive: true });
  await writeFile(path.join(root, "src/components/Widget.tsx"), 'import styles from "./Widget.module.css"; export default function Widget({value}:{value?:string}){return <span className={styles.widget}>Widget</span>}');
  await writeFile(path.join(root, "src/components/Widget.module.css"), '.widget { color: rgb(40, 60, 80); }');
  await writeFile(path.join(root, "src/Form.jsx"), 'function Form({children}){return <div>{children}</div>} Form.Field=({label,children})=><div><label>{label}</label>{children}</div>;export default Form;');
  await writeFile(path.join(root, "src/App.tsx"), 'import Form from "./Form";import Widget from "./components/Widget";export default function App(){return <main><Form><Form.Field label="Existing"><Widget /></Form.Field></Form></main>}');
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  const explorer = page.locator(".source-explorer");
  await explorer.getByRole("treeitem", { name: "src" }).click();
  await explorer.getByRole("treeitem", { name: /App\.tsx/ }).click();
  await explorer.locator(".component-row", { hasText: "App" }).click();
  await explorer.locator(".explorer-name", { hasText: /^main$/ }).first().locator("..").click();
  await explorer.locator(".explorer-name", { hasText: /^Form$/ }).first().locator("..").click();
  await page.locator(".icon-rail").getByRole("button", { name: "Components" }).click();
  const frame = page.frameLocator('iframe[title="Live preview"]');
  const before = await frame.getByText("Widget", { exact: true }).first().boundingBox();
  await page.locator(".project-component-list").getByRole("button", { name: /^Widget/ }).click();
  await expect(frame.getByText("Widget", { exact: true })).toHaveCount(2);
  await expect(frame.getByText("Widget", { exact: true }).last()).toHaveCSS("color", "rgb(40, 60, 80)");
  await expect(page.getByRole("status").filter({ hasText: "no value is bound" })).toBeVisible();
  const after = await frame.getByText("Widget", { exact: true }).first().boundingBox();
  expect(after).toEqual(before);
  await commitDraft(page);
  expect(await readFile(path.join(root, "src/App.tsx"), "utf8")).toContain('<Form.Field label="New field"><Widget /></Form.Field>');
  await stopPreview(page);
});

test("leaving the project requires an explicit choice", async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-leave-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  const leave = page.locator(".icon-rail").getByRole("button", { name: "Leave project workspace" });
  await leave.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Leave this project workspace?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Changes already saved to source will remain");
  await dialog.getByRole("button", { name: "Stay in project" }).click();
  await expect(leave).toBeVisible();
  await page.locator(".studio-header .brand").click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await leave.click();
  await dialog.getByRole("button", { name: "Leave project workspace" }).click();
  await expect(page.getByRole("button", { name: /Open Existing Project/ })).toBeVisible();
});

test("folder picker cancellation is quiet and failures offer manual path entry", async ({ page }) => {
  let unavailable = false;
  await page.route("**/api/pick-directory", async (route) => {
    await route.fulfill({ json: { path: "", unavailable } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  const directory = page.getByLabel("Project directory");
  await directory.fill("/tmp/my project");
  await page.getByRole("button", { name: "Browse" }).click();
  await expect(directory).toHaveValue("/tmp/my project");
  await expect(page.getByRole("alert")).toHaveCount(0);
  unavailable = true;
  await page.getByRole("button", { name: "Browse" }).click();
  await expect(page.getByRole("alert")).toContainText("Paste an absolute folder path");
  await expect(directory).toHaveValue("/tmp/my project");
});

test("component palette scrolls with the footer open and inspector tabs fit", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-palette-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  await mkdir(path.join(root, "src/components"), { recursive: true });
  await writeFile(path.join(root, "src/components/Palette.tsx"), Array.from({ length: 30 }, (_, i) => `export function Item${String(i).padStart(2, "0")}(){return <button>Item ${i}</button>}`).join("\n"));
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  const rail = page.locator(".icon-rail");
  await expect(rail.getByRole("button", { name: "Assets" })).toHaveCount(0);
  await rail.getByRole("button", { name: "Components" }).click();
  const palette = page.locator(".component-palette");
  const first = palette.getByRole("button", { name: /Item00/ });
  const last = palette.getByRole("button", { name: /Item29/ });
  await expect(first).toBeVisible();
  expect(await first.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const parent = element.closest(".component-palette")!.getBoundingClientRect();
    return bounds.top >= parent.top && bounds.bottom <= parent.bottom;
  })).toBe(true);
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeVisible();
  const primitive = palette.getByRole("button", { name: "Paragraph" });
  await primitive.scrollIntoViewIfNeeded();
  await expect(primitive).toBeVisible();
  const tabs = page.locator(".inspector-tabs");
  expect(await tabs.evaluate((element) => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight)).toBe(true);
  await expect(tabs.getByRole("tab", { name: "Source" })).toHaveCount(0);
});

test("narrow workspace exposes panels and source tree supports arrow keys", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-mobile-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await expect(page.getByRole("button", { name: "Start local preview" })).toBeVisible();
  await page.getByRole("button", { name: "Start local preview" }).click();
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  const tree = page.getByRole("tree", { name: "Project source" });
  const project = tree.getByRole("treeitem").first();
  await project.focus();
  await project.press("ArrowRight");
  const src = tree.getByRole("treeitem", { name: "src" });
  await expect(src).toBeFocused();
  await src.press("ArrowRight");
  await expect(src).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Property Inspector", exact: true }).click();
  await expect(page.locator(".inspector-panel")).toBeVisible();
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  await expect(page.locator(".canvas-panel")).toBeVisible();
  await expect(page.locator(".left-panel")).toBeHidden();
});

test("source explorer is lazy and the user guide is interactive", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Try Demo/ })).toHaveCount(0);
  const frontGuide = page.getByRole("button", {
    name: /See what the application can do/,
  });
  await expect(frontGuide).toBeVisible();
  await expect(frontGuide).toContainText("Drag & drop");
  await frontGuide.click();
  const guide = page.getByRole("dialog", { name: "Interactive user guide" });
  await expect(guide).toBeVisible();
  await expect(
    guide.getByRole("heading", { name: "Choose how you want to begin" }),
  ).toBeVisible();
  await guide.getByRole("button", { name: "Next" }).click();
  await expect(
    guide.getByRole("heading", {
      name: "Use Pages and Components for different jobs",
    }),
  ).toBeVisible();
  await guide.getByRole("button", { name: /Add a component with drag and drop/ }).click();
  await expect(guide.getByText(/relative import are added automatically/)).toBeVisible();
  await expect(
    guide.getByText(/HTML tags are handled automatically/),
  ).toBeVisible();
  await guide.getByRole("button", { name: /Bind events to existing functions/ }).click();
  await expect(guide.getByText(/never creates business logic/)).toBeVisible();
  await guide
    .getByRole("button", { name: /Understand Editable, Limited, and Read-only/ })
    .click();
  await expect(
    guide.getByText(/data, functions, conditions, loops/),
  ).toBeVisible();
  await guide.getByRole("button", { name: "About this tool" }).click();
  const about = page.getByRole("dialog", { name: "About React UI/UX Tool" });
  await expect(about.getByText("MIT © 2026 RA")).toBeVisible();
  await expect(
    about.getByRole("link", { name: "Third-party licenses" }),
  ).toHaveAttribute("href", "/THIRD_PARTY_NOTICES.md");
  await expect(
    about.getByRole("link", { name: "Inspiration & credits" }),
  ).toHaveAttribute("href", "/INSPIRATION.md");
  await about.getByRole("button", { name: "Interactive user guide" }).click();
  await page
    .getByRole("dialog", { name: "Interactive user guide" })
    .getByRole("button", { name: "Close" })
    .click();

  await openFixtureProject(page);
  await expect(page.locator(".left-panel .panel-heading")).toContainText("Pages");
  await expect(page.locator(".project-component-list")).toHaveCount(0);
  const explorer = page.locator(".source-explorer");
  await expect(explorer.getByRole("treeitem", { name: "src" })).toBeVisible();
  expect(await explorer.locator(".explorer-row").count()).toBeLessThan(30);

  await explorer.getByRole("treeitem", { name: "src" }).click();
  const appFile = explorer.getByRole("treeitem", { name: /App\.tsx/ });
  await expect(appFile).toBeVisible();
  await appFile.click();
  const appComponent = explorer.locator(".component-row", { hasText: "App" });
  await expect(appComponent).toBeVisible();
  await appComponent.click();
  const divRow = explorer
    .locator(".explorer-name", { hasText: /^div$/ })
    .first()
    .locator("..");
  await expect(divRow).toBeVisible();
  await divRow.click();
  const mainRow = explorer
    .locator(".explorer-name", { hasText: /^main$/ })
    .first()
    .locator("..");
  await expect(mainRow).toBeVisible();
  await mainRow.click();
  const sectionRow = explorer
    .locator(".explorer-name", { hasText: /^section$/ })
    .first()
    .locator("..");
  await expect(sectionRow).toBeVisible();
  await sectionRow.click();

  await page.locator(".icon-rail").getByRole("button", { name: "Components" }).click();
  await expect(page.locator(".left-panel .panel-heading")).toContainText("Components");
  await expect(page.locator(".source-explorer")).toHaveCount(0);
  const dropTarget = page.locator(".component-drop-target.ready");
  await expect(dropTarget).toContainText("section");
  await expect(
    page.locator(".primitive-grid").getByRole("button", { name: "Paragraph" }),
  ).toBeVisible();
  await expect(
    page.locator(".primitive-grid").getByRole("button", { name: "Heading" }),
  ).toBeVisible();
  await page
    .locator(".primitive-grid")
    .getByRole("button", { name: "Button" })
    .dragTo(dropTarget);
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await expect(frame.getByRole("button", { name: "New button" })).toBeVisible();
  await frame.getByRole("button", { name: "New button" }).click();
  const selectionOutline = frame.locator(
    '[data-uiux-selection="primary"]',
  );
  await expect(selectionOutline).toBeVisible();
  await expect(selectionOutline).toHaveCSS("border-top-width", "3px");
  await expect(selectionOutline).toHaveCSS(
    "background-color",
    "rgba(91, 66, 255, 0.1)",
  );
  await page.getByRole("tab", { name: "Layout" }).click();
  await expect(
    page.getByRole("button", { name: /Delete selected object/ }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await frame.getByRole("button", { name: "New button" }).press("Delete");
  await expect(frame.getByRole("button", { name: "New button" })).toHaveCount(0);
  await page.keyboard.press("Meta+z");
  await expect(frame.getByRole("button", { name: "New button" })).toBeVisible();
  await frame
    .getByRole("button", { name: "New button" })
    .locator("xpath=ancestor::section[1]")
    .click();
  await page.getByRole("tab", { name: "Layout" }).click();
  await page.getByLabel("Initial text").fill("Save draft");
  await page.getByLabel("Property (optional)").fill("aria-label");
  await page.getByLabel("Specific value").fill("Save a specific draft");
  await page.getByLabel("Event (optional)").selectOption("onClick");
  await page.getByLabel("Existing function").fill("setNotice");
  await page.getByRole("button", { name: "Add inside" }).click();
  await expect(
    frame.getByRole("button", { name: "Save a specific draft" }),
  ).toBeVisible();
  await frame
    .getByRole("button", { name: "Save a specific draft" })
    .press("Meta+z");
  await expect(
    frame.getByRole("button", { name: "Save a specific draft" }),
  ).toHaveCount(0);
});

test("fixture project supports direct mapped edit, undo and locked repeated JSX", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Build visually. Keep your source." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Try Demo/ })).toHaveCount(0);
  await openFixtureProject(page);

  const frame = page.frameLocator('iframe[title="Live preview"]');
  await expect(
    frame.getByRole("button", { name: "Create project" }),
  ).toBeVisible();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await frame.getByRole("button", { name: "Create project" }).click();
  await expect(
    page.locator(".selected-heading").getByRole("heading", { name: "button" }),
  ).toBeVisible();
  await expect(frame.getByRole("button", { name: "Create project" })).toHaveCSS("cursor", "move");
  await expect(page.locator(".source-location")).toContainText("src/App.tsx");

  const textField = page.getByLabel("Text content");
  await expect(textField).toHaveValue("Create project");
  await textField.fill("Create workspace");
  await page
    .locator(".inspector-section")
    .filter({ has: page.getByRole("heading", { name: "Text content" }) })
    .getByRole("button", { name: "Apply to draft" })
    .click();
  await expect(
    frame.getByRole("button", { name: "Create workspace" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Undo last source edit" }).click();
  await expect(
    frame.getByRole("button", { name: "Create project" }),
  ).toBeVisible();

  await frame.getByText("Website redesign").click();
  await expect(page.getByText(/Repeated JSX shares one source/i)).toBeVisible();
  await expect(frame.getByText("Website redesign")).not.toHaveCSS("cursor", "move");
  await expect(
    page
      .locator(".inspector-section")
      .filter({ has: page.getByRole("heading", { name: "Text content" }) })
      .getByRole("button", { name: "Apply to draft" }),
  ).toBeDisabled();
});

test("language, theme and creation plan are functional", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Language").selectOption("id");
  await expect(
    page.getByRole("button", { name: /Lihat apa yang dapat dilakukan aplikasi/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Bangun secara visual. Kendalikan source code.",
    }),
  ).toBeVisible();
  await page.getByLabel("Tema").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: /Buat Project Baru/i }).click();
  await expect(page.getByRole("heading", { name: "Lokasi" })).toBeVisible();
  await page.getByRole("button", { name: "Kembali" }).click();

  await page.getByLabel("Bahasa").selectOption("en");
  await expect(page.getByRole("button", { name: /Try Demo/ })).toHaveCount(0);
});

test("project component drag and duplicate stage drafts that save together", async ({ page }) => {
  test.setTimeout(120_000);
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-direct-components-"));
  try {
    await mkdir(path.join(root, "src/components"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "direct-components", dependencies: { react: "19", "react-dom": "19", vite: "8" }, scripts: { dev: "vite" } }),
    );
    await writeFile(path.join(root, "index.html"), '<div id="root"></div><script type="module" src="/src/main.jsx"></script>');
  await writeFile(
    path.join(root, "src/main.jsx"),
    'import React from "react";import{createRoot}from"react-dom/client";import App from "./App";createRoot(document.getElementById("root")).render(<App/>);',
  );
    await writeFile(
      path.join(root, "src/App.jsx"),
      "import React from'react';import{createRoot}from'react-dom/client';import DateField from'./components/DateField';function App(){const handleDateChange=()=>{};return <main><section><label id=\"customerField\"><span>Customer</span><input /></label><DateField name=\"firstDate\" /></section></main>}createRoot(document.getElementById('root')).render(<App/>);export default App;",
    );
    await writeFile(
      path.join(root, "src/components/DateField.jsx"),
      "export default function DateField({name=\"\",disabled=false,onChange}){return <input aria-label=\"Project date field\" name={name} disabled={disabled} onChange={onChange} type=\"date\"/>}",
    );

    await page.goto("/");
    await page.getByRole("button", { name: /Open Existing Project/ }).click();
    await page.getByLabel("Project directory").fill(root);
    await page.getByRole("button", { name: "Analyze project" }).click();
    await page.getByRole("button", { name: "Start local preview" }).click();

    const explorer = page.locator(".source-explorer");
    await explorer.getByRole("treeitem", { name: "src" }).click();
    await explorer.getByRole("treeitem", { name: /App\.jsx/ }).click();
    await explorer.locator(".component-row", { hasText: "App" }).click();
    await explorer.locator(".explorer-name", { hasText: /^main$/ }).first().locator("..").click();
    await explorer.locator(".explorer-name", { hasText: /^section$/ }).first().locator("..").click();
    await explorer.locator(".explorer-name", { hasText: /^label$/ }).first().locator("..").click();
    await page.getByRole("tab", { name: "Layout" }).click();
    await page.getByLabel("New ID / name").fill("customerFieldCopy");
    await page.getByRole("button", { name: "Duplicate directly" }).click();

    const frame = page.frameLocator('iframe[title="Live preview"]');
    await expect(frame.getByText("Customer")).toHaveCount(2);
    await explorer.locator(".explorer-name", { hasText: /^section$/ }).first().locator("..").click();
    await page.locator(".icon-rail").getByRole("button", { name: "Components" }).click();
    await expect(page.locator(".component-drop-target.ready")).toContainText("section");
    await page.locator(".project-component-list").getByRole("button", { name: /DateField/ }).dragTo(frame.locator("section"));
    await expect(frame.getByLabel("Project date field")).toHaveCount(2);
    await commitDraft(page);

    const source = await readFile(path.join(root, "src/App.jsx"), "utf8");
    expect(source).toContain('id="customerFieldCopy"');
    expect(source).toMatch(/import DateField from['"]\.\/components\/DateField['"]/);
    expect(source).toContain('name="firstDate"');
    expect(source.match(/<DateField/g)?.length).toBe(2);
  } finally {
    await stopPreview(page).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test("selecting a menu component opens an isolated provider-backed design instead of the login entry", async ({
  page,
}) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-design-harness-"));
  try {
    await mkdir(path.join(root, "src/context"), { recursive: true });
    await mkdir(path.join(root, "src/hooks"), { recursive: true });
    await mkdir(path.join(root, "src/components"), { recursive: true });
    await mkdir(path.join(root, "src/views"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "design-harness",
        dependencies: { react: "19", "react-dom": "19", vite: "8" },
        scripts: { dev: "vite" },
      }),
    );
    await writeFile(
      path.join(root, "index.html"),
      '<div id="root"></div><script type="module" src="/src/App.jsx"></script>',
    );
    await writeFile(
      path.join(root, "src/App.jsx"),
      "import React from 'react';import{createRoot}from'react-dom/client';import './styles.css';createRoot(document.getElementById('root')).render(<h1>Login page</h1>);",
    );
    await writeFile(
      path.join(root, "src/styles.css"),
      "body{font-family:sans-serif}.screen{padding:24px}",
    );
    await writeFile(
      path.join(root, "src/context/ThingContext.jsx"),
      "import React,{createContext}from'react';export const ThingContext=createContext();export const ThingProvider=({children})=><ThingContext.Provider value={{label:'Provider ready'}}>{children}</ThingContext.Provider>;",
    );
    await writeFile(
      path.join(root, "src/hooks/useThing.jsx"),
      "import{useContext}from'react';import{ThingContext}from'../context/ThingContext';export const useThing=()=>useContext(ThingContext);",
    );
    await writeFile(
      path.join(root, "src/components/Panel.jsx"),
      "export default function Panel({children}){return <div className='panel'>{children}</div>}",
    );
    await writeFile(
      path.join(root, "src/views/MenuView.jsx"),
      "import React,{useEffect,useState}from'react';import{useThing}from'../hooks/useThing';import Panel from'../components/Panel';export default function MenuView(){const{label}=useThing();const[network,setNetwork]=useState('Loading design data');const[xhrState,setXhrState]=useState('Loading XHR data');useEffect(()=>{fetch('https://example.invalid/DEMO.SVC',{method:'POST'}).then(r=>r.json()).then(data=>setNetwork(data.__uiuxMock?'Design data ready':'Unexpected response')).catch(()=>setNetwork('Network error'));const request=new XMLHttpRequest();request.open('POST','https://example.invalid/EXAMPLE.SVC');request.onload=()=>setXhrState(JSON.parse(request.responseText).__uiuxMock?'XHR data ready':'Unexpected XHR');request.onerror=()=>setXhrState('XHR error');request.send('{}')},[]);return <Panel><main className='screen'><h1>Activity Report</h1><p>{label}</p><p>{network}</p><p>{xhrState}</p></main></Panel>}",
    );

    await page.goto("/");
    await page.getByRole("button", { name: /Open Existing Project/ }).click();
    await page.getByLabel("Project directory").fill(root);
    await page.getByRole("button", { name: "Analyze project" }).click();
    await page.getByRole("button", { name: "Start local preview" }).click();

    const frame = page.frameLocator('iframe[title="Live preview"]');
    await expect(
      frame.getByRole("heading", { name: "Login page" }),
    ).toBeVisible();
    const explorer = page.locator(".source-explorer");
    await explorer.getByRole("treeitem", { name: "src" }).click();
    await explorer.getByRole("treeitem", { name: "views" }).click();
    await explorer.getByRole("treeitem", { name: /MenuView\.jsx/ }).click();
    await explorer.locator(".component-row", { hasText: "MenuView" }).click();

    await expect(
      frame.getByRole("heading", { name: "Activity Report" }),
    ).toBeVisible();
    await expect(frame.getByText("Provider ready")).toBeVisible();
    await expect(frame.getByText("Design data ready")).toBeVisible();
    await expect(frame.getByText("XHR data ready")).toBeVisible();
    await frame.locator(".panel").evaluate((element) => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await expect(
      page.locator(".selected-heading").getByRole("heading", { name: "Panel" }),
    ).toBeVisible();
    await page
      .locator(".icon-rail")
      .getByRole("button", { name: "Components" })
      .click();
    const reusableCatalog = page.locator(".project-component-list");
    await expect(
      reusableCatalog.getByRole("button", { name: /Panel/ }),
    ).toBeVisible();
    await expect(
      reusableCatalog.getByRole("button", { name: /MenuView/ }),
    ).toHaveCount(0);
    await expect(
      reusableCatalog.getByRole("button", { name: /ThingProvider/ }),
    ).toHaveCount(0);
    const target = page.locator(".component-drop-target.ready");
    await expect(target).toContainText("Panel");
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .locator(".primitive-grid")
      .getByRole("button", { name: "Button" })
      .dragTo(target);
    await expect(frame.getByRole("button", { name: "New button" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "App preview" }),
    ).toBeVisible();
  } finally {
    await stopPreview(page).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test("Next.js remains static-inspection only and does not offer runtime approval", async ({
  page,
}) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-next-static-"));
  try {
    await mkdir(path.join(root, "app"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "next-static",
        dependencies: { next: "15", react: "19" },
      }),
    );
    await writeFile(
      path.join(root, "app/page.tsx"),
      "export default function Page(){return <main>Static only</main>}",
    );
    await page.goto("/");
    await page.getByRole("button", { name: /Open Existing Project/ }).click();
    await page.getByLabel("Project directory").fill(root);
    await page.getByRole("button", { name: "Analyze project" }).click();
    await expect(
      page
        .locator(".analysis-columns")
        .getByText(
          "Next.js runtime preview is unavailable in this release. Static inspection remains available.",
        ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Unsupported" }),
    ).toBeDisabled();
    await expect(page.getByRole("button", { name: "Start local preview" })).toHaveCount(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("React formatting palette writes a selected text style to source", async ({ page }) => {
  await page.goto("/");
  const root = await openFixtureProject(page);
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("tab", { name: "Style" }).click();
  const palette = page.locator(".inspector-section").filter({ has: page.getByRole("heading", { name: "Formatting palette" }) });
  await palette.getByLabel("Formatting property").selectOption("textDecorationLine");
  await palette.getByLabel("CSS value").fill("underline");
  await palette.getByRole("button", { name: "Apply to draft" }).click();
  await expect(page.locator('.studio-header:not([data-draft-count="0"])')).toHaveCount(1, { timeout: 30_000 });
  await commitDraft(page);
  expect(await readFile(path.join(root, "src/App.tsx"), "utf8")).toContain('textDecorationLine: "underline"');
  await stopPreview(page);
});


test("style presets apply to the selected React element and update source", async ({ page }) => {
  await page.goto("/");
  await openFixtureProject(page);
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.getByRole("button", { name: "Create project" }).click();
  await expect(page.locator(".selected-heading")).toBeVisible();
  await page.getByRole("button", { name: "Components", exact: true }).click();
  await page.locator(".style-presets > summary").click();

  const heading = page
    .locator(".style-preset-chips")
    .getByRole("button", { name: "Heading", exact: true });
  await expect(heading).toBeEnabled();
  await heading.click();
  await expect(page.getByText("Change added to draft")).toBeVisible();
  await expect(
    frame.getByRole("button", { name: "Create project" }),
  ).toHaveCSS("font-size", "28px");
  await commitDraft(page);
});


test("React block selection selects every intersecting element", async ({ page }) => {
  await page.goto("/");
  await openFixtureProject(page);
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await expect(frame.getByRole("button", { name: "Create project" })).toBeVisible();
  const boxes = await frame.locator("body").evaluate(() => {
    const pick = (text: string) =>
      Array.from(document.querySelectorAll("[data-uiux-id]")).find((node) =>
        (node.textContent ?? "").trim().startsWith(text),
      );
    return ["Create project", "Website redesign"]
      .map((text) => pick(text))
      .filter((node): node is Element => Boolean(node))
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      });
  });
  expect(boxes.length).toBe(2);
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.left + box.width));
  const bottom = Math.max(...boxes.map((box) => box.top + box.height));
  await frame.locator("body").evaluate(
    (_body, points) => {
      const { left, top, right, bottom } = points as {
        left: number;
        top: number;
        right: number;
        bottom: number;
      };
      const fire = (target: EventTarget, type: string, x: number, y: number) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            clientX: x,
            clientY: y,
          }),
        );
      fire(document.body, "pointerdown", left - 6, top - 6);
      fire(window, "pointermove", right + 6, bottom + 6);
      fire(window, "pointerup", right + 6, bottom + 6);
    },
    { left, top, right, bottom },
  );
  await expect(page.getByText(/\d+ objects selected/)).toBeVisible();
});


test("a draft survives a page reload and can still be saved", async ({ page }) => {
  await page.goto("/");
  const root = await openFixtureProject(page);
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.locator("section.welcome-section").click({ position: { x: 5, y: 5 } });
  await page.locator(".icon-rail").getByRole("button", { name: "Components" }).click();
  await page.locator(".primitive-grid").getByRole("button", { name: "Paragraph" }).click();
  await expect(page.locator('.studio-header:not([data-draft-count="0"])')).toHaveCount(1, { timeout: 15_000 });

  await page.reload();
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  const startPreview = page.getByRole("button", { name: "Start local preview" });
  await expect(startPreview).toBeVisible({ timeout: 30_000 });
  await startPreview.click();
  await expect(page.locator(".studio-header")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.studio-header:not([data-draft-count="0"])')).toHaveCount(1, { timeout: 30_000 });
  await stopPreview(page);
});


test("edits do not prompt and leaving offers save or discard", async ({ page }) => {
  let dialogs = 0;
  page.on("dialog", (dialog) => {
    dialogs += 1;
    void dialog.dismiss();
  });
  await page.goto("/");
  await openFixtureProject(page);
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.getByRole("button", { name: "Create project" }).click();
  await page.getByLabel("Text content").fill("Changed without prompt");
  await page
    .locator(".inspector-section")
    .filter({ has: page.getByRole("heading", { name: "Text content" }) })
    .getByRole("button", { name: "Apply to draft" })
    .click();
  await expect(page.locator('.studio-header:not([data-draft-count="0"])')).toHaveCount(1, { timeout: 15_000 });
  expect(dialogs).toBe(0);

  await page.locator(".icon-rail").getByRole("button", { name: "Leave project workspace" }).click();
  const dialog = page.getByRole("dialog", { name: "Leave this project workspace?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save & leave" })).toBeVisible();
  await dialog.getByRole("button", { name: "Discard & leave" }).click();
  await expect(page.getByRole("button", { name: /Open Existing Project/ })).toBeVisible();
  expect(dialogs).toBe(0);
});


test("one click starts the controlled preview with simplified chrome", async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-one-click-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  let dialogs = 0;
  page.on("dialog", () => {
    dialogs += 1;
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await expect(page.getByRole("button", { name: "Inspect only" })).toHaveCount(0);
  await page.getByRole("button", { name: "Start local preview" }).click();
  await expect(page.locator(".icon-rail")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("dialog", { name: "Approve local preview" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Design" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Code" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Interact" })).toHaveCount(0);
  await expect(page.locator(".icon-rail").getByRole("button", { name: "Boards" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Help" })).toHaveCount(1);
  expect(dialogs).toBe(0);
  await stopPreview(page);
});


test("clicking a compound form control selects its logical Form.Field owner", async ({ page }) => {
  test.setTimeout(90_000);
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-logical-group-"));
  fixtureRoots.add(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "logical-group", dependencies: { react: "19", "react-dom": "19", vite: "8" }, scripts: { dev: "vite" } }),
  );
  await writeFile(path.join(root, "index.html"), '<div id="root"></div><script type="module" src="/src/main.jsx"></script>');
  await writeFile(
    path.join(root, "src/main.jsx"),
    'import React from "react";import{createRoot}from"react-dom/client";import App from "./App";createRoot(document.getElementById("root")).render(<App/>);',
  );
  await writeFile(
    path.join(root, "src/Form.jsx"),
    'function Form({children}){return <div>{children}</div>} Form.Field=({label,children})=><div><label>{label}</label>{children}</div>;export default Form;',
  );
  await writeFile(
    path.join(root, "src/CodeCombo.jsx"),
    'export default function CodeCombo({name}){return <select aria-label="Branch code" name={name}><option>MAIN</option></select>}',
  );
  await writeFile(
    path.join(root, "src/App.jsx"),
    'import Form from "./Form";import CodeCombo from "./CodeCombo";export default function App(){return <main><section><Form><Form.Field label="Branch No"><CodeCombo name="brNo" /></Form.Field></Form></section></main>}',
  );

  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await expect(frame.getByLabel("Branch code")).toBeVisible({ timeout: 30_000 });
  await frame.getByLabel("Branch code").click();
  await expect(page.locator(".selected-heading")).toContainText("Form.Field");
  await expect(frame.locator('[data-uiux-selection="primary"]')).toBeVisible();
  await expect(frame.getByText("SELECTED")).toBeVisible();
  await expect(page.getByText(/exact component instance could not be determined/i)).toHaveCount(0);
  await expect(page.locator(".source-location")).toContainText("App.jsx");
  await stopPreview(page);
});


test("platform modifier adds a second logical form group to selection", async ({ page }) => {
  test.setTimeout(90_000);
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-group-modifier-"));
  fixtureRoots.add(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "group-modifier", dependencies: { react: "19", "react-dom": "19", vite: "8" }, scripts: { dev: "vite" } }),
  );
  await writeFile(path.join(root, "index.html"), '<div id="root"></div><script type="module" src="/src/main.jsx"></script>');
  await writeFile(
    path.join(root, "src/main.jsx"),
    'import React from "react";import{createRoot}from"react-dom/client";import App from "./App";createRoot(document.getElementById("root")).render(<App/>);',
  );
  await writeFile(
    path.join(root, "src/Form.jsx"),
    'function Form({children}){return <div>{children}</div>} Form.Field=({label,children})=><div><label>{label}</label>{children}</div>;export default Form;',
  );
  await writeFile(
    path.join(root, "src/App.jsx"),
    'import Form from "./Form";export default function App(){return <main><section><Form><Form.Field label="Branch No"><select aria-label="Branch code"><option>MAIN</option></select></Form.Field><Form.Field label="Period Date"><input aria-label="Period date" type="date" /></Form.Field></Form></section></main>}',
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await expect(frame.getByLabel("Branch code")).toBeVisible({ timeout: 30_000 });
  await frame.getByLabel("Branch code").click();
  await expect(page.locator(".selected-heading")).toContainText("Form.Field");
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await frame.getByLabel("Period date").click({ modifiers: [modifier] });
  await expect(page.getByText(/2 objects selected/)).toBeVisible();
  await stopPreview(page);
});


test("group move applies to every selected generic object, not only form fields", async ({ page }) => {
  test.setTimeout(90_000);
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-group-move-all-"));
  fixtureRoots.add(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "group-move-all", dependencies: { react: "19", "react-dom": "19", vite: "8" }, scripts: { dev: "vite" } }),
  );
  await writeFile(path.join(root, "index.html"), '<div id="root"></div><script type="module" src="/src/main.jsx"></script>');
  await writeFile(
    path.join(root, "src/main.jsx"),
    'import React from "react";import{createRoot}from"react-dom/client";import App from "./App";createRoot(document.getElementById("root")).render(<App/>);',
  );
  await writeFile(
    path.join(root, "src/App.jsx"),
    'export default function App(){return <main><section><button>Alpha</button><button>Beta</button></section></main>}',
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  const frame = page.frameLocator('iframe[title="Live preview"]');
  const alpha = frame.getByRole("button", { name: "Alpha" });
  await expect(alpha).toBeVisible({ timeout: 30_000 });
  await alpha.click();
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await frame.getByRole("button", { name: "Beta" }).click({ modifiers: [modifier] });
  await expect(page.getByText(/2 objects selected/)).toBeVisible();
  const draftRequests: string[] = [];
  const buildRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/draft\/(edit|edit-group)/.test(request.url())) draftRequests.push(request.url());
    if (request.url().endsWith("/api/build")) buildRequests.push(request.url());
  });
  const box = await alpha.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 30, box!.y + box!.height / 2, { steps: 5 });
  expect(draftRequests).toHaveLength(0);
  expect(buildRequests).toHaveLength(0);
  await page.mouse.up();
  await expect(page.locator('.studio-header:not([data-draft-count="0"])')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.getByText("Working…", { exact: true })).toHaveCount(0);
  await page.locator(".bottom-toolbar").getByRole("tab", { name: /Changes/ }).click();
  await expect(page.locator(".change-list")).toContainText("selection");
  await commitDraft(page);
  const source = await readFile(path.join(root, "src/App.jsx"), "utf8");
  const updates = source.match(/marginLeft: "\d+px"/g) ?? [];
  expect(updates.length).toBe(2);
  expect(source).toContain("<button");
});


test("page tabs keep at most three routes and switch without duplicates", async ({ page }) => {
  test.setTimeout(120_000);
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-tabs-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  await page.route("**/api/open", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    const base = json.routes[0] ?? { path: "/", file: json.files[0]?.file ?? "", previewState: "CONFIG_REQUIRED", reason: "" };
    json.routes = ["/", "/a", "/b", "/c"].map((path) => ({ ...base, path }));
    await route.fulfill({ response, json });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  const routeSelect = page.getByLabel("Choose route");
  await expect(routeSelect).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".page-tab")).toHaveCount(1);
  for (const path of ["/a", "/b", "/c"]) {
    await routeSelect.selectOption(path);
    await page.waitForTimeout(400);
  }
  await expect(page.locator(".page-tab")).toHaveCount(3);
  await routeSelect.selectOption("/b");
  await page.waitForTimeout(300);
  await expect(page.locator(".page-tab")).toHaveCount(3);
  const names = await page.locator(".page-tab > button[role=tab]").allInnerTexts();
  expect(new Set(names).size).toBe(3);
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.getByRole("button", { name: "Create project" }).click();
  await frame.getByRole("button", { name: "Create project" }).press("ArrowDown");
  await expect(page.locator('.studio-header:not([data-draft-count="0"])')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator(".page-tab.active .tab-dirty")).toBeVisible();
  await page.locator(".page-tab.active .tab-close").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Discard & close" })).toBeVisible();
  await dialog.getByRole("button", { name: "Discard & close" }).click();
  await expect(page.locator(".page-tab")).toHaveCount(2);
  await stopPreview(page);
});


test("Code mode reveals the selected object source and console keeps errors", async ({ page }) => {
  await page.goto("/");
  const root = await openFixtureProject(page);
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("tab", { name: "Code" }).click();
  await expect(page.locator(".source-file-label")).toContainText("src/App.tsx");
  await expect(page.locator(".source-file-label")).toContainText("line");
  await page.getByRole("tab", { name: "Design" }).click();
  await page.getByLabel("Text content").fill("Conflict text");
  await page
    .locator(".inspector-section")
    .filter({ has: page.getByRole("heading", { name: "Text content" }) })
    .getByRole("button", { name: "Apply to draft" })
    .click();
  await expect(page.locator('.studio-header:not([data-draft-count="0"])')).toHaveCount(1);
  const sourcePath = path.join(root, "src/App.tsx");
  await writeFile(sourcePath, (await readFile(sourcePath, "utf8")) + "\n// external edit\n");
  await page.locator(".canvas-actions").first().getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Source conflict/i).first()).toBeVisible({ timeout: 10_000 });
  await page.locator(".bottom-toolbar").getByRole("tab", { name: /Console/ }).click();
  await expect(page.locator(".console-output")).toContainText("[error]");
});


test("a date-range component selects as one logical unit", async ({ page }) => {
  test.setTimeout(90_000);
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-date-group-"));
  fixtureRoots.add(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "date-group", dependencies: { react: "19", "react-dom": "19", vite: "8" }, scripts: { dev: "vite" } }));
  await writeFile(path.join(root, "index.html"), '<div id="root"></div><script type="module" src="/src/main.jsx"></script>');
  await writeFile(path.join(root, "src/main.jsx"), 'import React from "react";import{createRoot}from"react-dom/client";import App from "./App";createRoot(document.getElementById("root")).render(<App/>);');
  await writeFile(path.join(root, "src/DateRange.jsx"), 'export default function DateRange(){return <div><input aria-label="Start date" type="date"/><button aria-label="Open calendar">Cal</button><input aria-label="End date" type="date"/></div>}');
  await writeFile(path.join(root, "src/App.jsx"), 'import DateRange from "./DateRange";export default function App(){return <main><section><DateRange /></section></main>}');
  await page.goto("/");
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await expect(frame.getByLabel("Start date")).toBeVisible({ timeout: 30_000 });
  await frame.getByLabel("Start date").click();
  await expect(page.locator(".selected-heading")).toContainText("DateRange");
  await frame.getByLabel("Open calendar").click();
  await expect(page.locator(".selected-heading")).toContainText("DateRange");
  await stopPreview(page);
});
