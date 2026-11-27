import readXlsxFile from "read-excel-file/browser";
import type { ImportSheet } from "./TabularImport";

const MAX_ROWS = 5000;
const MAX_COLUMNS = 100;
const MAX_UNCOMPRESSED = 24 * 1024 * 1024;

function checkArchive(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  let end = view.byteLength - 22;
  const earliest = Math.max(0, end - 65535);
  for (; end >= earliest; end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === view.byteLength) break;
  }
  if (end < earliest) throw new Error("Invalid XLSX archive.");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  let total = 0;
  if (count > 256 || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) {
    throw new Error("XLSX archive exceeds the part limit or spans multiple files.");
  }
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new Error("Invalid XLSX directory.");
    total += view.getUint32(offset + 24, true);
    if (total > MAX_UNCOMPRESSED) throw new Error("XLSX exceeds the expanded size limit.");
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  if (offset > end) throw new Error("Invalid XLSX directory.");
}

export async function readWorkbook(file: File): Promise<ImportSheet[]> {
  const buffer = await file.arrayBuffer();
  checkArchive(buffer);
  const workbook = await readXlsxFile(buffer, { parseNumber: value => value });
  if (workbook.length > 20) throw new Error("XLSX has more than 20 worksheets.");
  const sheets: ImportSheet[] = [];
  for (const { sheet, data } of workbook) {
    if (!data.length) continue;
    const [head, ...rows] = data;
    if (rows.length > MAX_ROWS || head!.length > MAX_COLUMNS) throw new Error(`Worksheet "${sheet}" exceeds the row or column limit.`);
    const headers = head!.map(cell => String(cell ?? "").trim());
    if (headers.every(header => !header)) continue;
    if (rows.some(row => row.slice(headers.length).some(cell => cell !== null))) {
      throw new Error(`Worksheet "${sheet}" has data outside its header columns.`);
    }
    sheets.push({ name: sheet, headers, rows: rows.map(row => headers.map((_, index) => {
      const cell = row[index];
      return cell instanceof Date ? cell.toISOString() : cell ?? null;
    })) });
  }
  if (!sheets.length) throw new Error("XLSX has no worksheet with a header row.");
  return sheets;
}
