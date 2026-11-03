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
  await guide.getByRole("button", { name: "Close" }).click();

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
      "import React from'react';import{createRoot}from'react-dom/client';import DateField from'./components/DateField';function App(){const handleDateChange=()=>{};return <main><section><label id=\"customerField\"><span>Customer</span><input name=\"customerCode\" /></label><DateField name=\"firstDate\" /></section></main>}createRoot(document.getElementById('root')).render(<App/>);export default App;",
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
