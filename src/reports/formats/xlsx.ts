import type { ReportDocumentV1 } from "../core/types.js";
import { collectTables } from "./csv.js";
import { createZip, escapeXml, textBytes } from "./zip.js";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

function columnName(index: number): string {
  let name = "";
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function cell(value: string, rowIndex: number, columnIndex: number): string {
  const reference = `${columnName(columnIndex)}${rowIndex}`;
  // Always text: numeric-looking identifiers such as "001234" must keep leading zeros.
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

export function exportXlsx(
  document: ReportDocumentV1,
  data: Record<string, unknown> = {},
): Uint8Array {
  const tables = collectTables(document, data);
  const table = tables[0];
  const rows: string[] = [];
  let rowIndex = 1;
  if (table) {
    rows.push(
      `<row r="${rowIndex}">${table.headers.map((header, index) => cell(header, rowIndex, index)).join("")}</row>`,
    );
    for (const row of table.rows) {
      rowIndex += 1;
      rows.push(
        `<row r="${rowIndex}">${row.map((value, index) => cell(value, rowIndex, index)).join("")}</row>`,
      );
    }
  } else {
    rows.push(`<row r="1">${cell(document.title, 1, 0)}</row>`);
  }
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${rows.join("")}</sheetData>
</worksheet>`;

  return createZip([
    { name: "[Content_Types].xml", data: textBytes(CONTENT_TYPES) },
    { name: "_rels/.rels", data: textBytes(RELS) },
    { name: "xl/workbook.xml", data: textBytes(WORKBOOK) },
    { name: "xl/_rels/workbook.xml.rels", data: textBytes(WORKBOOK_RELS) },
    { name: "xl/worksheets/sheet1.xml", data: textBytes(sheet) },
  ]);
}
