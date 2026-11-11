import { tableHeaderMatrix, validTableMerges } from "../../../../src/reports/core/table";

type ObjectValue = Record<string, unknown>;
type Props = { props: ObjectValue; columns: ObjectValue[]; language: "en" | "id"; onChange: (patch: ObjectValue, remove?: string[]) => void };
const object = (value: unknown): ObjectValue => value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};

export default function TableStructureEditor({ props, columns, language, onChange }: Props) {
  const id = language === "id";
  const text = (en: string, indonesian: string) => id ? indonesian : en;
  const matrix = Array.isArray(props.headerRows) ? props.headerRows.map((row) => Array.isArray(row) ? row.map(object) : []) : null;
  const merges = Array.isArray(props.merges) ? props.merges.map(object) : [];
  const setCell = (rowIndex: number, cellIndex: number, patch: ObjectValue) => onChange({ headerRows: matrix?.map((row, r) => r === rowIndex ? row.map((cell, c) => c === cellIndex ? { ...cell, ...patch } : cell) : row) });
  return <section className="rs-table-structure">
    <h3>{text("Advanced table structure", "Struktur tabel lanjutan")}</h3>
    <p className="rs-hint">{text("Header spans must cover every column. Custom header rows replace column groups. Merge coordinates start at 1; merged cells display the first cell's value.", "Span header harus mencakup semua kolom. Header khusus menggantikan grup kolom. Koordinat merge dimulai dari 1; sel gabungan menampilkan nilai sel pertama.")}</p>
    {!matrix ? <button type="button" className="rs-ghost" onClick={() => onChange({ headerRows: [columns.map((column) => ({ label: String(column.label ?? column.key ?? ""), colSpan: 1, rowSpan: 1 }))] })}>{text("Edit header rows", "Edit baris header")}</button> : <>
      {!tableHeaderMatrix(matrix, columns.length) && <p className="rs-hint rs-error" role="status">{text("Header spans must form a complete grid matching the columns before saving.", "Span header harus membentuk grid lengkap sesuai jumlah kolom sebelum disimpan.")}</p>}
      {matrix.map((row, r) => <fieldset className="rs-column-settings" key={r}><legend>{text("Header row", "Baris header")} {r + 1}</legend>
        {row.map((cell, c) => <div className="rs-matrix-cell" key={c}>
          <label className="rs-field"><span>{text("Heading", "Judul")} {c + 1}</span><input aria-label={`${text("Header", "Header")} ${r + 1}.${c + 1}`} value={String(cell.label ?? "")} onChange={(event) => setCell(r, c, { label: event.target.value })} /></label>
          <label className="rs-field"><span>{text("Columns spanned", "Jumlah kolom")}</span><input aria-label={`${text("Column span", "Span kolom")} ${r + 1}.${c + 1}`} type="number" min="1" max={columns.length} value={Number(cell.colSpan ?? 1)} onChange={(event) => setCell(r, c, { colSpan: Math.max(1, Number(event.target.value) || 1) })} /></label>
          <label className="rs-field"><span>{text("Rows spanned", "Jumlah baris")}</span><input aria-label={`${text("Row span", "Span baris")} ${r + 1}.${c + 1}`} type="number" min="1" max="20" value={Number(cell.rowSpan ?? 1)} onChange={(event) => setCell(r, c, { rowSpan: Math.max(1, Number(event.target.value) || 1) })} /></label>
          <button type="button" className="rs-ghost danger" onClick={() => onChange({ headerRows: matrix.map((item, index) => index === r ? item.filter((_, index) => index !== c) : item) })}>{text("Remove header cell", "Hapus sel header")} {r + 1}.{c + 1}</button>
        </div>)}
        <button type="button" className="rs-ghost" onClick={() => onChange({ headerRows: matrix.map((item, index) => index === r ? [...item, { label: "", colSpan: 1, rowSpan: 1 }] : item) })}>{text("Add header cell", "Tambah sel header")}</button>
        <button type="button" className="rs-ghost danger" onClick={() => onChange({ headerRows: matrix.filter((_, index) => index !== r) })}>{text("Remove header row", "Hapus baris header")}</button>
      </fieldset>)}
      <div className="rs-row-actions"><button type="button" className="rs-ghost" disabled={matrix.length >= 20} onClick={() => onChange({ headerRows: [...matrix, columns.map((column) => ({ label: String(column.label ?? ""), colSpan: 1, rowSpan: 1 }))] })}>{text("Add header row", "Tambah baris header")}</button><button type="button" className="rs-ghost" onClick={() => onChange({}, ["headerRows"])}>{text("Use column headings", "Gunakan judul kolom")}</button></div>
    </>}
    <h3>{text("Merged body cells", "Gabung sel isi")}</h3>
    {!validTableMerges(merges, columns.length) && merges.length > 0 && <p className="rs-hint rs-error" role="status">{text("Merge ranges must fit the columns and cannot overlap.", "Rentang merge harus sesuai kolom dan tidak boleh tumpang tindih.")}</p>}
    {merges.map((merge, index) => <fieldset className="rs-column-settings" key={index}><legend>{text("Merge", "Gabungan")} {index + 1}</legend>
      {([ ["row", "Start row", "Baris awal"], ["col", "Start column", "Kolom awal"], ["rowSpan", "Rows spanned", "Jumlah baris"], ["colSpan", "Columns spanned", "Jumlah kolom"] ] as const).map(([key, en, indonesian]) => <label className="rs-field" key={key}><span>{text(en, indonesian)}</span><input aria-label={`${text(en, indonesian)} ${index + 1}`} type="number" min="1" value={Number(merge[key] ?? (key === "row" || key === "col" ? 0 : 1)) + (key === "row" || key === "col" ? 1 : 0)} onChange={(event) => { const value = Math.max(1, Number(event.target.value) || 1) - (key === "row" || key === "col" ? 1 : 0); onChange({ merges: merges.map((item, i) => i === index ? { ...item, [key]: value } : item) }); }} /></label>)}
      <button type="button" className="rs-ghost danger" onClick={() => onChange({ merges: merges.filter((_, i) => i !== index) })}>{text("Remove merge", "Hapus gabungan")} {index + 1}</button>
    </fieldset>)}
    <button type="button" className="rs-ghost" onClick={() => onChange({ merges: [...merges, { row: 0, col: 0, rowSpan: 1, colSpan: 1 }] })}>{text("Add merge", "Tambah gabungan")}</button>
  </section>;
}
