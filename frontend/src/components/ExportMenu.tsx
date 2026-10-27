import { useState } from "react";
import {
  compose,
  downloadCsv,
  downloadPng,
  downloadSvg,
  slug,
  type ReportItem,
} from "../lib/exporter";

interface ExportMenuProps {
  getItem: () => ReportItem | null;
  kind: "figure" | "table";
  filename: string;
}

export function ExportMenu({ getItem, kind, filename }: ExportMenuProps) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(fn: (item: ReportItem) => void | Promise<void>) {
    const item = getItem();
    if (!item) return;
    setBusy(true);
    setErr(null);
    try {
      await fn(item);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo exportar");
    } finally {
      setBusy(false);
    }
  }

  const base = slug(filename);

  return (
    <div className="export-menu" data-export-ui>
      <span className="export-menu-label">Guardar:</span>
      <button
        className="btn btn-small"
        disabled={busy}
        onClick={() => run((it) => downloadPng(compose(it), base))}
        title="Imagen PNG a 4× de resolución (~384 dpi), solo el gráfico, sin textos"
      >
        PNG alta resolución
      </button>
      {kind === "table" ? (
        <button
          className="btn btn-small"
          disabled={busy}
          onClick={() => run((it) => { if (it.kind === "table") downloadCsv(it, base); })}
          title="Datos de la tabla, se abre en Excel"
        >
          CSV (Excel)
        </button>
      ) : (
        <button
          className="btn btn-small"
          disabled={busy}
          onClick={() => run((it) => downloadSvg(compose(it), base))}
          title="Gráfico vectorial: sin pérdida a cualquier tamaño"
        >
          SVG vectorial
        </button>
      )}
      {err && <span style={{ color: "var(--error)", fontSize: 12 }}>{err}</span>}
    </div>
  );
}
