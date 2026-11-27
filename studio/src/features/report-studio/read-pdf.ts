import { AnnotationMode, getDocument, GlobalWorkerOptions, Util } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { DEFAULT_LIMITS } from "../../../../src/reports/core/types";
import type { PdfReportPage, PdfTextRun } from "./report-imports";

export async function readPdf(file: File, mode: "image" | "text" = "image") {
  GlobalWorkerOptions.workerSrc = workerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const task = getDocument({ data, stopAtErrors: true, enableXfa: false, useSystemFonts: true, maxImageSize: 8_000_000 });
  try {
    const pdf = await task.promise;
    if (pdf.numPages < 1 || pdf.numPages > 6) throw new Error("Choose a PDF with one to six pages.");
    const pages: PdfReportPage[] = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const original = page.getViewport({ scale: 1 });
      const aspect = original.width / original.height;
      if (mode === "text") {
        const runs: PdfTextRun[] = [];
        const content = await page.getTextContent();
        for (const item of content.items) {
          if (!("str" in item) || !item.str.trim()) continue;
          const [baselineX, baselineY, upX, upY, x, y] = Util.transform(original.transform, item.transform) as [number, number, number, number, number, number];
          const length = Math.hypot(baselineX, baselineY);
          const upLength = Math.hypot(upX, upY);
          if (!length || !upLength) continue;
          const cos = baselineX / length, sin = baselineY / length;
          if (item.dir !== "ltr" || Math.abs(cos * upX / upLength + sin * upY / upLength) > 0.001 ||
              cos * upY - sin * upX >= 0) {
            throw new Error("Use Import PDF pages for mirrored, skewed, or non-left-to-right text.");
          }
          const width = item.width * original.scale, height = item.height * original.scale;
          const centerX = x + cos * width / 2 + sin * height / 2;
          const centerY = y + sin * width / 2 - cos * height / 2;
          const halfWidth = (Math.abs(cos) * width + Math.abs(sin) * height) / 2;
          const halfHeight = (Math.abs(sin) * width + Math.abs(cos) * height) / 2;
          const left = centerX - width / 2, top = centerY - height / 2;
          if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0 ||
              left < 0 || top < 0 || centerX - halfWidth < -0.01 || centerY - halfHeight < -0.01 ||
              centerX + halfWidth > original.width + 0.01 || centerY + halfHeight > original.height + 0.01) continue;
          runs.push({ text: item.str, x: left / original.width, y: top / original.height,
            width: width / original.width, height: height / original.height,
            rotation: Number((Math.atan2(sin, cos) * 180 / Math.PI).toFixed(4)) });
          if (runs.length > DEFAULT_LIMITS.maxElementsPerBand) throw new Error("This page has too many editable text blocks. Use Import PDF pages.");
        }
        if (!runs.length) throw new Error("No supported editable text was found. Use Import PDF pages for scans or graphics.");
        pages.push({ runs, aspect });
        page.cleanup();
        continue;
      }
      const scale = Math.min(2, 1400 / Math.max(original.width, original.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport, annotationMode: AnnotationMode.DISABLE, background: "#fff" }).promise;
      const png = canvas.toDataURL("image/png");
      const image = png.length <= 600_000 ? png : canvas.toDataURL("image/jpeg", 0.86);
      pages.push({ image, aspect });
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
