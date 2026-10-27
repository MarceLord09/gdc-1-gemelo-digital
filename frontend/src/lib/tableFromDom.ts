/** Lee una <table> renderizada y devuelve su contenido como texto plano. */
export function tableFromDom(table: HTMLTableElement) {
  const clean = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
  const headers = [...table.querySelectorAll("thead th")].map((th) => clean(th.textContent));
  const trs = [...table.querySelectorAll("tbody tr")];
  return {
    headers,
    rows: trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => clean(td.textContent))),
    highlight: trs.map((tr) => tr.getAttribute("data-highlight") === "true"),
  };
}
