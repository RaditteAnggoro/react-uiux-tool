import { test as base } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startStudio } from "../../dist/server/index.js";

export { expect } from "@playwright/test";

export const test = base.extend({
  baseURL: async ({}, use) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "uiux-playwright-"));
    let studio: Awaited<ReturnType<typeof startStudio>> | undefined;
    try {
      studio = await startStudio({
        draftDirectory: directory,
        recentDirectory: directory,
        defaultReportDirectory: path.join(directory, "Documents", "React UIUX Reports"),
      });
      await use(studio.url);
    } finally {
      try {
        await studio?.close();
      } finally {
        await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    }
  },
});
