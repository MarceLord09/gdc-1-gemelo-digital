import { useEffect, useRef } from "react";
import { registerExportable, type ReportItem } from "../lib/exporter";

/** Registra un bloque (figura o tabla) para que el botón de reporte lo
 * recoja. `build` se lee en el momento de exportar, así siempre refleja el
 * estado actual en pantalla. */
export function useExportable<T extends HTMLElement>(build: () => ReportItem | null) {
  const ref = useRef<T | null>(null);
  const buildRef = useRef(build);
  buildRef.current = build;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return registerExportable(el, () => buildRef.current());
  }, []);

  return ref;
}
