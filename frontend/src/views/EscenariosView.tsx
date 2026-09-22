import { useEffect, useState } from "react";
import { BarChart } from "../components/BarChart";
import { ChartBlock } from "../components/ChartBlock";
import { FieldRow, NumberField, SliderField } from "../components/Field";
import { LedgerTable } from "../components/LedgerTable";
import { Section } from "../components/Section";
import { SpinnerLine } from "../components/SpinnerLine";
import * as api from "../lib/api";
import { fmtHours, fmtPercent, fmtUsd } from "../lib/format";
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
                      </span>
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
            title="Brecha de género en horas no remuneradas"
            caption="Mujeres menos hombres, en horas por semana. Menor es mejor."
          >
            <BarChart
              ariaLabel="Brecha de género en horas no remuneradas por escenario"
              series={[{ key: "gap", label: "Brecha", colorVar: "var(--series-unpaid-care)" }]}
              valueFormat={(v) => v.toFixed(1)}
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
            title="Horas no remuneradas por género"
            caption="Promedio semanal de trabajo de cuidado, mujeres frente a hombres, por escenario."
          >
            <BarChart
              ariaLabel="Horas no remuneradas por género y escenario"
              series={[
                { key: "mujeres", label: "Mujeres", colorVar: "var(--series-female)" },
                { key: "hombres", label: "Hombres", colorVar: "var(--series-male)" },
              ]}
              valueFormat={(v) => v.toFixed(1)}
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
            title="Participación laboral femenina"
            caption="Porcentaje de mujeres con más de 5 horas semanales de trabajo remunerado."
          >
            <BarChart
              ariaLabel="Participación laboral femenina por escenario"
              series={[{ key: "participacion", label: "Participación", colorVar: "var(--series-neutral)" }]}
              valueFormat={(v) => `${v.toFixed(0)}%`}
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
            title="Costo fiscal semanal per cápita"
            caption="Gasto público estimado por persona y por semana, en dólares."
          >
            <BarChart
              ariaLabel="Costo fiscal semanal per cápita por escenario"
              series={[{ key: "costo", label: "Costo", colorVar: "var(--series-neutral)" }]}
              valueFormat={(v) => `$${v.toFixed(0)}`}
              data={rows.map((r) => ({
                key: r.escenario,
                label: scenarioCode(r.escenario),
                values: { costo: r.costo_fiscal_semanal_percapita_usd },
              }))}
            />
          </ChartBlock>
        </Section>
      )}
    </>
  );
}
