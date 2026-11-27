import type { ReportDocumentV1 } from "../core/types.js";
import { collectTables } from "./csv.js";
import { createZip, escapeXml, textBytes } from "./zip.js";

function contentTypes(sheetCount: number): string {
  const overrides = Array.from({ length: sheetCount }, (_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${overrides}
</Types>`;
}

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

function workbook(sheetCount: number): string {
  const sheets = Array.from({ length: sheetCount }, (_, index) => {
    const id = index + 1;
    const name = id === 1 ? "Report" : `Report ${id}`;
    return `<sheet name="${name}" sheetId="${id}" r:id="rId${id}"/>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets}</sheets>
</workbook>`;
}

function workbookRelationships(sheetCount: number): string {
  const relationships = Array.from({ length: sheetCount }, (_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${relationships}
</Relationships>`;
}

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
  const sheetRows = tables.length ? tables.map(table => [table.headers, ...table.rows]) : [[[document.title]]];
  const sheets = sheetRows.map((rows, sheetIndex) => {
    const content = rows.map((row, index) => {
      const rowIndex = index + 1;
      return `<row r="${rowIndex}">${row.map((value, column) => cell(value, rowIndex, column)).join("")}</row>`;
    }).join("");
    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${content}</sheetData>
</worksheet>`;
    return { name: `xl/worksheets/sheet${sheetIndex + 1}.xml`, data: textBytes(sheet) };
  });

  return createZip([
    { name: "[Content_Types].xml", data: textBytes(contentTypes(sheets.length)) },
    { name: "_rels/.rels", data: textBytes(RELS) },
    { name: "xl/workbook.xml", data: textBytes(workbook(sheets.length)) },
    { name: "xl/_rels/workbook.xml.rels", data: textBytes(workbookRelationships(sheets.length)) },
    ...sheets,
  ]);
}
