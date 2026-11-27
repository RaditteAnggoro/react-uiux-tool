import { test, expect } from "./studio-fixture.js";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("editing an isolated component preserves mounted React state through draft and Undo", async ({ page }) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-refresh-fixture-"));
  try {
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "refresh-fixture", dependencies: { react: "19", vite: "8" } }));
    await writeFile(path.join(root, "index.html"), '<div id="root"></div><script type="module" src="/src/App.jsx"></script>');
    await writeFile(path.join(root, "src/App.jsx"), 'import React from "react"; import { createRoot } from "react-dom/client"; createRoot(document.getElementById("root")).render(<main>Home</main>);');
    const source = 'import React, { useEffect, useState } from "react"; export function StatefulCard() { const [note, setNote] = useState(""); useEffect(() => { const update = event => setNote(event.detail); window.addEventListener("fixture:note", update); return () => window.removeEventListener("fixture:note", update); }, []); return <main><h1>Original heading</h1><input aria-label="Draft note" value={note} onChange={event => setNote(event.target.value)}/><div style={{height: 900}}/></main>; }';
    const file = path.join(root, "src/StatefulCard.jsx");
    await writeFile(file, source);
    await page.addInitScript(() => localStorage.setItem("uiux-language", "en"));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Open Existing Project/ }).click();
    await page.getByLabel("Project directory").fill(root);
    await page.getByRole("button", { name: "Analyze project" }).click();
    await page.getByRole("button", { name: "Start local preview" }).click();
    const tree = page.locator(".source-explorer");
    await tree.locator('[data-tree-key="dir:src"]').click();
    await tree.locator('[data-tree-key="file:src/StatefulCard.jsx"]').click();
    await tree.locator(".component-row", { hasText: "StatefulCard" }).click();
    const frame = page.frameLocator('iframe[title="Live preview"]');
    const heading = frame.getByRole("heading");
    const note = frame.getByRole("textbox", { name: "Draft note" });
    await expect(heading).toHaveText("Original heading");
    await note.evaluate(() => window.dispatchEvent(new CustomEvent("fixture:note", { detail: "keep state" })));
    await expect(note).toHaveValue("keep state");
    await heading.click();
    const edited = page.getByLabel("Text content");
    await edited.fill("Updated heading");
    const refreshed = page.waitForResponse(response => response.url().endsWith("/api/draft/preview"));
    const before = await heading.evaluate(() => performance.timeOrigin);
    await page.locator(".inspector-section").filter({ has: page.getByRole("heading", { name: "Text content" }) })
      .getByRole("button", { name: "Apply to draft" }).click();
    const scroll = await note.evaluate(element => {
      element.focus({ preventScroll: true });
      window.scrollTo(0, 65);
      return window.scrollY;
    });
    expect(scroll).toBeGreaterThan(0);
    expect((await (await refreshed).json()).hot).toBe(true);
    await expect(heading).toHaveText("Updated heading");
    expect(await note.evaluate(element => ({ focus: document.activeElement === element, scroll: window.scrollY })))
      .toEqual({ focus: true, scroll });
    await expect(note).toHaveValue("keep state");
    expect(await heading.evaluate(() => performance.timeOrigin)).toBe(before);
    expect(await readFile(file, "utf8")).toBe(source);
    await page.locator(".canvas-actions").getByRole("button", { name: "Undo", exact: true }).click();
    await expect(heading).toHaveText("Original heading");
    await expect(note).toHaveValue("keep state");
    expect(await heading.evaluate(() => performance.timeOrigin)).toBe(before);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("component boards use literal Storybook args and update the preview without reload", async ({ page }, info) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uiux-board-fixture-"));
  try {
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "boards", dependencies: { react: "19", vite: "8" } }));
    await writeFile(path.join(root, "index.html"), '<div id="root"></div><script type="module" src="/src/App.jsx"></script>');
    await writeFile(path.join(root, "src/App.jsx"), 'import React from "react"; import { createRoot } from "react-dom/client"; createRoot(document.getElementById("root")).render(<h1>Home</h1>);');
    await writeFile(path.join(root, "src/WidgetContext.jsx"), 'import React from "react"; export const WidgetContext = React.createContext("Missing provider"); export default function WidgetProvider({ children }) { return <WidgetContext.Provider value="Provider active">{children}</WidgetContext.Provider>; }');
    await writeFile(path.join(root, "src/ExplicitProvider.jsx"), 'import React from "react"; import { WidgetContext } from "./WidgetContext"; export function ExplicitProvider({ children }) { return <WidgetContext.Provider value="Explicit provider active">{children}</WidgetContext.Provider>; }');
    await writeFile(path.join(root, "src/NestedProvider.jsx"), 'import React from "react"; import { WidgetContext } from "./WidgetContext"; export function NestedProvider({ children }) { const outer = React.useContext(WidgetContext); return <WidgetContext.Provider value={outer + " / nested"}>{children}</WidgetContext.Provider>; }');
    await writeFile(path.join(root, "src/RequiresPropProvider.tsx"), 'export function RequiresPropProvider({ children, token }: { children: React.ReactNode; token: string }) { return <section title={token}>{children}</section>; }');
    await writeFile(path.join(root, "src/Widget.tsx"), 'import React from "react"; import { WidgetContext } from "./WidgetContext"; export function Widget({ label = "Default widget", amount = 0, active = false, mode = "list" }: { label?: string; amount?: number; active?: boolean; mode?: "list" | "cards" }) { return <main><h1>{label}</h1><output>{amount} {String(active)} {mode}</output><p>{React.useContext(WidgetContext)}</p><input aria-label="Draft note" /></main>; }');
    await writeFile(path.join(root, "src/Widget.stories.ts"), `
      import { Widget as Card } from "./Widget";
      const meta = { component: Card, args: { label: "From meta" } } as const;
      export default meta;
      export const Promo = { args: { label: "Story widget" } };
      export const Dynamic = { args: { label: globalThis.studioStoryProbe() } };
    `);
    await page.addInitScript(() => localStorage.setItem("uiux-language", "en"));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Open Existing Project/ }).click();
    await page.getByLabel("Project directory").fill(root);
    await page.getByRole("button", { name: "Analyze project" }).click();
    await page.getByRole("button", { name: "Start local preview" }).click();
    const tree = page.locator(".source-explorer");
    await tree.locator('[data-tree-key="dir:src"]').click();
    await tree.locator('[data-tree-key="file:src/Widget.tsx"]').click();
    await tree.locator(".component-row", { hasText: "Widget" }).click();
    const frame = page.frameLocator('iframe[title="Live preview"]');
    const heading = frame.getByRole("heading");
    await expect(heading).toHaveText("Default widget");
    await expect(frame.getByText("Provider active")).toBeVisible();
    await page.getByText("Component boards", { exact: true }).click();
    const preset = page.getByLabel("Props preset");
    await expect(preset.getByRole("option", { name: /Dynamic/ })).toHaveCount(0);
    await preset.selectOption({ label: "Promo · src/Widget.stories.ts" });
    const note = frame.getByRole("textbox", { name: "Draft note" });
    await note.evaluate(input => { (input as HTMLInputElement).value = "Keep preview state"; });
    await expect(note).toHaveValue("Keep preview state");
    const before = await heading.evaluate(() => performance.timeOrigin);
    await page.getByRole("button", { name: "Apply props" }).click();
    await expect(heading).toHaveText("Story widget");
    expect(await heading.evaluate(() => performance.timeOrigin)).toBe(before);
    await expect(note).toHaveValue("Keep preview state");
    await page.getByText("Declared props", { exact: true }).click();
    await page.getByLabel("label", { exact: true }).fill("From form");
    await page.getByLabel("label", { exact: true }).press("Enter");
    await page.getByLabel("amount", { exact: true }).fill("2.5");
    await page.getByLabel("amount", { exact: true }).press("Enter");
    await page.getByLabel("active", { exact: true }).selectOption("true");
    await page.getByLabel("mode", { exact: true }).selectOption("cards");
    await page.getByRole("button", { name: "Apply props" }).click();
    await expect(heading).toHaveText("From form");
    await expect(frame.getByText("2.5 true cards")).toBeVisible();
    expect(await heading.evaluate(() => performance.timeOrigin)).toBe(before);
    await page.getByRole("button", { name: "Use default · amount" }).click();
    await page.getByRole("button", { name: "Apply props" }).click();
    await expect(frame.getByText("0 true cards")).toBeVisible();
    await page.getByText("Declared props", { exact: true }).click();
    await page.getByLabel("Props JSON").fill('{"label":"Custom widget"}');
    await page.getByLabel("Board name").fill("Local board");
    await page.getByRole("button", { name: "Save board" }).click();
    await expect(preset.getByRole("option", { name: "Local board" })).toHaveCount(1);
    await page.getByRole("button", { name: "Apply props" }).click();
    await expect(heading).toHaveText("Custom widget");
    await expect(frame.locator('[data-uiux-selection="primary"]')).toContainText("✓ SELECTED");
    const boardsFile = page.locator('.component-boards input[type="file"]');
    const upload = {
      name: "component-boards.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({
        kind: "uiux-component-boards", version: 1,
        boards: [{ name: "Imported board", args: { label: "Shared widget" } }],
      })),
    };
    await boardsFile.setInputFiles(upload);
    await expect(preset.getByRole("option", { name: "Imported board" })).toHaveCount(1);
    await page.getByRole("button", { name: "Apply props" }).click();
    await expect(heading).toHaveText("Shared widget");
    expect(await heading.evaluate(() => performance.timeOrigin)).toBe(before);
    await boardsFile.setInputFiles(upload);
    await expect(page.getByRole("alert")).toContainText("unique names");
    await expect(preset.getByRole("option", { name: "Imported board" })).toHaveCount(1);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export boards" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("component-boards.json");
    const contents = JSON.parse(await readFile(await download.path(), "utf8"));
    expect(contents.boards).toEqual([
      { name: "Local board", args: { label: "Custom widget" } },
      { name: "Imported board", args: { label: "Shared widget" } },
    ]);
    await page.setViewportSize({ width: 768, height: 900 });
    const board = await page.locator(".component-boards").boundingBox();
    const preview = await page.locator(".canvas-area").boundingBox();
    expect(board!.y + board!.height).toBeLessThanOrEqual(preview!.y);
    const badge = frame.locator('[data-uiux-selection="primary"] > span');
    const badgeBounds = await badge.boundingBox();
    const headingBounds = await heading.boundingBox();
    expect(badgeBounds!.y).toBeGreaterThanOrEqual(headingBounds!.y + headingBounds!.height);
    await page.screenshot({ path: info.outputPath("component-boards-768.png") });
    const provider = page.getByRole("combobox", { name: "Preview provider", exact: true });
    await expect(provider.getByRole("option", { name: /RequiresPropProvider/ })).toHaveCount(0);
    await provider.selectOption({ label: "ExplicitProvider · src/ExplicitProvider.jsx" });
    await expect(frame.getByText("Explicit provider active", { exact: true })).toBeVisible();
    await expect(heading).toHaveText("Shared widget");
    const nested = page.getByRole("combobox", { name: "Inner provider 1", exact: true });
    await expect(nested.getByRole("option", { name: /ExplicitProvider/ })).toHaveCount(0);
    await nested.selectOption({ label: "NestedProvider · src/NestedProvider.jsx" });
    await expect(frame.getByText("Explicit provider active / nested", { exact: true })).toBeVisible();
    await expect(heading).toHaveText("Shared widget");
    const session = await (await page.request.get("/api/session")).json();
    const invalid = await page.request.post("/api/preview/design", {
      headers: { origin: new URL(page.url()).origin, "x-uiux-token": session.token },
      data: { approved: true, file: "src/Widget.tsx", componentName: "Widget",
        providerIds: ["src/NestedProvider.jsx#NestedProvider", "src/NestedProvider.jsx#NestedProvider"] },
    });
    expect(invalid.status()).toBe(400);
    await expect(frame.getByText("Explicit provider active / nested", { exact: true })).toBeVisible();
    await provider.selectOption("");
    await expect(frame.getByText("Provider active", { exact: true })).toBeVisible();
    await expect(heading).toHaveText("Shared widget");

    let releaseProvider!: () => void;
    const waitForRelease = new Promise<void>(resolve => { releaseProvider = resolve; });
    await page.route("**/api/preview/design", async route => {
      const request = route.request().postDataJSON();
      if (request.providerIds?.length) await waitForRelease;
      await route.continue();
    });
    await provider.selectOption({ label: "ExplicitProvider · src/ExplicitProvider.jsx" });
    try {
      await expect(provider).toBeDisabled();
      await page.getByRole("tab", { name: "Home", exact: true }).click();
    } finally { releaseProvider(); }
    await expect(frame.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
