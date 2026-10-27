import { useEffect, useState } from "react";
import { BarChart } from "../components/BarChart";
import { ChartBlock } from "../components/ChartBlock";
import { LedgerTable } from "../components/LedgerTable";
import { Section } from "../components/Section";
import { EficienciaSection } from "./EficienciaSection";
import { SpinnerLine } from "../components/SpinnerLine";
import { StatGrid, StatTile } from "../components/StatTile";
import * as api from "../lib/api";
import { fmtNum } from "../lib/format";
import type { MlPerformanceResponse, MlResults, ModelPerformanceRow } from "../lib/types";

function pValueLabel(p: number): string {
  if (Number.isNaN(p)) return "—";
  return p < 0.001 ? "< 0.001" : p.toFixed(3);
}

export function MLView() {
  const [data, setData] = useState<MlPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMlPerformance()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function retrain() {
    setRetraining(true);
    setError(null);
    try {
      await api.postMlRetrain();
      const fresh = await api.getMlPerformance();
      setData(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reentrenar");
    } finally {
      setRetraining(false);
    }
  }

  const winner = data?.results?.winner ?? null;
  const mlTexts = mlInterpretation(data, winner);

  return (
    <>
      <Section
        title="Desempeño de los modelos de aprendizaje automático"
        caption="Cinco modelos entrenados para predecir horas de cuidado no remunerado, validados con 10-fold cross-validation."
      >
        {loading && <SpinnerLine>Cargando resultados guardados…</SpinnerLine>}
        {error && <p style={{ color: "var(--error)" }}>{error}</p>}

        {!loading && !data?.performance && (
          <p className="callout">
            Todavía no hay resultados guardados. Corre <code>main.py</code> al menos una vez, o usa
            "Reentrenar los 5 modelos ahora" más abajo.
          </p>
        )}

        {data?.performance && (
          <>
            <LedgerTable<ModelPerformanceRow>
              title="Desempeño de los modelos (validación cruzada 10-fold)"
              interpretation={mlTexts.table}
              explanation="RMSE es el error típico de la predicción, en horas de cuidado por semana (menor es mejor). R² es la proporción de la variación en las horas de cuidado que el modelo explica (1 es perfecto). El valor tras ± es la desviación entre los 10 pliegues: cuanto menor, más estable es el modelo ante distintas muestras. Todos los modelos usan las mismas variables, con las numéricas estandarizadas y las categóricas codificadas, y la fila resaltada es el ganador."
              rowKey={(r) => r.model}
              rows={data.performance.rows}
              isHighlighted={(r) => r.model === winner}
              columns={[
                { key: "model", header: "Modelo", render: (r) => r.model },
                {
                  key: "rmse",
                  header: "RMSE (h/semana)",
                  render: (r) => `${r.rmse_mean.toFixed(2)} ± ${r.rmse_std.toFixed(2)}`,
                },
                {
                  key: "r2",
                  header: "R²",
                  render: (r) => `${r.r2_mean.toFixed(3)} ± ${r.r2_std.toFixed(3)}`,
                },
              ]}
            />

            <ChartBlock
              interpretation={mlTexts.chart}
              explanation="Cada barra es el RMSE promedio de un modelo en los 10 pliegues de validación cruzada, es decir, predicciones sobre datos que el modelo no vio al entrenar. Una diferencia pequeña entre barras puede no ser real: la sección de validación estadística indica cuáles diferencias son significativas."
              title="RMSE promedio por modelo"
              caption="Validación cruzada 10-fold. Menor es mejor; el modelo ganador se resalta."
            >
              <BarChart
                ariaLabel="RMSE promedio por modelo"
                series={[{ key: "rmse", label: "RMSE", colorVar: "var(--series-neutral)" }]}
                yLabel="RMSE (h/semana)"
                valueFormat={(v) => fmtNum(v, 2)}
                data={data.performance.rows.map((r) => ({
                  key: r.model,
                  label: r.model,
                  values: { rmse: r.rmse_mean },
                  emphasizeSeriesKey: r.model === winner ? "rmse" : undefined,
                  note: r.model === winner ? "ganador" : undefined,
                }))}
              />
            </ChartBlock>
          </>
        )}

        <div className="section-foot btn-row" style={{ border: "none", marginTop: 20, paddingTop: 0 }}>
          {retraining ? (
            <SpinnerLine>Entrenando y validando 5 modelos — puede tardar 1-3 minutos…</SpinnerLine>
          ) : (
            <button className="btn" onClick={retrain} disabled={loading}>
              Reentrenar los 5 modelos ahora
            </button>
          )}
        </div>
      </Section>

      {data?.results && (
        <Section
          title="Validación estadística"
          caption="La comparación formal entre modelos, documentada en el artículo, Secciones 2-4."
        >
          <StatGrid
            title="Pruebas estadísticas de la validación"
            interpretation={statsTexts(data.results).interpretation}
            explanation="Friedman compara los cinco modelos a la vez sobre los mismos pliegues y dice si al menos uno difiere de los demás. El intervalo bootstrap 95% acota el error esperado del ganador remuestreando sus predicciones. Shapiro-Wilk contrasta si los residuos son normales y Breusch-Pagan si su varianza es constante (homocedasticidad); ambos validan los supuestos del análisis, no la precisión del modelo. Un p-valor menor a 0.05 se considera evidencia contra la hipótesis nula de cada prueba."
          >
            <StatTile label="Modelo ganador" value={data.results.winner} />
            <StatTile
              label="Prueba de Friedman entre los 5 modelos"
              value={`χ² ${data.results.friedman.statistic.toFixed(2)}`}
              note={`p = ${pValueLabel(data.results.friedman.p_value)}`}
            />
            <StatTile
              label="IC bootstrap 95% del RMSE"
              value={`${data.results.bootstrap_ci_rmse_winner.lower.toFixed(2)}–${data.results.bootstrap_ci_rmse_winner.upper.toFixed(2)}`}
              note="horas/semana, modelo ganador"
            />
            <StatTile
              label="Shapiro-Wilk (residuos)"
              value={`W ${data.results.shapiro_wilk_residuals.statistic.toFixed(3)}`}
              note={`p = ${pValueLabel(data.results.shapiro_wilk_residuals.p_value)}`}
            />
            <StatTile
              label="Breusch-Pagan (residuos)"
              value={`LM ${data.results.breusch_pagan_residuals.statistic.toFixed(2)}`}
              note={`p = ${pValueLabel(data.results.breusch_pagan_residuals.p_value)}`}
            />
          </StatGrid>

          <div style={{ marginTop: 22 }}>
            <LedgerTable
              title="Wilcoxon post-hoc frente al ganador"
              interpretation={wilcoxonInterpretation(data.results)}
              explanation="Prueba de rangos con signo de Wilcoxon sobre los errores por pliegue de cada modelo frente al ganador. La hipótesis nula es que ambos tienen el mismo error; un p-valor menor a 0.05 indica que el ganador es significativamente distinto (mejor) que ese modelo. Con solo 10 pliegues la prueba tiene poca potencia, así que un p-valor alto no prueba que los modelos sean equivalentes."
              rowKey={(r) => r.model}
              rows={Object.entries(data.results.wilcoxon_vs_winner).map(([model, v]) => ({
                model,
                ...v,
              }))}
              columns={[
                { key: "model", header: "Modelo", render: (r) => r.model },
                { key: "stat", header: "Estadístico", render: (r) => r.statistic.toFixed(3) },
                { key: "p", header: "p-valor", render: (r) => pValueLabel(r.p_value) },
              ]}
            />
          </div>
        </Section>
      )}
      {data?.results && <EficienciaSection cv={data.results.cv_fold_rmse} />}
    </>
  );
}

function mlInterpretation(data: MlPerformanceResponse | null, winner: string | null) {
  const rows = data?.performance?.rows ?? [];
  const w = rows.find((r) => r.model === winner) ?? rows.reduce((b, r) => (r.rmse_mean < b.rmse_mean ? r : b), rows[0]);
  const worst = rows.reduce((b, r) => (r.rmse_mean > b.rmse_mean ? r : b), rows[0]);
  if (!w || !worst) return { table: "", chart: "" };
  const table = `${w.model} es el modelo con mejor desempeño: se equivoca en promedio ${w.rmse_mean.toFixed(2)} h/semana y explica ${(w.r2_mean * 100).toFixed(1)}% de la variación del cuidado no remunerado. El más débil, ${worst.model}, se equivoca ${worst.rmse_mean.toFixed(2)} h.`;
  const chart = `${w.model} tiene el menor error (${w.rmse_mean.toFixed(2)} h/semana), ${(worst.rmse_mean - w.rmse_mean).toFixed(2)} h menos que ${worst.model}. Las barras de error ± (${w.rmse_std.toFixed(2)} h en el ganador) muestran cuánto varía ese error entre pliegues.`;
  return { table, chart };
}

function statsTexts(r: MlResults) {
  const f = r.friedman.p_value < 0.05;
  const sw = r.shapiro_wilk_residuals.p_value < 0.05;
  const bp = r.breusch_pagan_residuals.p_value < 0.05;
  return {
    interpretation: `${f ? "Hay diferencias significativas entre los cinco modelos" : "No hay evidencia de diferencias entre los cinco modelos"} (Friedman, p ${pValueLabel(r.friedman.p_value)}). El error esperado de ${r.winner} está entre ${r.bootstrap_ci_rmse_winner.lower.toFixed(2)} y ${r.bootstrap_ci_rmse_winner.upper.toFixed(2)} h/semana con 95% de confianza. Los residuos ${sw ? "no son normales" : "son compatibles con una distribución normal"} (Shapiro-Wilk) y ${bp ? "su varianza no es constante" : "su varianza es aproximadamente constante"} (Breusch-Pagan).`,
  };
}

function wilcoxonInterpretation(r: MlResults) {
  const entries = Object.entries(r.wilcoxon_vs_winner);
  const sig = entries.filter(([, v]) => v.p_value < 0.05).map(([m]) => m);
  const ns = entries.filter(([, v]) => !(v.p_value < 0.05)).map(([m]) => m);
  return `${r.winner} es significativamente distinto de ${sig.length ? sig.join(", ") : "ningún modelo"}${ns.length ? `; frente a ${ns.join(", ")} no hay evidencia suficiente para distinguirlo` : ""}.`;
}
