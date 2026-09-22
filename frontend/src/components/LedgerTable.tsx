import type { ReactNode } from "react";

export interface LedgerColumn<Row> {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
}

interface LedgerTableProps<Row> {
  columns: LedgerColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  isHighlighted?: (row: Row) => boolean;
}

export function LedgerTable<Row>({ columns, rows, rowKey, isHighlighted }: LedgerTableProps<Row>) {
  return (
    <div className="ledger-table-wrap">
      <table className="ledger-table">
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
  );
}
