import { test, expect } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("uiux-language", "en");
    localStorage.setItem("uiux-theme", "light");
  });
});
const fixtureRoots = new Set<string>();
test.afterAll(async () => {
  await Promise.all(
    [...fixtureRoots].map((root) => rm(root, { recursive: true, force: true })),
  );
  fixtureRoots.clear();
});

async function openFixtureProject(page: import("@playwright/test").Page) {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-e2e-fixture-"));
  fixtureRoots.add(root);
  await cp(path.resolve("fixtures/demo"), root, { recursive: true });
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(root);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start local preview" }).click();
  await page
    .getByRole("dialog", { name: "Approve local preview" })
    .getByRole("button", { name: "Approve & start" })
    .click();
  return root;
}

async function stopPreview(page: import("@playwright/test").Page) {
  const configure = page.getByRole("button", { name: "Configure preview" });
  if (!(await configure.isVisible().catch(() => false))) return;
  await configure.click();
  const stop = page
    .getByRole("dialog", { name: "Approve local preview" })
    .getByRole("button", { name: "Stop preview" });
  if (await stop.isVisible().catch(() => false)) await stop.click();
}

test("palette warns without a selected container and copies a button without an identity", async ({ page }) => {
  await page.goto("/");
  const root = await openFixtureProject(page);
  await page.locator(".icon-rail").getByRole("button", { name: "Components" }).click();
  await page.locator(".primitive-grid").getByRole("button", { name: "Button" }).click();
  await expect(page.getByRole("alert")).toContainText("Select the form or section");
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("tab", { name: "Layout" }).click();
  await page.getByRole("button", { name: "Duplicate directly" }).click();
  await expect(frame.getByRole("button", { name: "Create project" })).toHaveCount(2);
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
  await page.getByRole("dialog", { name: "Approve local preview" }).getByRole("button", { name: "Approve & start" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Tailwind project configuration is not loaded" })).toBeVisible();
  await stopPreview(page);
});

test("code search handles Ctrl+F and navigates source matches", async ({ page }) => {
  await page.goto("/");
  await openFixtureProject(page);
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("tab", { name: "Code" }).click();
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
  await page.getByRole("button", { name: "Inspect only" }).click();
  const explorer = page.locator(".source-explorer");
  await explorer.getByRole("treeitem", { name: "src" }).click();
  await explorer.getByRole("treeitem", { name: "components" }).click();
  await explorer.getByRole("treeitem", { name: /Shared\.tsx/ }).click();
  await explorer.locator(".component-row", { hasText: "Shared" }).click();
  await explorer.locator(".explorer-name", { hasText: /^button$/ }).first().locator("..").click();
  await page.getByRole("tab", { name: "Props" }).click();
  await page.getByLabel("Text content").fill("After");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator(".inspector-section").filter({ has: page.getByRole("heading", { name: "Text content" }) }).getByRole("button", { name: "Save to source" }).click();
  expect(await readFile(file, "utf8")).toBe(source);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".inspector-section").filter({ has: page.getByRole("heading", { name: "Text content" }) }).getByRole("button", { name: "Save to source" }).click();
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
  await page.getByRole("dialog", { name: "Approve local preview" }).getByRole("button", { name: "Approve & start" }).click();
  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.getByRole("button", { name: "Increment" }).click();
  await page.getByRole("tab", { name: "Events" }).click();
  await page.getByLabel("Event property").selectOption("onClick");
  await page.getByLabel("Existing function").fill("increment");
  await page.getByRole("button", { name: "Bind event to source" }).click();
  await expect.poll(() => readFile(path.join(root, "src/App.tsx"), "utf8")).toContain("onClick={increment}");
  await page.getByRole("tab", { name: "Interact" }).click();
  await frame.getByRole("button", { name: "Increment" }).click();
  await expect(frame.getByText("Count: 1")).toBeVisible();
  await page.getByRole("button", { name: "Undo last source edit" }).click();
  await expect.poll(() => readFile(path.join(root, "src/App.tsx"), "utf8")).not.toContain("onClick={increment}");
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
  await page.getByRole("dialog", { name: "Approve local preview" }).getByRole("button", { name: "Approve & start" }).click();
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
  await page.getByRole("dialog", { name: "Approve local preview" }).getByRole("button", { name: "Approve & start" }).click();
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
  await page.getByRole("button", { name: "Inspect only" }).click();
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
  await page.getByRole("button", { name: "Inspect only" }).click();
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
  await expect(tabs.getByRole("tab", { name: "Source" })).toBeVisible();
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
  await expect(page.getByText("Explore the analysis without running project code.")).toBeVisible();
  await page.getByRole("button", { name: "Inspect only" }).click();
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
  await expect(page.locator(".source-location")).toContainText("src/App.tsx");

  const textField = page.getByLabel("Text content");
  await expect(textField).toHaveValue("Create project");
  await textField.fill("Create workspace");
  await page
    .locator(".inspector-section")
    .filter({ has: page.getByRole("heading", { name: "Text content" }) })
    .getByRole("button", { name: "Save to source" })
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
  await expect(
    page
      .locator(".inspector-section")
      .filter({ has: page.getByRole("heading", { name: "Text content" }) })
      .getByRole("button", { name: "Save to source" }),
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

test("project component drag and component copy write directly to source", async ({
  page,
}) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-direct-components-"));
  try {
    await mkdir(path.join(root, "src/components"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "direct-components",
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
    await page
      .getByRole("dialog", { name: "Approve local preview" })
      .getByRole("button", { name: "Approve & start" })
      .click();

    const explorer = page.locator(".source-explorer");
    await explorer.getByRole("treeitem", { name: "src" }).click();
    await explorer.getByRole("treeitem", { name: /App\.jsx/ }).click();
    await explorer.locator(".component-row", { hasText: "App" }).click();
    const mainRow = explorer
      .locator(".explorer-name", { hasText: /^main$/ })
      .first()
      .locator("..");
    await mainRow.click();
    const sectionRow = explorer
      .locator(".explorer-name", { hasText: /^section$/ })
      .first()
      .locator("..");
    await sectionRow.click();
    const labelRow = explorer
      .locator(".explorer-name", { hasText: /^label$/ })
      .first()
      .locator("..");
    await labelRow.click();
    await page.getByRole("tab", { name: "Layout" }).click();
    await expect(page.getByLabel("ID / name to change")).toHaveValue(/id/);
    await page.getByLabel("New ID / name").fill("customerFieldCopy");
    await page.getByRole("button", { name: "Duplicate directly" }).click();

    const frame = page.frameLocator('iframe[title="Live preview"]');
    await expect(frame.getByText("Customer")).toHaveCount(2);
    await sectionRow.click();
    await page.locator(".icon-rail").getByRole("button", { name: "Components" }).click();
    const dropTarget = page.locator(".component-drop-target.ready");
    await expect(dropTarget).toContainText("section");
    await page
      .locator(".project-component-list")
      .getByRole("button", { name: /DateField/ })
      .dragTo(frame.locator("section"));
    await expect(frame.getByLabel("Project date field")).toHaveCount(2);
    await expect(page.getByText("Working…", { exact: true })).toHaveCount(0);
    await frame.getByLabel("Project date field").nth(1).click();
    await frame.getByLabel("Project date field").nth(1).press("ArrowUp");
    await expect(page.getByText("Working…", { exact: true })).toHaveCount(0);
    await expect.poll(async () =>
      readFile(path.join(root, "src/App.jsx"), "utf8"),
    ).toContain('marginTop: "-1px"');
    await expect(page.getByText("Live", { exact: true })).toBeVisible();
    await expect(frame.getByLabel("Project date field")).toHaveCount(2);
    await frame.getByLabel("Project date field").nth(1).click();
    await frame
      .getByLabel("Project date field")
      .nth(1)
      .press("Control+ArrowUp");
    await expect(page.getByText("Working…", { exact: true })).toHaveCount(0);
    await expect.poll(async () =>
      readFile(path.join(root, "src/App.jsx"), "utf8"),
    ).toContain('marginTop: "-9px"');
    const movableField = frame.getByLabel("Project date field").nth(1);
    await movableField.click();
    await expect(
      page.locator(".selected-heading").getByRole("heading", {
        name: "DateField",
      }),
    ).toBeVisible();
    const box = await movableField.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box!.x + box!.width / 2 + 20,
      box!.y + box!.height / 2 + 12,
      { steps: 4 },
    );
    await page.mouse.up();
    await expect(page.getByText("Working…", { exact: true })).toHaveCount(0);
    await expect.poll(async () =>
      readFile(path.join(root, "src/App.jsx"), "utf8"),
    ).toContain('marginLeft: "20px"');
    await expect(page.getByText("Live", { exact: true })).toBeVisible();
    await expect(frame.getByLabel("Project date field")).toHaveCount(2);
    await frame.getByLabel("Project date field").nth(1).click();
    await expect(
      page.locator(".selected-heading").getByRole("heading", { name: "DateField" }),
    ).toBeVisible();
    await page.getByLabel("Property name").fill("name");
    await page.getByLabel("Literal value").fill("settlementDate");
    await page
      .locator(".inspector-section")
      .filter({ has: page.getByRole("heading", { name: "Props" }) })
      .getByRole("button", { name: "Save to source" })
      .click();
    await expect(page.getByText("Working…", { exact: true })).toHaveCount(0);
    expect(await readFile(path.join(root, "src/App.jsx"), "utf8")).toContain(
      'name="settlementDate"',
    );
    await page.getByRole("tab", { name: "Events" }).click();
    await page.getByLabel("Event property").selectOption("onChange");
    await page.getByLabel("Existing function").fill("handleDateChange");
    await page.getByRole("button", { name: "Bind event to source" }).click();
    await expect(page.getByText("Working…", { exact: true })).toHaveCount(0);
    await expect.poll(async () => readFile(path.join(root, "src/App.jsx"), "utf8")).toContain('onChange={handleDateChange}');
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Remove event binding" }).click();
    await expect.poll(async () => readFile(path.join(root, "src/App.jsx"), "utf8")).not.toContain('onChange={handleDateChange}');
    await expect(page.getByText("Working…", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove event binding" })).toBeDisabled();
    await page.getByLabel("Event property").selectOption("onChange");
    await page.getByLabel("Existing function").fill("handleDateChange");
    await page.getByRole("button", { name: "Bind event to source" }).click();
    await expect.poll(async () => readFile(path.join(root, "src/App.jsx"), "utf8")).toContain('onChange={handleDateChange}');

    await expect(frame.getByLabel("Project date field")).toHaveCount(2);
    await frame.getByLabel("Project date field").nth(0).click();
    await frame
      .getByLabel("Project date field")
      .nth(1)
      .click({ modifiers: ["Control"] });
    await expect(page.getByText("2 objects selected")).toBeVisible();
    await page.getByRole("tab", { name: "Layout" }).click();
    await page.getByRole("button", { name: "Align left" }).click();
    await expect.poll(async () => {
      const value = await readFile(path.join(root, "src/App.jsx"), "utf8");
      return (value.match(/marginLeft:/g) ?? []).length;
    }).toBe(2);
    await expect(page.getByText("Live", { exact: true })).toBeVisible();
    await expect(frame.getByLabel("Project date field")).toHaveCount(2);
    await expect(frame.locator('[data-uiux-selection="additional"]')).toHaveCount(1);
    const groupDragField = frame.getByLabel("Project date field").nth(0);
    const groupBox = await groupDragField.boundingBox();
    expect(groupBox).not.toBeNull();
    await page.mouse.move(
      groupBox!.x + groupBox!.width / 2,
      groupBox!.y + groupBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      groupBox!.x + groupBox!.width / 2,
      groupBox!.y + groupBox!.height / 2 + 10,
      { steps: 3 },
    );
    await page.mouse.up();
    await expect.poll(async () => {
      const value = await readFile(path.join(root, "src/App.jsx"), "utf8");
      return (value.match(/marginTop:/g) ?? []).length;
    }).toBe(2);

    const source = await readFile(path.join(root, "src/App.jsx"), "utf8");
    expect(source).toContain('id="customerFieldCopy"');
    expect(source).toMatch(/import DateField from['"]\.\/components\/DateField['"]/);
    expect(source).toContain('name="firstDate"');
    expect(source).toContain('name="settlementDate"');
    expect(source).toContain('onChange={handleDateChange}');
    expect(source).toContain('marginTop: "13px"');
    expect((source.match(/marginLeft:/g) ?? []).length).toBe(2);
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
    const previewDialog = page.getByRole("dialog", {
      name: "Approve local preview",
    });
    await previewDialog
      .getByRole("button", { name: "Approve & start" })
      .click();

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
    await page.getByRole("button", { name: "Inspect only" }).click();
    await expect(
      page.getByText(
        "Runtime preview is unavailable for this project. Static source inspection remains available.",
      ),
    ).toBeVisible();
    await expect(
      page
        .locator(".canvas-empty")
        .getByRole("button", { name: "Unsupported" }),
    ).toBeDisabled();
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
  await palette.getByRole("button", { name: "Save to source" }).click();
  await expect.poll(async () => readFile(path.join(root, "src/App.tsx"), "utf8")).toContain('textDecorationLine: "underline"');
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
  await expect(page.getByText("Style applied to source")).toBeVisible();
  await expect(
    frame.getByRole("button", { name: "Create project" }),
  ).toHaveCSS("font-size", "28px");
});
