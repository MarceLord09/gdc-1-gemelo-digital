export function fmtHours(v: number): string {
  return `${v.toFixed(1)} h`;
}

export function fmtHoursShort(v: number): string {
  return v.toFixed(1);
}

export function fmtPercent(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function fmtPercentShort(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

export function fmtUsd(v: number): string {
  return `$${v.toFixed(0)}`;
}

/** Número con coma decimal (convención del artículo). */
export function fmtNum(v: number, decimals = 2): string {
  return v.toLocaleString("es", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
