import { test, expect } from "@playwright/test";
import { copyFile, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("uiux-language", "en");
    localStorage.setItem("uiux-theme", "light");
  });
});

async function openStudio(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Report Studio/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

test("Report Studio launcher opens the folder and report list", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-smoke-folder-"));
  try {
    await openStudio(page);
    await page.getByRole("dialog").getByRole("button", { name: "Open existing report" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByPlaceholder("/path/to/reports")).toBeVisible();
    await page.getByPlaceholder("/path/to/reports").fill(folder);
    await page.getByRole("button", { name: "Use folder" }).click();
    await expect(page.getByPlaceholder("/path/to/reports")).toHaveValue(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("Report Studio create flow writes a native report", async ({ page }) => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "uiux-smoke-create-"));
  try {
    await openStudio(page);
    await page.getByRole("dialog").getByRole("button", { name: "Create new report" }).click();
    await page.getByPlaceholder("/path/to/reports").fill(folder);
    await page.getByRole("button", { name: "Use folder" }).click();
    await page.getByRole("button", { name: "Create report", exact: true }).click();
    await expect(page.locator(".rs-page")).toBeVisible({ timeout: 20_000 });
    const files = await readdir(folder);
    expect(files.some((name) => name.endsWith(".report.json"))).toBe(true);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
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
