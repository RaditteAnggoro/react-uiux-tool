type Item = Record<string, unknown>;
export default function TableRulesEditor({ props, language, onChange }: { props: Item; language: "en" | "id"; onChange: (patch: Item) => void }) {
  const id = language === "id";
  const text = (en: string, indonesian: string) => id ? indonesian : en;
  const explicit = Array.isArray(props.rowRules);
  const rules: Item[] = explicit ? (props.rowRules as unknown[]).map((v) => v && typeof v === "object" && !Array.isArray(v) ? v as Item : {}) : [props.rowCondition && typeof props.rowCondition === "object" ? props.rowCondition as Item : {}];
  const update = (index: number, patch: Item) => {
    const next = rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule);
    onChange(explicit ? { rowRules: next } : { rowCondition: next[0] });
  };
  return <section className="rs-conditional"><h3>{text("Conditional table rows", "Baris tabel bersyarat")}</h3><p className="rs-hint">{text("Example: row.amount < 0. Later matching colors override earlier ones.", "Contoh: row.amount < 0. Warna aturan terakhir yang cocok akan digunakan.")}</p>
    {rules.map((rule, index) => <fieldset className="rs-column-settings" key={index}><legend>{text("Rule", "Aturan")} {index + 1}</legend>
      <label className="rs-field"><span>{text("Condition expression", "Ekspresi kondisi")}</span><input aria-label={index === 0 ? text("Conditional table rows Condition expression", "Baris tabel bersyarat Ekspresi kondisi") : `${text("Condition expression", "Ekspresi kondisi")} ${index + 1}`} value={String(rule.when ?? "")} onChange={(event) => update(index, { when: event.target.value })} placeholder="row.amount < 0" /></label>
      <label className="rs-field"><span>{text("Conditional text color", "Warna teks bersyarat")}</span><input aria-label={index === 0 ? text("Conditional table rows Conditional text color", "Baris tabel bersyarat Warna teks bersyarat") : `${text("Conditional text color", "Warna teks bersyarat")} ${index + 1}`} type="color" value={/^#[0-9a-f]{6}$/i.test(String(rule.color ?? "")) ? String(rule.color) : "#111827"} onChange={(event) => update(index, { color: event.target.value })} /></label>
      <label className="rs-field"><span>{text("Conditional fill color", "Warna isi bersyarat")}</span><input aria-label={index === 0 ? text("Conditional table rows Conditional fill color", "Baris tabel bersyarat Warna isi bersyarat") : `${text("Conditional fill color", "Warna isi bersyarat")} ${index + 1}`} type="color" value={/^#[0-9a-f]{6}$/i.test(String(rule.background ?? "")) ? String(rule.background) : "#ffffff"} onChange={(event) => update(index, { background: event.target.value })} /></label>
      <label className="rs-check"><input type="checkbox" checked={rule.bold === true} onChange={(event) => update(index, { bold: event.target.checked })} /><span>{text("Bold", "Tebal")}</span></label>
      <label className="rs-check"><input type="checkbox" checked={rule.italic === true} onChange={(event) => update(index, { italic: event.target.checked })} /><span>{text("Italic", "Miring")}</span></label>
      {explicit && <button type="button" className="rs-ghost danger" onClick={() => onChange({ rowRules: rules.filter((_, i) => i !== index) })}>{text("Remove rule", "Hapus aturan")} {index + 1}</button>}
    </fieldset>)}
    <button type="button" className="rs-ghost" onClick={() => onChange({ rowRules: [...rules.filter((rule) => Object.keys(rule).length), { when: "" }] })}>{text("Add row rule", "Tambah aturan baris")}</button>
  </section>;
}
