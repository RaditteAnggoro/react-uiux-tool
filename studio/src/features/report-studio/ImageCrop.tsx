import { useEffect, useRef, useState } from "react";
import type { ReportKey } from "./i18n";
import ReportDialog from "./ReportDialog";

type CropKey = "left" | "top" | "width" | "height";
const fields = [
  ["left", "cropLeft"], ["top", "cropTop"], ["width", "cropWidth"], ["height", "cropHeight"],
] as const;

export default function ImageCrop({ source, tr, onCancel, onApply }: {
  source: string;
  tr: (key: ReportKey) => string;
  onCancel: () => void;
  onApply: (src: string) => void;
}) {
  const [crop, setCrop] = useState<Record<CropKey, string>>({ left: "0", top: "0", width: "100", height: "100" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReportKey | null>(null);
  const [loaded, setLoaded] = useState(false);
  const picture = useRef<HTMLImageElement>(null);
  const sequence = useRef(0);
  useEffect(() => () => { sequence.current++; }, []);
  const left = Number(crop.left), top = Number(crop.top), width = Number(crop.width), height = Number(crop.height);
  const valid = Object.values(crop).every(value => value.trim() && Number.isFinite(Number(value))) &&
    left >= 0 && top >= 0 && width > 0 && height > 0 && left + width <= 100 && top + height <= 100;
  const unchanged = left === 0 && top === 0 && width === 100 && height === 100;

  const apply = async () => {
    const image = picture.current;
    if (!valid || unchanged || !image || !image.naturalWidth || !image.naturalHeight) return;
    const current = ++sequence.current;
    setBusy(true);
    setError(null);
    try {
      const x = Math.min(image.naturalWidth - 1, Math.floor(image.naturalWidth * left / 100));
      const y = Math.min(image.naturalHeight - 1, Math.floor(image.naturalHeight * top / 100));
      const w = Math.max(1, Math.round(image.naturalWidth * (left + width) / 100) - x);
      const h = Math.max(1, Math.round(image.naturalHeight * (top + height) / 100) - y);
      if (w * h > 8_000_000 || w > 8192 || h > 8192) { setError("cropSizeError"); return; }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext("2d");
      if (!context) throw new Error();
      context.drawImage(image, x, y, w, h, 0, 0, w, h);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      if (current !== sequence.current) return;
      if (!blob) throw new Error();
      if (blob.size > 2 * 1024 * 1024) { setError("cropSizeError"); return; }
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      if (current === sequence.current) onApply(src);
    } catch {
      if (current === sequence.current) setError("imageTypeError");
    } finally {
      if (current === sequence.current) setBusy(false);
    }
  };

  return (
    <ReportDialog label={tr("cropImage")} className="rs-crop-dialog" onCancel={onCancel}>
      <h3>{tr("cropImage")}</h3>
      <p className="rs-hint">{tr("cropHint")}</p>
      <div className="rs-crop-scroll">
        <div className="rs-crop-picture">
          <img ref={picture} src={source} alt={tr("cropPreview")} onLoad={() => setLoaded(true)}
            onError={() => setError("imageTypeError")} />
          {loaded && valid && <span aria-hidden="true" style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }} />}
        </div>
      </div>
      <div className="rs-grid2">
        {fields.map(([key, label]) => <label key={key} className="rs-field">
          <span>{tr(label)}</span>
          <input type="number" min="0" max="100" step="any" disabled={busy} value={crop[key]}
            onChange={event => setCrop({ ...crop, [key]: event.target.value })} />
        </label>)}
      </div>
      {!valid && <p role="alert">{tr("cropBounds")}</p>}
      {error && <p role="alert">{tr(error)}</p>}
      <div className="rs-modal-actions">
        <button type="button" className="rs-ghost" onClick={onCancel}>{tr("cancel")}</button>
        <button type="button" className="rs-primary" disabled={busy || !valid || !loaded || unchanged}
          onClick={() => void apply()}>{tr("applyCrop")}</button>
      </div>
    </ReportDialog>
  );
}
