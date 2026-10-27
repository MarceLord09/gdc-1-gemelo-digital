/** Exportación de figuras y tablas: PNG de alta resolución, SVG vectorial,
 * CSV y reporte HTML. Todo se arma en el navegador a partir de lo que está en
 * pantalla, así que lo exportado coincide con lo que se ve. */

export interface LegendItem {
  label: string;
  color: string;
}

export interface ChartPayload {
  /** contenido interno del <svg> ya con estilos resueltos (sin var()) */
  markup: string;
  width: number;
  height: number;
  legend: LegendItem[];
}

interface Narrative {
  title: string;
  caption?: string;
  /** qué dicen los datos (lectura de este resultado concreto) */
  interpretation: string;
  /** por qué ocurre / cómo se calculó (explicabilidad) */
  explanation: string;
}

export interface FigureItem extends Narrative {
  kind: "figure";
  chart: ChartPayload;
}

export interface TableItem extends Narrative {
  kind: "table";
  headers: string[];
  rows: string[][];
  highlight: boolean[];
}

export type ReportItem = FigureItem | TableItem;

/* ------------------------------ registro ------------------------------- */

const registry = new Map<HTMLElement, () => ReportItem | null>();

export function registerExportable(el: HTMLElement, build: () => ReportItem | null) {
  registry.set(el, build);
  return () => {
    registry.delete(el);
  };
}

export function collectReportItems(): ReportItem[] {
  return [...registry.entries()]
    .sort(([a], [b]) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    )
    .map(([, build]) => build())
    .filter((x): x is ReportItem => x !== null);
}

/* ------------------------------- tema ---------------------------------- */

const FONT = '"Inter","Segoe UI",system-ui,-apple-system,sans-serif';

interface Theme {
  paper: string;
  ink: string;
  inkSecondary: string;
  inkMuted: string;
  rule: string;
  brand: string;
  sunken: string;
  good: string;
}

function readTheme(): Theme {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  return {
    paper: v("--paper-raised", "#ffffff"),
    ink: v("--ink", "#111827"),
    inkSecondary: v("--ink-secondary", "#4b5563"),
    inkMuted: v("--ink-muted", "#6b7280"),
    rule: v("--rule", "#e5e7eb"),
    brand: v("--brand-primary", "#1e40af"),
    sunken: v("--paper-sunken", "#f1f5f9"),
    good: v("--good", "#0f7a4f"),
  };
}

/* ----------------------------- utilidades ------------------------------ */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let measureCtx: CanvasRenderingContext2D | null = null;
function measure(text: string, font: string): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 7;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

function wrap(text: string, font: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next, font) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function slug(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "gdc1"
  );
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ------------------------ extracción de un SVG ------------------------- */

const INLINE_PROPS = [
  "fill",
  "stroke",
  "stroke-width",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
] as const;

/** Copia un <svg> de la página resolviendo var() y clases CSS a valores
 * literales, para que el archivo exportado se vea igual fuera de la app. */
export function extractSvg(svg: SVGSVGElement, legend: LegendItem[] = []): ChartPayload {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const srcNodes = [svg, ...svg.querySelectorAll("*")];
  const dstNodes = [clone, ...clone.querySelectorAll("*")];
  const drop: Element[] = [];

  srcNodes.forEach((src, i) => {
    const dst = dstNodes[i];
    if (src.hasAttribute("tabindex")) {
      drop.push(dst); // zonas invisibles de hover
      return;
    }
    const cs = getComputedStyle(src);
    for (const p of INLINE_PROPS) dst.setAttribute(p, cs.getPropertyValue(p));
    dst.removeAttribute("class");
    dst.removeAttribute("data-dim");
  });
  drop.forEach((n) => n.remove());

  const { width, height } = svg.getBoundingClientRect();
  const markup = new XMLSerializer()
    .serializeToString(clone)
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>$/, "");
  return { markup, width, height, legend };
}

/* --------------------------- composición SVG --------------------------- */

interface Composed {
  svg: string;
  width: number;
  height: number;
}

const PAD = 40;
const BODY_FONT_SIZE = 13;
const LINE_H = 19;

function textBlocks(
  n: Narrative,
  x: number,
  startY: number,
  contentW: number,
  t: Theme,
): { markup: string; y: number } {
  let y = startY;
  let markup = "";
  const blocks: [string, string][] = [
    ["Interpretación — qué dicen los datos", n.interpretation],
    ["Explicación — por qué ocurre y cómo se calcula", n.explanation],
  ];
  for (const [head, body] of blocks) {
    const lines = wrap(body, `${BODY_FONT_SIZE}px ${FONT}`, contentW - 24);
    const h = 30 + lines.length * LINE_H;
    markup += `<rect x="${x}" y="${y}" width="${contentW}" height="${h}" rx="4" fill="${t.sunken}"/>`;
    markup += `<rect x="${x}" y="${y}" width="3" height="${h}" fill="${t.brand}"/>`;
    markup += `<text x="${x + 14}" y="${y + 20}" font-family='${FONT}' font-size="12" font-weight="700" fill="${t.brand}">${esc(head)}</text>`;
    lines.forEach((l, i) => {
      markup += `<text x="${x + 14}" y="${y + 40 + i * LINE_H}" font-family='${FONT}' font-size="${BODY_FONT_SIZE}" fill="${t.ink}">${esc(l)}</text>`;
    });
    y += h + 10;
  }
  return { markup, y };
}

function header(n: Narrative, width: number, t: Theme): { markup: string; y: number } {
  let y = PAD + 14;
  let markup = `<text x="${PAD}" y="${y}" font-family='${FONT}' font-size="20" font-weight="700" fill="${t.ink}">${esc(n.title)}</text>`;
  y += 10;
  if (n.caption) {
    for (const l of wrap(n.caption, `13px ${FONT}`, width - PAD * 2)) {
      y += 18;
      markup += `<text x="${PAD}" y="${y}" font-family='${FONT}' font-size="13" fill="${t.inkMuted}">${esc(l)}</text>`;
    }
  }
  return { markup, y: y + 20 };
}

function footer(y: number, width: number, t: Theme): { markup: string; y: number } {
  const stamp = new Date().toLocaleString("es");
  return {
    markup:
      `<line x1="${PAD}" y1="${y}" x2="${width - PAD}" y2="${y}" stroke="${t.rule}"/>` +
      `<text x="${PAD}" y="${y + 18}" font-family='${FONT}' font-size="11" fill="${t.inkMuted}">GDC-1 · Gemelo Digital de Ecosistemas de Cuidado · ${esc(stamp)}</text>`,
    y: y + 18 + PAD,
  };
}

function wrapSvg(inner: string, width: number, height: number, t: Theme): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="${t.paper}"/>${inner}</svg>`
  );
}

export function composeFigure(item: FigureItem): Composed {
  const t = readTheme();
  const width = 1000;
  const contentW = width - PAD * 2;
  const h = header(item, width, t);
  let inner = h.markup;
  let y = h.y;

  const { chart } = item;
  const dispW = Math.min(contentW, chart.width * 1.8);
  const k = dispW / chart.width;
  const dispH = chart.height * k;

  if (chart.legend.length > 1) {
    let lx = PAD;
    for (const l of chart.legend) {
      const w = 18 + measure(l.label, `13px ${FONT}`) + 24;
      if (lx > PAD && lx + w > width - PAD) {
        lx = PAD;
        y += 20;
      }
      inner += `<rect x="${lx}" y="${y - 10}" width="12" height="12" rx="2" fill="${l.color}"/>`;
      inner += `<text x="${lx + 18}" y="${y}" font-family='${FONT}' font-size="13" fill="${t.inkSecondary}">${esc(l.label)}</text>`;
      lx += w;
    }
    y += 22;
  }

  inner += `<svg x="${PAD}" y="${y}" width="${dispW}" height="${dispH}" viewBox="0 0 ${chart.width} ${chart.height}" overflow="visible">${chart.markup}</svg>`;
  y += dispH + 24;

  const txt = textBlocks(item, PAD, y, contentW, t);
  inner += txt.markup;
  const f = footer(txt.y + 8, width, t);
  inner += f.markup;
  return { svg: wrapSvg(inner, width, f.y, t), width, height: f.y };
}

export function composeTable(item: TableItem): Composed {
  const t = readTheme();
  const cellFont = `13px ${FONT}`;
  const headFont = `600 12px ${FONT}`;
  const colW = item.headers.map((h, c) =>
    Math.ceil(
      Math.max(
        measure(h, headFont),
        ...item.rows.map((r) => measure(r[c] ?? "", cellFont)),
      ) + 28,
    ),
  );
  const tableW = colW.reduce((a, b) => a + b, 0);
  const width = Math.max(1000, tableW + PAD * 2);
  const contentW = width - PAD * 2;

  const h = header(item, width, t);
  let inner = h.markup;
  let y = h.y;

  const ROW_H = 30;
  const xs: number[] = [];
  colW.reduce((acc, w, i) => ((xs[i] = acc), acc + w), PAD);
  const cell = (text: string, c: number, cy: number, font: string, fill: string, weight: string) => {
    const left = c === 0;
    const tx = left ? xs[c] + 12 : xs[c] + colW[c] - 12;
    return `<text x="${tx}" y="${cy}" text-anchor="${left ? "start" : "end"}" font-family='${FONT}' font-size="${font}" font-weight="${weight}" fill="${fill}">${esc(text)}</text>`;
  };

  item.headers.forEach((hd, c) => {
    inner += cell(hd, c, y + 20, "12", t.inkMuted, "600");
  });
  y += ROW_H;
  inner += `<line x1="${PAD}" y1="${y - 6}" x2="${PAD + tableW}" y2="${y - 6}" stroke="${t.inkMuted}"/>`;
  item.rows.forEach((r, ri) => {
    const hl = item.highlight[ri];
    if (hl) inner += `<rect x="${PAD}" y="${y - 6}" width="${tableW}" height="${ROW_H}" fill="${t.sunken}"/>`;
    r.forEach((v, c) => {
      inner += cell(v, c, y + 14, "13", hl ? t.good : t.ink, hl ? "700" : "400");
    });
    y += ROW_H;
    inner += `<line x1="${PAD}" y1="${y - 6}" x2="${PAD + tableW}" y2="${y - 6}" stroke="${t.rule}"/>`;
  });
  y += 24;

  const txt = textBlocks(item, PAD, y, contentW, t);
  inner += txt.markup;
  const f = footer(txt.y + 8, width, t);
  inner += f.markup;
  return { svg: wrapSvg(inner, width, f.y, t), width, height: f.y };
}

/* ------------------------------ descargas ------------------------------ */

const MAX_PIXELS = 16000; // límite seguro de canvas en navegadores

/** Rasteriza el SVG a PNG. Escala 4× => ~384 dpi para un ancho de 1000 px. */
export async function downloadPng(c: Composed, filename: string, scale = 4) {
  const s = Math.min(scale, MAX_PIXELS / Math.max(c.width, c.height));
  const url = URL.createObjectURL(new Blob([c.svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("No se pudo rasterizar la figura"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(c.width * s);
    canvas.height = Math.round(c.height * s);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) throw new Error("No se pudo generar el PNG");
    download(blob, `${filename}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadSvg(c: Composed, filename: string) {
  download(new Blob([c.svg], { type: "image/svg+xml;charset=utf-8" }), `${filename}.svg`);
}

function csvCell(v: string): string {
  return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function downloadCsv(item: TableItem, filename: string) {
  const lines = [item.headers, ...item.rows].map((r) => r.map(csvCell).join(","));
  // BOM para que Excel respete los acentos
  download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
}

/** Solo el gráfico (con su leyenda) o solo la tabla, sin título ni textos
 * explicativos: la interpretación y la explicación son para la pantalla y el
 * reporte, no para la imagen que se inserta en un documento. */
export function composeBare(item: ReportItem): Composed {
  const t = readTheme();
  const M = 24;
  if (item.kind === "table") {
    return composeTableBare(item, t, M);
  }
  const { chart } = item;
  const k = Math.min(1.8, 1000 / chart.width);
  const w = chart.width * k;
  let y = M;
  let inner = "";
  if (chart.legend.length > 1) {
    let lx = M;
    const maxX = w + M * 2 - M;
    for (const l of chart.legend) {
      const lw = 18 + measure(l.label, `13px ${FONT}`) + 24;
      if (lx > M && lx + lw > maxX) {
        lx = M;
        y += 20;
      }
      inner += `<rect x="${lx}" y="${y + 4}" width="12" height="12" rx="2" fill="${l.color}"/>`;
      inner += `<text x="${lx + 18}" y="${y + 14}" font-family='${FONT}' font-size="13" fill="${t.inkSecondary}">${esc(l.label)}</text>`;
      lx += lw;
    }
    y += 30;
  }
  inner += `<svg x="${M}" y="${y}" width="${w}" height="${chart.height * k}" viewBox="0 0 ${chart.width} ${chart.height}" overflow="visible">${chart.markup}</svg>`;
  const width = Math.round(w + M * 2);
  const height = Math.round(y + chart.height * k + M);
  return { svg: wrapSvg(inner, width, height, t), width, height };
}

function composeTableBare(item: TableItem, t: Theme, M: number): Composed {
  const cellFont = `13px ${FONT}`;
  const headFont = `600 12px ${FONT}`;
  const colW = item.headers.map((h, c) =>
    Math.ceil(Math.max(measure(h, headFont), ...item.rows.map((r) => measure(r[c] ?? "", cellFont))) + 28),
  );
  const tableW = colW.reduce((a, b) => a + b, 0);
  const xs: number[] = [];
  colW.reduce((acc, w, i) => ((xs[i] = acc), acc + w), M);
  const ROW_H = 30;
  let y = M;
  let inner = "";
  const cell = (text: string, c: number, cy: number, size: string, fill: string, weight: string) => {
    const left = c === 0;
    const tx = left ? xs[c] + 12 : xs[c] + colW[c] - 12;
    return `<text x="${tx}" y="${cy}" text-anchor="${left ? "start" : "end"}" font-family='${FONT}' font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(text)}</text>`;
  };
  item.headers.forEach((hd, c) => (inner += cell(hd, c, y + 20, "12", t.inkMuted, "600")));
  y += ROW_H;
  inner += `<line x1="${M}" y1="${y - 6}" x2="${M + tableW}" y2="${y - 6}" stroke="${t.inkMuted}"/>`;
  item.rows.forEach((r, ri) => {
    const hl = item.highlight[ri];
    if (hl) inner += `<rect x="${M}" y="${y - 6}" width="${tableW}" height="${ROW_H}" fill="${t.sunken}"/>`;
    r.forEach((v, c) => (inner += cell(v, c, y + 14, "13", hl ? t.good : t.ink, hl ? "700" : "400")));
    y += ROW_H;
    inner += `<line x1="${M}" y1="${y - 6}" x2="${M + tableW}" y2="${y - 6}" stroke="${t.rule}"/>`;
  });
  const width = tableW + M * 2;
  const height = y + M - 6;
  return { svg: wrapSvg(inner, width, height, t), width, height };
}

/** Imagen exportable por el botón de cada figura o tabla. */
export const compose = composeBare;

/* ------------------------------- reporte ------------------------------- */

export function downloadReport(items: ReportItem[], title: string, filename: string) {
  const t = readTheme();
  const body = items
    .map((it, i) => {
      const num = `${it.kind === "figure" ? "Figura" : "Tabla"} ${i + 1}`;
      let content = "";
      if (it.kind === "figure") {
        const { chart } = it;
        const legend =
          chart.legend.length > 1
            ? `<div class="legend">${chart.legend
                .map((l) => `<span><i style="background:${l.color}"></i>${esc(l.label)}</span>`)
                .join("")}</div>`
            : "";
        content = `${legend}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${chart.width} ${chart.height}" style="width:100%;max-width:${Math.round(chart.width * 1.6)}px;height:auto;overflow:visible">${chart.markup}</svg>`;
      } else {
        content = `<div class="scroll"><table><thead><tr>${it.headers
          .map((h) => `<th>${esc(h)}</th>`)
          .join("")}</tr></thead><tbody>${it.rows
          .map(
            (r, ri) =>
              `<tr${it.highlight[ri] ? ' class="hl"' : ""}>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`,
          )
          .join("")}</tbody></table></div>`;
      }
      return `<figure>
<figcaption><b>${num}.</b> ${esc(it.title)}${it.caption ? `<small>${esc(it.caption)}</small>` : ""}</figcaption>
${content}
<div class="note"><h4>Interpretación — qué dicen los datos</h4><p>${esc(it.interpretation)}</p></div>
<div class="note"><h4>Explicación — por qué ocurre y cómo se calcula</h4><p>${esc(it.explanation)}</p></div>
</figure>`;
    })
    .join("\n");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
body{font-family:${FONT};background:${t.paper};color:${t.ink};max-width:980px;margin:0 auto;padding:32px 24px;line-height:1.5}
h1{font-size:26px;margin:0 0 4px}.sub{color:${t.inkMuted};font-size:13px;margin-bottom:28px}
figure{margin:0 0 36px;padding-top:24px;border-top:1px solid ${t.rule};break-inside:avoid}
figcaption{font-size:16px;margin-bottom:12px}figcaption small{display:block;color:${t.inkMuted};font-size:13px;margin-top:2px}
.legend{display:flex;gap:18px;font-size:13px;color:${t.inkSecondary};margin-bottom:8px}.legend i{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:6px}
.scroll{overflow-x:auto}table{border-collapse:collapse;font-size:14px;width:100%}
th{color:${t.inkMuted};font-size:12px;font-weight:600;text-align:right;padding:0 10px 8px;border-bottom:1px solid ${t.inkMuted};white-space:nowrap}
td{padding:8px 10px;border-bottom:1px solid ${t.rule};text-align:right;white-space:nowrap}
th:first-child,td:first-child{text-align:left}tr.hl td{color:${t.good};font-weight:700;background:${t.sunken}}
.note{background:${t.sunken};border-left:3px solid ${t.brand};border-radius:4px;padding:10px 14px;margin-top:12px}
.note h4{margin:0 0 4px;font-size:12px;color:${t.brand}}.note p{margin:0;font-size:14px}
button{margin-bottom:16px;padding:8px 14px;border:1px solid ${t.rule};border-radius:4px;background:${t.paper};color:${t.ink};cursor:pointer}
@media print{button{display:none}body{padding:0}}
</style></head><body>
<button onclick="window.print()">Imprimir / guardar como PDF</button>
<h1>${esc(title)}</h1>
<div class="sub">GDC-1 · Gemelo Digital de Ecosistemas de Cuidado · generado ${esc(new Date().toLocaleString("es"))}</div>
${body}
</body></html>`;
  download(new Blob([html], { type: "text/html;charset=utf-8" }), `${filename}.html`);
}
