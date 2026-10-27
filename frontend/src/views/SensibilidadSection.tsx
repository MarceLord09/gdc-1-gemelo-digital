import { useEffect, useState } from "react";
import { BoxPlotChart } from "../components/BoxPlotChart";
import { ChartBlock } from "../components/ChartBlock";
import { LedgerTable } from "../components/LedgerTable";
import { Section } from "../components/Section";
import { SpinnerLine } from "../components/SpinnerLine";
import * as api from "../lib/api";
import { fmtNum } from "../lib/format";
import { scenarioCode } from "../lib/scenario";
import type { Sensitivity, SensitivityBaseParam, SensitivityModifier, SensitivitySeedRow } from "../lib/types";

const pct = (v: number, d = 1) => `${fmtNum(v * 100, d)} %`;
const range = (a: number, b: number, d = 2, f: (v: number) => string = (v) => fmtNum(v, d)) =>
  a === b ? f(a) : `${f(Math.min(a, b))} – ${f(Math.max(a, b))}`;
const sc = (k: string) => (k === "Base" ? "Base" : scenarioCode(k));
const ci = (r: SensitivitySeedRow) => `[${fmtNum(r.delta_ci_low)}; ${fmtNum(r.delta_ci_high)}]`;
const reduces = (r: SensitivitySeedRow) => r.scenario !== "Base" && r.delta_ci_high < 0;

function modifierRow(m: SensitivityModifier) {
  const gaps = m.points.map((p) => p.gap);
  const parts = m.points.map((p) => p.participation);
  return { gaps, parts };
}

export function SensibilidadSection({ label }: { label: (key: string) => string }) {
  const [data, setData] = useState<Sensitivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSensitivity()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      setData(await api.postSensitivity());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo calcular la sensibilidad");
    } finally {
      setRunning(false);
    }
  }

  let content = null;
  if (data) {
    const rows = data.seeds_rows;
    const base = rows.find((r) => r.scenario === "Base")!;
    const red = rows.filter(reduces);
    const nored = rows.filter((r) => r.scenario !== "Base" && !reduces(r));
    const best = rows.reduce((b, r) => (r.gap_mean < b.gap_mean ? r : b));
    const nSeeds = data.seeds.length;

    const boxInterp = `Entre ${nSeeds} poblaciones sintéticas de ${data.n.toLocaleString("es")} personas, la brecha del escenario Base es ${fmtNum(base.gap_mean)} h/semana con una desviación de ${fmtNum(base.gap_sd)} h entre poblaciones; el escenario ${sc(best.scenario)} tiene la menor (${fmtNum(best.gap_mean)} ± ${fmtNum(best.gap_sd)}). El valor absoluto de la brecha depende de la población simulada, por eso las políticas se comparan con la diferencia pareada frente al Base.`;
    const boxExpl = `Cada punto es la brecha (horas de cuidado no remunerado de mujeres menos las de hombres) de una población sintética distinta, generada con las semillas ${data.seeds[0]} a ${data.seeds[nSeeds - 1]}. La caja va del primer al tercer cuartil, la línea gruesa es la mediana y los bigotes llegan al mínimo y al máximo; σ es la desviación estándar entre poblaciones. Las siete políticas se aplican a la misma población en cada semilla.`;

    const tblInterp = `${red.length ? `${red.map((r) => `${sc(r.scenario)} (${fmtNum(r.delta_mean)} h; IC 95 % ${ci(r)})`).join(", ")} reducen la brecha de forma distinguible de cero` : "Ninguna política reduce la brecha de forma distinguible de cero"}${nored.length ? `; ${nored.map((r) => sc(r.scenario)).join(", ")} no, porque su intervalo incluye el 0` : ""}.`;
    const tblExpl = `Δ es la diferencia pareada entre la brecha del escenario y la del Base en la misma población, promediada en ${nSeeds} semillas; el intervalo de confianza del 95 % usa la distribución t de Student con ${nSeeds - 1} grados de libertad. Se resaltan las filas cuyo intervalo queda por completo por debajo de cero. La participación es el promedio de la proporción de mujeres con más de 5 h semanales de trabajo remunerado.`;

    const mods = data.modifiers;
    const strongest = mods
      .map((m) => ({ m, span: Math.max(...modifierRow(m).gaps) - Math.min(...modifierRow(m).gaps) }))
      .sort((a, b) => b.span - a.span)[0];
    const flat = mods.filter((m) => Math.max(...modifierRow(m).gaps) - Math.min(...modifierRow(m).gaps) < 0.02);
    const stepP = mods
      .map((m) => ({ m, span: Math.max(...modifierRow(m).parts) - Math.min(...modifierRow(m).parts) }))
      .sort((a, b) => b.span - a.span)[0];
    const modInterp = `El parámetro que más mueve la brecha es "${strongest.m.label}" del escenario ${sc(strongest.m.scenario)}: entre 0,5× y 1,5× de su valor base la brecha va de ${fmtNum(Math.max(...modifierRow(strongest.m).gaps))} a ${fmtNum(Math.min(...modifierRow(strongest.m).gaps))} h. ${flat.length ? `Los parámetros ${flat.map((m) => `"${m.label}" (${sc(m.scenario)})`).join(", ")} no la alteran, porque actúan sobre las horas remuneradas y no sobre las de cuidado. ` : ""}La participación del escenario ${sc(stepP.m.scenario)} cambia por saltos (${pct(Math.min(...modifierRow(stepP.m).parts))} a ${pct(Math.max(...modifierRow(stepP.m).parts))}), porque depende de que las horas lleguen a superar el umbral de 5 h.`;
    const modExpl = `Se varía un parámetro de política a la vez entre 0,5× y 1,5× de su valor base, con los demás fijos y la misma población (semilla ${data.ref_seed}, n = ${data.n.toLocaleString("es")}), de modo que las diferencias se deben solo al parámetro. Las reducciones proporcionales y la sustitución de desempleo se acotan a 0,99; el bono al cuidador satura en USD 150 porque el motor limita su efecto a 0,15.`;

    const bps = data.base_params;
    const norm = bps.find((b) => b.key === "gender_norm_pull");
    const relRed = (b: SensitivityBaseParam) => b.points.map((p) => (p.gap_base - p.gap_F) / p.gap_base);
    const bpInterp = `La presión de la norma de género es el parámetro base que más mueve la brecha del Base${norm ? ` (de ${fmtNum(norm.points[0].gap_base)} a ${fmtNum(norm.points[2].gap_base)} h con −25 % y +25 %)` : ""}. Aun así, la reducción relativa que logra el escenario F se mantiene entre ${pct(Math.min(...bps.flatMap(relRed)), 0)} y ${pct(Math.max(...bps.flatMap(relRed)), 0)}: la conclusión sobre su efecto es robusta a estos parámetros.`;
    const bpExpl = `Cada parámetro base del motor se multiplica por 0,75 y 1,25 manteniendo los demás y la misma población (semilla ${data.ref_seed}); se reporta la brecha del escenario Base, la del F y la reducción relativa (Base − F) / Base. La presión de la norma de género se escala en sus tres niveles de contexto de ingreso.`;

    const thr = data.leisure_thresholds;
    const pov = data.poverty;
    const povBase = pov.find((p) => p.scenario === "Base")!;
    const povInterp = `Con el umbral original (ocio menor a 14 h) solo ${pct(povBase.rates["14"])} de la población del Base es pobre de tiempo y el indicador no discrimina. Con ocio menor a ${thr[2]} h sube a ${pct(povBase.rates[String(thr[2])])} y las políticas se separan: F la lleva a ${pct(pov.find((p) => p.scenario === "F_intervencion_integral")!.rates[String(thr[2])])} y A a ${pct(pov.find((p) => p.scenario === "A_guarderias_universales")!.rates[String(thr[2])])}.`;
    const povExpl = `La pobreza de tiempo es la proporción de personas cuyo ocio semanal queda por debajo de un umbral. El motor garantiza al menos 14 h de ocio al truncar las horas remuneradas, por lo que el umbral de 14 h casi no se supera; los umbrales mayores muestran cuántas personas quedan con poco tiempo libre. La elección del umbral es un supuesto normativo y se reporta su sensibilidad (población de semilla ${data.ref_seed}).`;

    content = (
      <>
        <ChartBlock
          title="Dispersión de la brecha de género entre poblaciones simuladas"
          caption={`Un punto por población (${nSeeds} semillas); σ es la desviación estándar muestral entre poblaciones.`}
          interpretation={boxInterp}
          explanation={boxExpl}
        >
          <BoxPlotChart
            ariaLabel="Dispersión de la brecha de género por escenario entre poblaciones simuladas"
            yLabel="Brecha (h/semana)"
            valueFormat={(v) => fmtNum(v, 2)}
            sdDdof={1}
            groups={rows.map((r) => ({
              key: r.scenario,
              label: sc(r.scenario),
              values: r.gap_values,
              emphasize: r.scenario === best.scenario,
            }))}
          />
        </ChartBlock>

        <LedgerTable<SensitivitySeedRow>
          title="Diferencia pareada de la brecha frente al Base"
          caption={`Promedio de ${nSeeds} poblaciones de ${data.n.toLocaleString("es")} personas; intervalo de confianza del 95 %.`}
          interpretation={tblInterp}
          explanation={tblExpl}
          rowKey={(r) => r.scenario}
          rows={rows}
          isHighlighted={reduces}
          columns={[
            { key: "e", header: "Escenario", render: (r) => (r.scenario === "Base" ? "Base" : `${sc(r.scenario)}. ${label(r.scenario)}`) },
            { key: "g", header: "Brecha media ± DE (h)", render: (r) => `${fmtNum(r.gap_mean)} ± ${fmtNum(r.gap_sd)}` },
            { key: "d", header: "Δ frente al Base (h)", render: (r) => (r.scenario === "Base" ? "—" : fmtNum(r.delta_mean)) },
            { key: "c", header: "IC 95 % de Δ", render: (r) => (r.scenario === "Base" ? "—" : ci(r)) },
            { key: "p", header: "Participación femenina", render: (r) => pct(r.participation_mean) },
          ]}
        />

        <LedgerTable
          title="Sensibilidad a los parámetros de cada política"
          caption="Cada parámetro se varía entre 0,5× y 1,5× de su valor base, con los demás fijos."
          interpretation={modInterp}
          explanation={modExpl}
          rowKey={(m: SensitivityModifier) => `${m.scenario}-${m.key}`}
          rows={mods}
          columns={[
            { key: "e", header: "Escenario", render: (m) => sc(m.scenario) },
            { key: "k", header: "Parámetro (valor base)", render: (m) => `${m.label} (${fmtNum(m.base_value, m.base_value < 1 ? 2 : 0)})` },
            { key: "g", header: "Brecha (h)", render: (m) => range(...(() => { const g = modifierRow(m).gaps; return [Math.min(...g), Math.max(...g)] as [number, number]; })()) },
            { key: "p", header: "Participación femenina", render: (m) => range(...(() => { const g = modifierRow(m).parts; return [Math.min(...g) * 100, Math.max(...g) * 100] as [number, number]; })(), 1, (v) => `${fmtNum(v, 1)} %`) },
          ]}
        />

        <LedgerTable
          title="Sensibilidad a los parámetros base del motor (±25 %)"
          caption="Brecha del escenario Base y del F, y reducción relativa que logra F, con cada parámetro en 0,75×, 1× y 1,25×."
          interpretation={bpInterp}
          explanation={bpExpl}
          rowKey={(b: SensitivityBaseParam) => b.key}
          rows={bps}
          columns={[
            { key: "k", header: "Parámetro base", render: (b) => b.label },
            { key: "b", header: "Brecha Base (0,75× / 1× / 1,25×)", render: (b) => b.points.map((p) => fmtNum(p.gap_base)).join(" / ") },
            { key: "f", header: "Brecha F (0,75× / 1× / 1,25×)", render: (b) => b.points.map((p) => fmtNum(p.gap_F)).join(" / ") },
            { key: "r", header: "Reducción relativa de F", render: (b) => relRed(b).map((v) => pct(v, 0)).join(" / ") },
          ]}
        />

        <LedgerTable
          title="Pobreza de tiempo según el umbral de ocio"
          caption="Proporción de personas con ocio semanal menor al umbral, por escenario."
          interpretation={povInterp}
          explanation={povExpl}
          rowKey={(p: Sensitivity["poverty"][number]) => p.scenario}
          rows={pov}
          columns={[
            { key: "e", header: "Escenario", render: (p) => (p.scenario === "Base" ? "Base" : `${sc(p.scenario)}. ${label(p.scenario)}`) },
            ...thr.map((t) => ({ key: `t${t}`, header: `Ocio < ${t} h`, render: (p: Sensitivity["poverty"][number]) => pct(p.rates[String(t)]) })),
          ]}
        />
      </>
    );
  }

  return (
    <Section
      title="Sensibilidad e incertidumbre de los escenarios"
      caption="Qué tan robustos son los resultados a la población simulada, a los parámetros de cada política, a los parámetros base del motor y al umbral de pobreza de tiempo."
    >
      {loading && <SpinnerLine>Cargando análisis de sensibilidad…</SpinnerLine>}
      {error && <p style={{ color: "var(--error)" }}>{error}</p>}
      {!loading && !data && (
        <p className="callout">Todavía no se ha calculado el análisis de sensibilidad (20 poblaciones y varias decenas de simulaciones; tarda unos 20 segundos).</p>
      )}
      {content}
      <div className="btn-row" style={{ marginTop: 16 }}>
        {running ? (
          <SpinnerLine>Simulando 20 poblaciones y variando parámetros…</SpinnerLine>
        ) : (
          <button className="btn" onClick={run} disabled={loading}>
            {data ? "Recalcular la sensibilidad" : "Calcular el análisis de sensibilidad"}
          </button>
        )}
      </div>
    </Section>
  );
}
