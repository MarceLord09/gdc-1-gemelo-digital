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
