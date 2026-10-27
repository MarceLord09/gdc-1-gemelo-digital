import { collectReportItems, downloadReport, slug } from "../lib/exporter";

interface ReportButtonProps {
  title: string;
}

/** Reúne todas las figuras y tablas visibles en un reporte HTML (imprimible a PDF). */
export function ReportButton({ title }: ReportButtonProps) {
  return (
    <button
      className="btn btn-small"
      onClick={() => downloadReport(collectReportItems(), title, slug(title))}
      title="Todas las figuras y tablas de esta pantalla, con su interpretación y explicación"
    >
      Descargar reporte completo
    </button>
  );
}
