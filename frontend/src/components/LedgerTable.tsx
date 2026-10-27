import { useRef, type ReactNode } from "react";
import { ExportMenu } from "./ExportMenu";
import { Insight } from "./Insight";
import { useExportable } from "./useExportable";
import { tableFromDom } from "../lib/tableFromDom";

export interface LedgerColumn<Row> {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
}

interface LedgerTableProps<Row> {
  title: string;
  caption?: string;
  interpretation: string;
  explanation: string;
  columns: LedgerColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  isHighlighted?: (row: Row) => boolean;
}

export function LedgerTable<Row>({
  title,
  caption,
  interpretation,
  explanation,
  columns,
  rows,
  rowKey,
  isHighlighted,
}: LedgerTableProps<Row>) {
  const tableRef = useRef<HTMLTableElement | null>(null);
  const build = () => {
    const table = tableRef.current;
    if (!table) return null;
    return { kind: "table" as const, title, caption, interpretation, explanation, ...tableFromDom(table) };
  };
  const ref = useExportable<HTMLDivElement>(build);

  return (
    <div className="chart-block table-block" ref={ref}>
      <div className="chart-block-head">
        <div>
          <div className="chart-block-title">{title}</div>
          {caption && <div className="chart-block-caption">{caption}</div>}
        </div>
        <ExportMenu getItem={build} kind="table" filename={title} />
      </div>
      <div className="ledger-table-wrap">
        <table className="ledger-table" ref={tableRef}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} data-highlight={isHighlighted?.(row) ?? false}>
                {columns.map((col) => (
                  <td key={col.key} className="tabular">
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Insight interpretation={interpretation} explanation={explanation} />
    </div>
  );
}
