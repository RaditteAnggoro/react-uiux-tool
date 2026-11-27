import { test, expect } from "./studio-fixture.js";

test("installed Next.js App Router renders static and concrete dynamic URLs", async ({ page }, info) => {
  const fixture = process.env.UIUX_NEXT_RUNTIME_FIXTURE;
  test.skip(!fixture, "Provide the installed generated Next.js fixture to test the real runtime.");
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem("uiux-language", "en"));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Open Existing Project/ }).click();
  await page.getByLabel("Project directory").fill(fixture!);
  await page.getByRole("button", { name: "Analyze project" }).click();
  await page.getByRole("button", { name: "Start Next.js runtime" }).click();
  const preview = page.locator('iframe[title="Next.js application preview"]');
  const frame = preview.contentFrame();
  await expect(frame.getByRole("heading", { name: "Make room for your next idea." })).toBeVisible({ timeout: 35_000 });
  const saveExample = frame.getByRole("button", { name: "Save locally" });
  await expect(saveExample).toBeEnabled({ timeout: 35_000 });
  await frame.getByRole("textbox", { name: "Project name" }).fill("Next fixture");
  await frame.getByRole("textbox", { name: "Email address" }).fill("fixture@example.test");
  await saveExample.click();
  await expect(frame.getByRole("status")).toContainText("Example submitted");
  const routes = page.getByRole("combobox", { name: "Detected routes" });
  const base = "/studio-fixture";
  await routes.selectOption(base + "/products/[sku]");
  const input = page.getByRole("textbox", { name: "Local route path" });
  await expect(input).toHaveValue(base + "/products/[sku]");
  await input.fill("//example.test");
  await page.getByRole("button", { name: "Open route" }).click();
  await expect(page.getByRole("alert")).toContainText("Enter a local path");
  await page.getByRole("textbox", { name: "sku", exact: true }).fill("DEMO-01");
  await expect(input).toHaveValue(base + "/products/DEMO-01");
  await input.press("Enter");
  await expect(frame.getByRole("heading", { name: "Product DEMO-01" })).toBeVisible({ timeout: 35_000 });
  await page.getByRole("button", { name: "Show route source" }).click();
  const source = page.getByRole("region", { name: "Show route source" });
  await expect(source).toContainText(/products\/\[sku\]\/page\.[jt]sx?/);
  await expect(source.locator("pre")).toContainText("sku");
  await expect(frame.getByRole("heading", { name: "Product DEMO-01" })).toBeVisible();
  await page.getByRole("button", { name: "Hide route source" }).click();
  await expect(source).toHaveCount(0);
  await page.getByRole("combobox", { name: "Detected routes" }).selectOption(base + "/legacy/[sku]");
  await input.fill(base + "/legacy/DEMO-02");
  await input.press("Enter");
  await expect(frame.getByRole("heading", { name: "Legacy DEMO-02" })).toBeVisible({ timeout: 35_000 });
  await routes.selectOption(base + "/docs/[[...slug]]");
  await input.press("Enter");
  await expect(frame.getByRole("heading", { name: "Docs index" })).toBeVisible({ timeout: 35_000 });
  await page.getByRole("textbox", { name: "slug (optional)", exact: true }).fill("guides/drafts");
  await expect(input).toHaveValue(base + "/docs/guides/drafts");
  await input.press("Enter");
  await expect(frame.getByRole("heading", { name: "Docs guides/drafts" })).toBeVisible({ timeout: 35_000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("next-runtime-pages-route.png") });
  const runtimeUrl = (await preview.getAttribute("src"))!;
  await page.getByRole("button", { name: "Stop preview and return" }).click();
  await expect(page.getByRole("button", { name: "Start Next.js runtime" })).toBeVisible();
  await expect.poll(async () => {
    try {
      const response = await page.request.get(runtimeUrl, { timeout: 1000 });
      await response.dispose();
      return true;
    } catch {
      return false;
    }
  }).toBe(false);
});
