import { useEffect, useState } from "react";
import { BoxPlotChart, quantile, stdev } from "../components/BoxPlotChart";
import { ChartBlock } from "../components/ChartBlock";
import { HeatmapPair, type HeatCell } from "../components/HeatmapPair";
import { ScatterChart, type ScatterPoint } from "../components/ScatterChart";
import { Section } from "../components/Section";
import { SpinnerLine } from "../components/SpinnerLine";
import * as api from "../lib/api";
import { fmtNum } from "../lib/format";
import type { Benchmark, BenchmarkRow } from "../lib/types";

const GROUPS = [
  { key: "RandomForest", label: "Random Forest", colorVar: "var(--series-paid-work)" },
  { key: "XGBoost", label: "XGBoost", colorVar: "var(--series-unpaid-care)" },
  { key: "SVR", label: "SVR", colorVar: "var(--series-female)" },
];

const cfg = (r: BenchmarkRow) =>
  r.model === "SVR"
    ? `SVR (C = ${r.params.C}, ε = ${r.params.epsilon})`
    : `${r.model === "RandomForest" ? "Random Forest" : r.model} (${r.params.n_estimators} árboles, profundidad ${r.params.max_depth})`;

const sizeLabel = (kb: number) => (kb >= 1024 ? `${fmtNum(kb / 1024, 1)} MB` : `${fmtNum(kb, 0)} KB`);

function heatTexts(rows: BenchmarkRow[], name: string) {
  const best = rows.reduce((b, r) => (r.rmse_mean < b.rmse_mean ? r : b));
  const fast = rows.reduce((b, r) => (r.latency_ms < b.latency_ms ? r : b));
  const slow = rows.reduce((b, r) => (r.latency_ms > b.latency_ms ? r : b));
  const worst = rows.reduce((b, r) => (r.rmse_mean > b.rmse_mean ? r : b));
  return {
    interpretation: `La combinación con menor error es ${best.params.n_estimators} árboles y profundidad ${best.params.max_depth} (RMSE = ${fmtNum(best.rmse_mean)} h/semana, ${fmtNum(best.latency_ms, 1)} ms). La más rápida (${fast.params.n_estimators} árboles, profundidad ${fast.params.max_depth}) tarda ${fmtNum(fast.latency_ms, 1)} ms pero su RMSE es ${fmtNum(fast.rmse_mean)}; la más lenta tarda ${fmtNum(slow.latency_ms, 1)} ms. El peor error (${fmtNum(worst.rmse_mean)}) corresponde a ${worst.params.n_estimators} árboles con profundidad ${worst.params.max_depth}.`,
    explanation: `Cada celda es una configuración de ${name} entrenada con las mismas variables. El RMSE es el promedio de una validación cruzada de 10 pliegues estratificados, el mismo protocolo de la tabla de desempeño (por eso las configuraciones elegidas por el ajuste coinciden con ella); la latencia es la mediana de 5 mediciones al predecir ${"1 000"} filas. El borde verde marca el mejor valor de cada panel (el menor) y el color más oscuro, un valor mayor. Aumentar árboles o profundidad suele reducir el error hasta un punto y encarece la predicción; el mapa permite ver dónde deja de valer la pena.`,
  };
}

export function EficienciaSection({ cv }: { cv?: Record<string, number[]> }) {
  const [bench, setBench] = useState<Benchmark | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMlBenchmark()
      .then(setBench)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      setBench(await api.postMlBenchmark());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo calcular el barrido");
    } finally {
      setRunning(false);
    }
  }

  const boxTexts = (() => {
    if (!cv) return null;
    const entries = Object.entries(cv).map(([k, v]) => ({ k, sd: stdev(v), s: [...v].sort((a, b) => a - b) }));
    const stable = entries.reduce((b, e) => (e.sd < b.sd ? e : b));
    const wild = entries.reduce((b, e) => (e.sd > b.sd ? e : b));
    const best = entries.reduce((b, e) => (quantile(e.s, 0.5) < quantile(b.s, 0.5) ? e : b));
    return {
      interpretation: `${stable.k} es el modelo más estable (σ = ${fmtNum(stable.sd)} h entre pliegues) y ${wild.k} el más disperso (σ = ${fmtNum(wild.sd)} h). ${best.k} tiene la menor mediana (${fmtNum(quantile(best.s, 0.5))} h/semana) y sus pliegues van de ${fmtNum(best.s[0])} a ${fmtNum(best.s[best.s.length - 1])}.`,
      explanation:
        "Cada punto es el RMSE de un pliegue de la validación cruzada estratificada de 10 particiones. La caja va del primer al tercer cuartil, la línea gruesa es la mediana y los bigotes llegan al mínimo y al máximo. Una caja angosta significa que el desempeño del modelo cambia poco al variar la muestra de entrenamiento. Como GDC-1 es un modelo de regresión, la estabilidad se mide con el RMSE y no con F1-Score.",
    };
  })();

  const heat = (model: string, name: string) => {
    if (!bench) return null;
    const rows = bench.rows.filter((r) => r.model === model);
    const xs = [...new Set(rows.map((r) => r.params.n_estimators))].sort((a, b) => a - b);
    const ys = [...new Set(rows.map((r) => r.params.max_depth))].sort((a, b) => a - b);
    const cells: HeatCell[] = rows.map((r) => ({
      x: String(r.params.n_estimators),
      y: String(r.params.max_depth),
      a: r.rmse_mean,
      b: r.latency_ms,
    }));
    const t = heatTexts(rows, name);
    return (
      <ChartBlock
        title={`Mapa de hiperparámetros de ${name}: error y latencia`}
        caption="Número de árboles (eje horizontal) y profundidad máxima (eje vertical) frente a RMSE y latencia de predicción."
        interpretation={t.interpretation}
        explanation={t.explanation}
      >
        <HeatmapPair
          ariaLabel={`Mapa de hiperparámetros de ${name}`}
          xLabels={xs.map(String)}
          yLabels={ys.map(String)}
          cells={cells}
          a={{ title: "RMSE (h/semana)", fmt: (v) => fmtNum(v, 2) }}
          b={{ title: "Latencia (ms por 1 000 filas)", fmt: (v) => fmtNum(v, 1) }}
          xTitle="Número de árboles"
          yTitle="Profundidad máxima"
        />
      </ChartBlock>
    );
  };

  const pareto = (() => {
    if (!bench) return null;
    const rows = bench.rows;
    // no dominada: ninguna otra es igual o mejor en latencia, tamaño y RMSE, y mejor en alguna
    const dominated = (a: BenchmarkRow) =>
      rows.some(
        (b) =>
          b !== a &&
          b.latency_ms <= a.latency_ms &&
          b.size_kb <= a.size_kb &&
          b.rmse_mean <= a.rmse_mean &&
          (b.latency_ms < a.latency_ms || b.size_kb < a.size_kb || b.rmse_mean < a.rmse_mean),
      );
    const toPoint = (r: BenchmarkRow): ScatterPoint => ({
      key: cfg(r),
      label: `${cfg(r)}: RMSE ${fmtNum(r.rmse_mean)}, ${fmtNum(r.latency_ms, 1)} ms, ${sizeLabel(r.size_kb)}`,
      x: r.latency_ms,
      y: r.size_kb / 1024,
      group: r.model,
    });
    const points = rows.map(toPoint);
    const frontRows = rows.filter((r) => !dominated(r)).sort((a, b) => a.rmse_mean - b.rmse_mean);
    const front = frontRows.map(toPoint);
    const dimmed = new Set(rows.filter((r) => dominated(r)).map((r) => cfg(r)));
    const labels = Object.fromEntries(frontRows.map((r) => [cfg(r), fmtNum(r.rmse_mean)]));
    const best = frontRows[0];
    const fastest = frontRows.reduce((b, r) => (r.latency_ms < b.latency_ms ? r : b));
    const lightest = frontRows.reduce((b, r) => (r.size_kb < b.size_kb ? r : b));
    const svrOnFront = frontRows.some((r) => r.model === "SVR");
    const rfOnFront = frontRows.filter((r) => r.model === "RandomForest").length;
    return {
      points,
      front,
      dimmed,
      labels,
      interpretation: `${frontRows.length} de ${rows.length} configuraciones están en la frontera de Pareto: ${frontRows.map((r) => `${cfg(r)} (RMSE ${fmtNum(r.rmse_mean)})`).join("; ")}. La de menor error es ${cfg(best)} (${fmtNum(best.latency_ms, 1)} ms, ${sizeLabel(best.size_kb)}); la más rápida, ${cfg(fastest)} (${fmtNum(fastest.latency_ms, 1)} ms); la más liviana, ${cfg(lightest)} (${sizeLabel(lightest.size_kb)}). ${svrOnFront ? `El SVR aparece con ${frontRows.filter((r) => r.model === "SVR").length} configuración(es), a una latencia mucho mayor que las de XGBoost. ` : "Ninguna configuración de SVR está en la frontera: todas son más lentas que alguna alternativa igual o mejor. "}${rfOnFront === 0 ? `Random Forest ${svrOnFront ? "no aparece" : "tampoco aparece"}: sus modelos son mucho más grandes sin mejorar el error.` : `Random Forest aporta ${rfOnFront} configuración(es).`}`,
      explanation: `Cada punto es una configuración del barrido. El eje horizontal es la latencia (mediana de 5 mediciones al predecir 1 000 filas) y el vertical, el tamaño del pipeline serializado, ambos en escala logarítmica. Una configuración está en la frontera de Pareto (punto con borde oscuro y su RMSE al lado) cuando ninguna otra es a la vez igual o mejor en latencia, tamaño y RMSE; las demás se dibujan atenuadas. Es un compromiso, no un ganador único: la elección depende de cuánta latencia o tamaño se acepte a cambio de menor error.`,
    };
  })();

  return (
    <Section
      title="Estabilidad, hiperparámetros y eficiencia de los modelos"
      caption="Dispersión del error en la validación cruzada, mapa de hiperparámetros hacia error y latencia, y compromiso entre latencia y tamaño."
    >
      {cv && boxTexts && (
        <ChartBlock
          title="Dispersión y estabilidad del RMSE en la validación cruzada estratificada"
          caption="Un punto por pliegue (10 pliegues por modelo); σ es la desviación estándar entre pliegues (poblacional, como en la tabla de desempeño)."
          interpretation={boxTexts.interpretation}
          explanation={boxTexts.explanation}
        >
          <BoxPlotChart
            ariaLabel="Dispersión del RMSE por modelo en la validación cruzada"
            yLabel="RMSE (h/semana)"
            valueFormat={(v) => fmtNum(v, 2)}
            groups={Object.entries(cv).map(([k, v]) => ({
              key: k,
              label: k,
              values: v,
              emphasize: k === Object.entries(cv).reduce((b, e) => (quantile([...e[1]].sort((x, y) => x - y), 0.5) < quantile([...b[1]].sort((x, y) => x - y), 0.5) ? e : b))[0],
            }))}
          />
        </ChartBlock>
      )}

      {loading && <SpinnerLine>Cargando barrido de hiperparámetros…</SpinnerLine>}
      {error && <p style={{ color: "var(--error)" }}>{error}</p>}

      {!loading && !bench && (
        <p className="callout">
          Todavía no se ha calculado el barrido de hiperparámetros (entrena 37 configuraciones con el mismo protocolo de validación y mide su latencia y
          tamaño; tarda 3-4 minutos).
        </p>
      )}

      {bench && (
        <>
          {heat("RandomForest", "Random Forest")}
          {heat("XGBoost", "XGBoost")}
          {pareto && (
            <ChartBlock
              title="Compromiso entre latencia y tamaño del modelo: frontera de Pareto"
              caption="Cada punto es una configuración; se resaltan las no dominadas en latencia, tamaño y RMSE a la vez."
              interpretation={pareto.interpretation}
              explanation={pareto.explanation}
            >
              <ScatterChart
                ariaLabel="Latencia contra tamaño de cada configuración con su frontera de Pareto"
                points={pareto.points}
                groups={GROUPS}
                frontier={pareto.front}
                frontierLabels={pareto.labels}
                dimmed={pareto.dimmed}
                xLabel="Latencia (ms por 1 000 predicciones)"
                yLabel="Tamaño del modelo (MB)"
              />
            </ChartBlock>
          )}
        </>
      )}

      <div className="btn-row" style={{ marginTop: 16 }}>
        {running ? (
          <SpinnerLine>Entrenando 37 configuraciones y midiendo latencia…</SpinnerLine>
        ) : (
          <button className="btn" onClick={run} disabled={loading}>
            {bench ? "Recalcular el barrido" : "Calcular el barrido de hiperparámetros"}
          </button>
        )}
      </div>
    </Section>
  );
}
