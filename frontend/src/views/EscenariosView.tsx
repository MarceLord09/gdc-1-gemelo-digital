import { useEffect, useState } from "react";
import { BarChart } from "../components/BarChart";
import { ChartBlock } from "../components/ChartBlock";
import { FieldRow, NumberField, SliderField } from "../components/Field";
import { LedgerTable } from "../components/LedgerTable";
import { Section } from "../components/Section";
import { SpinnerLine } from "../components/SpinnerLine";
import { SensibilidadSection } from "./SensibilidadSection";
import * as api from "../lib/api";
import { fmtHours, fmtNum, fmtPercent, fmtUsd } from "../lib/format";
import { scenarioCode } from "../lib/scenario";
import type { ScenarioRow, ScenariosMeta } from "../lib/types";

export function EscenariosView() {
  const [meta, setMeta] = useState<ScenariosMeta | null>(null);
  const [rows, setRows] = useState<ScenarioRow[] | null>(null);
  const [n, setN] = useState(2000);
  const [seed, setSeed] = useState(123);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getScenariosMeta(), api.getScenariosCompare()])
      .then(([metaRes, compareRes]) => {
        setMeta(metaRes);
        setRows(compareRes.rows);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function runSimulation() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.postScenariosCompare(n, seed);
      setRows(res.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo simular");
    } finally {
      setLoading(false);
    }
  }

  const label = (key: string) => meta?.info[key as keyof typeof meta.info]?.label ?? key;

  const bestGapKey = rows
    ? rows.reduce((best, r) =>
        r.brecha_genero_horas_no_remuneradas < best.brecha_genero_horas_no_remuneradas ? r : best,
      ).escenario
    : null;
  const bestParticipationKey = rows
    ? rows.reduce((best, r) =>
        r.participacion_laboral_femenina > best.participacion_laboral_femenina ? r : best,
      ).escenario
    : null;

  const texts = rows ? scenarioTexts(rows, label, n, seed) : null;

  return (
    <>
      <Section
        title="Comparación de escenarios de política de cuidado"
        caption="Siete políticas (Base y A–F) aplicadas a la misma población simulada, para ver qué mueven y qué cuestan."
      >
        <FieldRow>
          <SliderField
            label="Tamaño de población simulada"
            value={n}
            min={500}
            max={5000}
            step={500}
            onChange={setN}
          />
          <NumberField label="Semilla aleatoria" value={seed} step={1} onChange={setSeed} />
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn btn-primary" onClick={runSimulation} disabled={loading}>
              Simular escenarios
            </button>
          </div>
        </FieldRow>

        {loading && (
          <div style={{ marginTop: 16 }}>
            <SpinnerLine>Simulando {n.toLocaleString("es")} personas en 7 escenarios…</SpinnerLine>
          </div>
        )}
        {error && <p style={{ color: "var(--error)", marginTop: 12 }}>{error}</p>}

        {rows && !loading && (
          <div style={{ marginTop: 18 }}>
            <LedgerTable
              title="Tabla comparativa de escenarios"
              caption={`${n.toLocaleString("es")} personas simuladas, semilla ${seed}. Fila resaltada: menor brecha de género.`}
              interpretation={texts!.table.interpretation}
              explanation={texts!.table.explanation}
              rowKey={(r) => r.escenario}
              rows={rows}
              isHighlighted={(r) => r.escenario === bestGapKey}
              columns={[
                {
                  key: "escenario",
                  header: "Escenario",
                  render: (r) => (
                    <span>
                      <span className="badge" style={{ marginRight: 8 }}>
                        {scenarioCode(r.escenario)}
                      </span>{" "}
                      {r.escenario === "Base" ? "" : label(r.escenario)}
                    </span>
                  ),
                },
                {
                  key: "participacion",
                  header: "Particip. laboral femenina",
                  render: (r) => fmtPercent(r.participacion_laboral_femenina),
                },
                {
                  key: "brecha",
                  header: "Brecha de género (h)",
                  render: (r) => fmtHours(r.brecha_genero_horas_no_remuneradas),
                },
                {
                  key: "pobreza",
                  header: "Pobreza de tiempo",
                  render: (r) => fmtPercent(r.tasa_pobreza_tiempo),
                },
                {
                  key: "costo",
                  header: "Costo fiscal/semana",
                  render: (r) => fmtUsd(r.costo_fiscal_semanal_percapita_usd),
                },
              ]}
            />
          </div>
        )}
      </Section>

      {rows && !loading && (
        <Section
          title="Qué cambia entre escenarios"
          caption="La barra resaltada en cada gráfico marca el mejor resultado en esa medida — no necesariamente el más barato."
        >
          <ChartBlock
            interpretation={texts!.gap.interpretation}
            explanation={texts!.gap.explanation}
            title="Brecha de género en horas no remuneradas"
            caption="Mujeres menos hombres, en horas por semana. Menor es mejor."
          >
            <BarChart
              ariaLabel="Brecha de género en horas no remuneradas por escenario"
              series={[{ key: "gap", label: "Brecha", colorVar: "var(--series-unpaid-care)" }]}
              yLabel="Brecha (h/semana)"
              valueFormat={(v) => fmtNum(v, 2)}
              data={rows.map((r) => ({
                key: r.escenario,
                label: scenarioCode(r.escenario),
                values: { gap: r.brecha_genero_horas_no_remuneradas },
                emphasizeSeriesKey: r.escenario === bestGapKey ? "gap" : undefined,
                note: r.escenario === bestGapKey ? "menor brecha" : undefined,
              }))}
            />
          </ChartBlock>

          <ChartBlock
            interpretation={texts!.gender.interpretation}
            explanation={texts!.gender.explanation}
            title="Horas no remuneradas por género"
            caption="Promedio semanal de trabajo de cuidado, mujeres frente a hombres, por escenario."
          >
            <BarChart
              ariaLabel="Horas no remuneradas por género y escenario"
              series={[
                { key: "mujeres", label: "Mujeres", colorVar: "var(--series-female)" },
                { key: "hombres", label: "Hombres", colorVar: "var(--series-male)" },
              ]}
              yLabel="Horas/semana"
              valueFormat={(v) => fmtNum(v, 1)}
              data={rows.map((r) => ({
                key: r.escenario,
                label: scenarioCode(r.escenario),
                values: {
                  mujeres: r.horas_no_remuneradas_mujeres,
                  hombres: r.horas_no_remuneradas_hombres,
                },
              }))}
            />
          </ChartBlock>

          <ChartBlock
            interpretation={texts!.part.interpretation}
            explanation={texts!.part.explanation}
            title="Participación laboral femenina"
            caption="Porcentaje de mujeres con más de 5 horas semanales de trabajo remunerado."
          >
            <BarChart
              ariaLabel="Participación laboral femenina por escenario"
              series={[{ key: "participacion", label: "Participación", colorVar: "var(--series-neutral)" }]}
              yLabel="Participación (%)"
              valueFormat={(v) => `${fmtNum(v, 1)} %`}
              data={rows.map((r) => ({
                key: r.escenario,
                label: scenarioCode(r.escenario),
                values: { participacion: r.participacion_laboral_femenina * 100 },
                emphasizeSeriesKey: r.escenario === bestParticipationKey ? "participacion" : undefined,
                note: r.escenario === bestParticipationKey ? "mayor participación" : undefined,
              }))}
            />
          </ChartBlock>

          <ChartBlock
            interpretation={texts!.cost.interpretation}
            explanation={texts!.cost.explanation}
            title="Costo fiscal semanal per cápita"
            caption="Gasto público estimado por persona y por semana, en dólares."
          >
            <BarChart
              ariaLabel="Costo fiscal semanal per cápita por escenario"
              series={[{ key: "costo", label: "Costo", colorVar: "var(--series-neutral)" }]}
              yLabel="Costo (USD/semana)"
              valueFormat={(v) => fmtNum(v, 0)}
              data={rows.map((r) => ({
                key: r.escenario,
                label: scenarioCode(r.escenario),
                values: { costo: r.costo_fiscal_semanal_percapita_usd },
              }))}
            />
          </ChartBlock>
        </Section>
      )}
      <SensibilidadSection label={label} />
    </>
  );
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const code = (k: string) => (k === "Base" ? "Base" : `escenario ${scenarioCode(k)}`);

function scenarioTexts(
  rows: ScenarioRow[],
  label: (k: string) => string,
  n: number,
  seed: number,
) {
  const base = rows.find((r) => r.escenario === "Base") ?? rows[0];
  const by = (f: (r: ScenarioRow) => number, dir: 1 | -1) =>
    rows.reduce((b, r) => (dir * f(r) < dir * f(b) ? r : b));
  const minGap = by((r) => r.brecha_genero_horas_no_remuneradas, 1);
  const maxPart = by((r) => r.participacion_laboral_femenina, -1);
  const minPov = by((r) => r.tasa_pobreza_tiempo, 1);
  const maxCost = by((r) => r.costo_fiscal_semanal_percapita_usd, -1);
  const cheapest = rows
    .filter((r) => r.escenario !== "Base")
    .reduce((b, r) => (r.costo_fiscal_semanal_percapita_usd < b.costo_fiscal_semanal_percapita_usd ? r : b));
  const gapCut = base.brecha_genero_horas_no_remuneradas - minGap.brecha_genero_horas_no_remuneradas;
  const gapCutPct = base.brecha_genero_horas_no_remuneradas > 0 ? (gapCut / base.brecha_genero_horas_no_remuneradas) * 100 : 0;
  const sameData = `Todos los escenarios se aplican a las mismas ${n.toLocaleString("es")} personas simuladas (semilla ${seed}), por lo que las diferencias entre filas se deben a la política y no a la muestra.`;

  return {
    table: {
      interpretation: `En la línea base las mujeres dedican ${base.brecha_genero_horas_no_remuneradas.toFixed(1)} h/semana más que los hombres al cuidado no remunerado y ${pct(base.participacion_laboral_femenina)} de ellas participa en el mercado laboral. La menor brecha la logra el ${code(minGap.escenario)} (${label(minGap.escenario)}, ${minGap.brecha_genero_horas_no_remuneradas.toFixed(1)} h); la mayor participación, el ${code(maxPart.escenario)} (${pct(maxPart.participacion_laboral_femenina)}); la menor pobreza de tiempo, el ${code(minPov.escenario)} (${pct(minPov.tasa_pobreza_tiempo)}); y el mayor costo, el ${code(maxCost.escenario)} ($${maxCost.costo_fiscal_semanal_percapita_usd.toFixed(0)} por persona y semana).`,
      explanation: `${sameData} Cada escenario cambia parámetros del motor de asignación de tiempo (p. ej. fracción de horas de cuidado infantil que cubre el Estado, semanas de licencia compartida, tope de jornada, bono al cuidador) y se reparten de nuevo las 168 h semanales de cada persona. La pobreza de tiempo es la proporción de personas cuyo cuidado más trabajo remunerado supera 84 de las 98 h discrecionales, es decir, que quedan con menos de 14 h de ocio. El costo fiscal es un parámetro fijo por política, no un resultado de la simulación.`,
    },
    gap: {
      interpretation: `La brecha parte de ${base.brecha_genero_horas_no_remuneradas.toFixed(1)} h/semana en la línea base. El ${code(minGap.escenario)} la deja en ${minGap.brecha_genero_horas_no_remuneradas.toFixed(1)} h, una reducción de ${gapCut.toFixed(1)} h (${gapCutPct.toFixed(0)}%). Un valor positivo significa que las mujeres cuidan más que los hombres.`,
      explanation: `Brecha = promedio semanal de horas de cuidado no remunerado de las mujeres menos el de los hombres. Cada política actúa por una vía distinta: unas reducen la carga total de cuidado (guarderías, infraestructura de cuidados) y otras redistribuyen el cuidado entre géneros (licencia igualitaria); la brecha refleja el efecto neto de esas vías. ${sameData}`,
    },
    gender: {
      interpretation: `En la línea base las mujeres dedican ${base.horas_no_remuneradas_mujeres.toFixed(1)} h/semana y los hombres ${base.horas_no_remuneradas_hombres.toFixed(1)} h, es decir ${(base.horas_no_remuneradas_mujeres / Math.max(base.horas_no_remuneradas_hombres, 0.01)).toFixed(1)} veces más. Bajo el ${code(minGap.escenario)} pasan a ${minGap.horas_no_remuneradas_mujeres.toFixed(1)} h y ${minGap.horas_no_remuneradas_hombres.toFixed(1)} h.`,
      explanation: `Este gráfico descompone la brecha del gráfico anterior: muestra si un escenario la reduce porque las mujeres cuidan menos, porque los hombres cuidan más, o por ambas cosas. Cada barra es el promedio simulado de la asignación de tiempo individual, que depende del género, la estructura del hogar, el número de dependientes y la empleabilidad, más un ruido aleatorio.`,
    },
    part: {
      interpretation: `La participación laboral femenina pasa de ${pct(base.participacion_laboral_femenina)} en la línea base a ${pct(maxPart.participacion_laboral_femenina)} en el ${code(maxPart.escenario)} (${label(maxPart.escenario)}), una diferencia de ${((maxPart.participacion_laboral_femenina - base.participacion_laboral_femenina) * 100).toFixed(1)} puntos porcentuales.`,
      explanation: `Se considera que una mujer participa si dedica más de 5 h semanales a trabajo remunerado. Esas horas dependen de cuánto tiempo le queda tras el cuidado, de su empleabilidad (educación y sector) y de los topes de jornada del escenario. Por eso la participación cambia cuando una política altera alguno de esos factores.`,
    },
    cost: {
      interpretation: `El costo va de $${base.costo_fiscal_semanal_percapita_usd.toFixed(0)} (línea base) a $${maxCost.costo_fiscal_semanal_percapita_usd.toFixed(0)} por persona y semana en el ${code(maxCost.escenario)}. La política más barata distinta de la base es el ${code(cheapest.escenario)} ($${cheapest.costo_fiscal_semanal_percapita_usd.toFixed(0)}). Conviene leerlo junto con los gráficos anteriores: el escenario de menor brecha no es el de menor costo.`,
      explanation: `Es el gasto público estimado por persona y por semana, fijado como supuesto para cada política (no se calcula a partir de la población simulada). Sirve para comparar cuánto cuesta obtener cada mejora en brecha, participación o pobreza de tiempo.`,
    },
  };
}
