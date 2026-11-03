import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const projectRoot = process.cwd();
const outputDir = path.join(projectRoot, "docs", "screenshots");
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "uiux-docs-fixture-"));
const port = 41792;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ["dist/cli.js", "--port", String(port), "--no-open"],
  {
    cwd: projectRoot,
    env: { ...process.env, UIUX_NO_OPEN: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  },
);

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.on("exit", (code, signal) => {
  if (code !== 0 && signal !== "SIGTERM") {
    console.error(`Studio stopped (code ${code}, signal ${signal ?? "none"}).`);
  }
});

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Studio stopped before it was ready.\n${serverOutput}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/session`);
      if (response.ok) return;
    } catch {
      // The local service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Studio did not start within 30 seconds.\n${serverOutput}`);
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return chromium.launch();
  }
}

let browser;
try {
  await mkdir(outputDir, { recursive: true });
  await cp(path.join(projectRoot, "fixtures", "demo"), fixtureRoot, {
    recursive: true,
  });
  await waitForServer();
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.addInitScript(() => {
    localStorage.setItem("uiux-language", "en");
    localStorage.setItem("uiux-theme", "light");
  });
  await page.goto(baseUrl);

  await page.addStyleTag({ content: ".recent-section { display: none !important; }" });
  await page.screenshot({
    path: path.join(outputDir, "home.png"),
    fullPage: true,
  });
  console.log("Captured docs/screenshots/home.png");

  await page
    .getByRole("button", { name: /See what the application can do/ })
    .click();
  const guide = page.getByRole("dialog", { name: "Interactive user guide" });
  await guide.waitFor();
  await guide.screenshot({
    path: path.join(outputDir, "user-guide.png"),
  });
  console.log("Captured docs/screenshots/user-guide.png");
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: /New Project/ }).click();
  await page.getByLabel("Parent directory").fill("/path/to/projects");
  await page.screenshot({
    path: path.join(outputDir, "new-project.png"),
    fullPage: true,
  });
  console.log("Captured docs/screenshots/new-project.png");
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(fixtureRoot);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.locator(".analysis-title code").evaluate((element) => {
    element.textContent = "/path/to/react-project";
  });
  await page.screenshot({
    path: path.join(outputDir, "analysis.png"),
    fullPage: true,
  });
  console.log("Captured docs/screenshots/analysis.png");
  await page.getByRole("button", { name: "Start local preview" }).click();
  await page
    .getByRole("dialog", { name: "Approve local preview" })
    .getByRole("button", { name: "Approve & start" })
    .click();

  const frame = page.frameLocator('iframe[title="Live preview"]');
  await frame.getByRole("button", { name: "Create project" }).waitFor();
  await frame.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("tab", { name: "Layout" }).click();
  await page.screenshot({
    path: path.join(outputDir, "canvas-inspector.png"),
    fullPage: true,
  });
  console.log("Captured docs/screenshots/canvas-inspector.png");

  await page
    .locator(".icon-rail")
    .getByRole("button", { name: "Pages" })
    .click();
  const explorer = page.locator(".source-explorer");
  await explorer.getByRole("treeitem", { name: "src" }).click();
  await explorer.getByRole("treeitem", { name: /App\.tsx/ }).click();
  await explorer.locator(".component-row", { hasText: "App" }).click();
  await explorer
    .locator(".explorer-name", { hasText: /^div$/ })
    .first()
    .locator("..")
    .click();
  await explorer
    .locator(".explorer-name", { hasText: /^main$/ })
    .first()
    .locator("..")
    .click();
  await explorer
    .locator(".explorer-name", { hasText: /^section$/ })
    .first()
    .locator("..")
    .click();
  await page
    .locator(".icon-rail")
    .getByRole("button", { name: "Components" })
    .click();
  await page.locator(".component-drop-target.ready").waitFor();
  await page.screenshot({
    path: path.join(outputDir, "component-palette.png"),
    fullPage: true,
  });
  console.log("Captured docs/screenshots/component-palette.png");

  await page
    .locator(".icon-rail")
    .getByRole("button", { name: "Pages" })
    .click();
  await frame.getByText("Website redesign").click();
  await page.screenshot({
    path: path.join(outputDir, "unsupported.png"),
    fullPage: true,
  });
  console.log("Captured docs/screenshots/unsupported.png");

  await page.getByLabel("Language").selectOption("id");
  await page.screenshot({
    path: path.join(outputDir, "unsupported-id.png"),
    fullPage: true,
  });
  console.log("Captured docs/screenshots/unsupported-id.png");
  await page.getByLabel("Bahasa").selectOption("en");

  await page.getByLabel("Theme").selectOption("dark");
  await page.screenshot({
    path: path.join(outputDir, "dark.png"),
    fullPage: true,
  });
  console.log("Captured docs/screenshots/dark.png");
  await page.getByLabel("Theme").selectOption("light");

  await page
    .locator(".icon-rail")
    .getByRole("button", { name: "Boards" })
    .click();
  await page.screenshot({
    path: path.join(outputDir, "boards.png"),
    fullPage: true,
  });
  console.log("Captured docs/screenshots/boards.png");
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    if (process.platform === "win32") server.kill("SIGTERM");
    else process.kill(-server.pid, "SIGTERM");
  }
  await rm(fixtureRoot, { recursive: true, force: true });
}
