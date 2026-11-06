import type { ReportDocumentV1 } from "../core/types.js";
import { collectTables } from "./csv.js";
import { createZip, escapeXml, textBytes } from "./zip.js";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function paragraph(text: string, bold = false): string {
  return `<w:p><w:r><w:rPr>${bold ? "<w:b/>" : ""}</w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function tableXml(headers: string[], rows: string[][]): string {
  const row = (cells: string[], header = false) =>
    `<w:tr>${cells
      .map(
        (value) =>
          `<w:tc><w:p><w:r><w:rPr>${header ? "<w:b/>" : ""}</w:rPr><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p></w:tc>`,
      )
      .join("")}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>`)
    .join("")}</w:tblBorders></w:tblPr>${row(headers, true)}${rows.map((cells) => row(cells)).join("")}</w:tbl>`;
}

export function exportDocx(
  document: ReportDocumentV1,
  data: Record<string, unknown> = {},
): Uint8Array {
  const tables = collectTables(document, data);
  const body: string[] = [paragraph(document.title, true)];
  for (const table of tables) {
    body.push(tableXml(table.headers, table.rows));
    body.push(paragraph(""));
  }
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;

  return createZip([
    { name: "[Content_Types].xml", data: textBytes(CONTENT_TYPES) },
    { name: "_rels/.rels", data: textBytes(RELS) },
    { name: "word/document.xml", data: textBytes(documentXml) },
  ]);
}
