import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import streamlit as st

sys.path.insert(0, str(Path(__file__).parent / "src"))

from motor_calculo import Individual, SCENARIOS, allocate_time
from escenarios import compare_scenarios
from pipeline_ml import run_pipeline
from generador_datos import FEATURE_COLUMNS_CATEGORICAL, FEATURE_COLUMNS_NUMERIC, TARGET_COLUMN

OUTPUT_DIR = Path(__file__).parent / "outputs"

st.set_page_config(page_title="GDC-1", layout="wide")
st.title("GDC-1 — Gemelo Digital de Ecosistemas de Cuidado")
st.caption(
    "Motor de simulación + pipeline CRISP-DM. Cada pestaña corresponde a una fase de la "
    "metodología descrita en el artículo (Secciones 2-3)."
)


def load_results():
    results_path = OUTPUT_DIR / "ml_results.json"
    if not results_path.exists():
        return None
    with open(results_path) as f:
        return json.load(f)


def load_dataset():
    ds_path = OUTPUT_DIR / "dataset_sintetico.csv"
    if not ds_path.exists():
        return None
    return pd.read_csv(ds_path)


results = load_results()
dataset = load_dataset()

(
    tab_arq,
    tab_eda,
    tab_particion,
    tab_leaderboard,
    tab_cv,
    tab_stats,
    tab_shap,
    tab_individuo,
    tab_escenarios,
) = st.tabs(
    [
        "🏗️ Comprensión y arquitectura",
        "🔍 EDA",
        "✂️ Partición y preparación",
        "🏆 Selección de modelo",
        "📈 Validación cruzada",
        "📊 Pruebas estadísticas",
        "🧠 Interpretabilidad SHAP",
        "🧍 Simulador individual",
        "📋 Escenarios A-F",
    ]
)

# ---------------------------------------------------------------------------
# FASE 0 — Comprensión del problema y arquitectura
# ---------------------------------------------------------------------------
with tab_arq:
    st.subheader("Fase 0 · Comprensión del problema y arquitectura del sistema")
    st.markdown(
        """
GDC-1 simula cómo distintas **políticas de cuidado** redistribuyen el trabajo no
remunerado entre géneros, mediante cuatro componentes que comparten el mismo código
(`src/`) sin importar la interfaz (Streamlit o React):

1. **Motor de cálculo** (`motor_calculo.py`) — reparte las 168 h semanales de cada
   individuo según negociación intrahogar y especialización comparativa.
2. **Generador de datos sintéticos** (`generador_datos.py`) — produce la población
   de entrenamiento (n = 2500) gobernada por las reglas del motor.
3. **Pipeline de aprendizaje automático** (`pipeline_ml.py`) — 5 modelos +
   validación cruzada estratificada + batería estadística + SHAP.
4. **Módulo de escenarios** (`escenarios.py`) — compara el Escenario Base contra
   6 políticas de reforma (A-F).
        """
    )
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Capas de agentes", "4", "Individuo · Hogar · Empresa · Estado")
    col2.metric("Variables predictoras", "10")
    col3.metric("Modelos de ML", "5", "RF · XGB · SVR · Stacking · Blending")
    col4.metric("Escenarios de política", "7", "Base + A-F")

# ---------------------------------------------------------------------------
# FASE 1 — Comprensión de los datos / EDA
# ---------------------------------------------------------------------------
with tab_eda:
    st.subheader("Fase 1 · Comprensión de los datos (EDA)")
    if dataset is None:
        st.warning(
            "No hay dataset generado todavía. Corre `main.py` o pulsa el botón de la "
            "pestaña 'Selección de modelo' para generarlo."
        )
    else:
        st.write(f"**{len(dataset)} observaciones**, {dataset.shape[1]} columnas, sin valores "
                 "perdidos por construcción (datos sintéticos).")
        c1, c2 = st.columns([1, 1])
        with c1:
            st.markdown("**Estadísticos descriptivos — variable objetivo**")
            st.dataframe(
                dataset[TARGET_COLUMN].describe().round(2).rename("unpaid_care_hours_week"),
                use_container_width=True,
            )
            st.markdown("**Matriz de correlación (variables numéricas)**")
            num_cols = FEATURE_COLUMNS_NUMERIC + [TARGET_COLUMN]
            corr = dataset[num_cols].corr().round(2)
            st.dataframe(
                corr.style.background_gradient(cmap="RdBu_r", vmin=-1, vmax=1),
                use_container_width=True,
            )
        with c2:
            st.markdown("**Distribución de la variable objetivo**")
            hist_vals = np.histogram(dataset[TARGET_COLUMN], bins=25)
            hist_df = pd.DataFrame({"horas_no_remuneradas": hist_vals[1][:-1].round(1),
                                     "frecuencia": hist_vals[0]})
            st.bar_chart(hist_df.set_index("horas_no_remuneradas"))
            st.markdown("**Promedio por género**")
            st.bar_chart(dataset.groupby("gender")[TARGET_COLUMN].mean())
            st.markdown("**Promedio por N° de dependientes (niñas/os)**")
            st.bar_chart(dataset.groupby("num_dependents_children")[TARGET_COLUMN].mean())

# ---------------------------------------------------------------------------
# FASE 2 — Preparación de datos / partición
# ---------------------------------------------------------------------------
with tab_particion:
    st.subheader("Fase 2 · Preparación de datos y partición")
    st.markdown(
        """
- **Codificación:** one-hot para las 6 variables categóricas; estandarización
  (media 0, desv. 1) para las 4 numéricas, aplicada solo dentro del pipeline de SVR.
- **Partición:** 80 % entrenamiento / 20 % prueba (semilla 42); dentro del 80 %,
  un 20 % adicional se reserva como validación para el Blending Ensemble.
- **Validación cruzada estratificada:** el *k*-fold de 10 particiones se estratifica
  por **cuartiles de la variable objetivo** (`StratifiedKFold` sobre bins de
  `unpaid_care_hours_week`) para preservar su distribución asimétrica en cada fold.
        """
    )
    if results and "strata_counts" in results:
        strata_df = pd.DataFrame(
            {"cuartil": list(results["strata_counts"].keys()),
             "n_observaciones": list(results["strata_counts"].values())}
        ).set_index("cuartil")
        st.markdown("**Tamaño de cada estrato (cuartil de la variable objetivo)**")
        st.bar_chart(strata_df)
    else:
        st.info("Corre el pipeline (pestaña 'Selección de modelo') para ver los estratos reales.")

# ---------------------------------------------------------------------------
# FASE 3 — Modelado / selección del mejor modelo
# ---------------------------------------------------------------------------
with tab_leaderboard:
    st.subheader("Fase 3 · Modelado y selección del mejor modelo")
    perf_path = OUTPUT_DIR / "model_performance.csv"
    if perf_path.exists() and results:
        perf_df = pd.read_csv(perf_path, index_col=0).sort_values("rmse_mean")
        perf_df = perf_df.rename(columns={
            "rmse_mean": "RMSE medio (h/sem)", "rmse_std": "Desv. RMSE",
            "r2_mean": "R² medio", "r2_std": "Desv. R²",
            "mae_mean": "MAE medio (h/sem)", "mae_std": "Desv. MAE",
        })

        def highlight_winner(row):
            is_winner = row.name == results["winner"]
            return ["background-color: #cde2fb" if is_winner else "" for _ in row]

        st.markdown("**Leaderboard (ordenado por RMSE, validación cruzada estratificada 10-fold)**")
        st.dataframe(
            perf_df.style.apply(highlight_winner, axis=1).format("{:.3f}"),
            use_container_width=True,
        )
        st.success(f"🏆 Modelo ganador: **{results['winner']}**")
    else:
        st.info("Todavía no hay resultados de ML guardados. Corre el pipeline abajo.")

    st.divider()
    st.caption(
        "Reentrenar corre de nuevo la búsqueda de hiperparámetros, la validación cruzada "
        "estratificada de los 5 modelos y el cálculo de SHAP; puede tardar varios minutos."
    )
    if st.button("🔄 Reentrenar los 5 modelos ahora", type="primary"):
        dataset_path = OUTPUT_DIR / "dataset_sintetico.csv"
        if not dataset_path.exists():
            from generador_datos import generate_population
            with st.spinner("Generando población sintética (n=2500)..."):
                df_gen = generate_population(n=2500, seed=42)
                df_gen.to_csv(dataset_path, index=False)
        df = pd.read_csv(dataset_path)
        with st.spinner("Entrenando 5 modelos, validación cruzada, pruebas estadísticas y SHAP..."):
            summary = run_pipeline(df, str(OUTPUT_DIR))
        st.success(f"Listo. Modelo ganador: {summary['winner']}")
        st.rerun()

# ---------------------------------------------------------------------------
# FASE 4 — Evaluación: validación cruzada
# ---------------------------------------------------------------------------
with tab_cv:
    st.subheader("Fase 4 · Validación cruzada estratificada (10-fold)")
    if results and "cv_fold_rmse" in results:
        fold_df = pd.DataFrame(results["cv_fold_rmse"])
        st.markdown("**RMSE por partición (10 folds) y modelo**")
        st.dataframe(fold_df.round(3), use_container_width=True)
        st.markdown("**Distribución del RMSE por modelo (equivalente boxplot: min/mediana/max)**")
        box_summary = fold_df.agg(["min", "median", "max", "std"]).T
        st.dataframe(box_summary.round(3), use_container_width=True)
        st.bar_chart(fold_df)
        st.caption("Cada línea de color es una de las 10 particiones estratificadas por modelo.")
    else:
        st.info("Corre el pipeline en la pestaña 'Selección de modelo' para ver los folds reales.")

# ---------------------------------------------------------------------------
# FASE 5 — Evaluación: pruebas estadísticas
# ---------------------------------------------------------------------------
with tab_stats:
    st.subheader("Fase 5 · Pruebas estadísticas de contraste")
    if results:
        st.write(
            f"**Prueba de Friedman (ómnibus, 5 modelos):** χ² = "
            f"{results['friedman']['statistic']:.2f}, p = {results['friedman']['p_value']:.4g}"
        )
        st.markdown("**Wilcoxon post-hoc frente al ganador**")
        wil_df = pd.DataFrame(results["wilcoxon_vs_winner"]).T.rename(
            columns={"statistic": "Estadístico W", "p_value": "p-valor"})
        st.dataframe(wil_df.round(4), use_container_width=True)

        st.markdown("**Corrección de varianza de Nadeau-Bengio frente al ganador**")
        nb_df = pd.DataFrame(results["nadeau_bengio_vs_winner"]).T.rename(
            columns={"t_statistic": "Estadístico t", "p_value": "p-valor"})
        st.dataframe(nb_df.round(4), use_container_width=True)

        c1, c2, c3 = st.columns(3)
        c1.metric(
            "IC bootstrap 95% RMSE (ganador)",
            f"[{results['bootstrap_ci_rmse_winner']['lower']:.2f}, "
            f"{results['bootstrap_ci_rmse_winner']['upper']:.2f}] h/sem",
        )
        c2.metric(
            "Shapiro-Wilk (residuos)",
            f"p = {results['shapiro_wilk_residuals']['p_value']:.4g}",
            "No normales" if results['shapiro_wilk_residuals']['p_value'] < 0.05 else "Normales",
        )
        c3.metric(
            "Breusch-Pagan (residuos)",
            f"p = {results['breusch_pagan_residuals']['p_value']:.4g}",
            "Heterocedasticidad" if results['breusch_pagan_residuals']['p_value'] < 0.05 else "Homocedasticidad",
        )

        if "y_test_sample" in results:
            st.markdown("**Predicho vs. observado — modelo ganador (muestra de prueba real)**")
            pred_df = pd.DataFrame({
                "observado": results["y_test_sample"],
                "predicho": results["y_pred_sample"],
            })
            st.scatter_chart(pred_df, x="observado", y="predicho")
    else:
        st.info("Corre el pipeline en la pestaña 'Selección de modelo' para ver las pruebas reales.")

# ---------------------------------------------------------------------------
# FASE 6 — Interpretabilidad / explicabilidad (SHAP)
# ---------------------------------------------------------------------------
with tab_shap:
    st.subheader("Fase 6 · Interpretabilidad y explicabilidad (SHAP)")
    if results and "shap_importance" in results:
        shap_df = pd.DataFrame(
            {"variable": list(results["shap_importance"].keys()),
             "importancia_shap_media": list(results["shap_importance"].values())}
        ).set_index("variable")
        st.markdown(
            "**Importancia media |valor SHAP| por variable — modelo ganador** "
            f"({results['winner']})"
        )
        st.bar_chart(shap_df)
        st.dataframe(shap_df.round(3), use_container_width=True)
        top_var = shap_df.index[0]
        st.caption(
            f"La variable con mayor importancia es **{top_var}**. Compárese este orden con "
            "los pesos estructurales del motor de cálculo (Sección 2.3 del artículo) como "
            "validación cruzada entre el componente basado en reglas y el componente de ML."
        )
    else:
        st.info("Corre el pipeline en la pestaña 'Selección de modelo' para calcular SHAP real.")

# ---------------------------------------------------------------------------
# Simulador individual (ya existía)
# ---------------------------------------------------------------------------
with tab_individuo:
    st.subheader("Simulador de asignación de tiempo para un individuo")
    col1, col2, col3 = st.columns(3)
    with col1:
        gender = st.selectbox("Género", ["female", "male"])
        age = st.slider("Edad", 18, 65, 32)
        education = st.selectbox(
            "Nivel educativo", ["primaria", "secundaria", "terciaria"], index=1
        )
    with col2:
        sector = st.selectbox("Sector de empleo", ["formal", "informal", "unemployed"])
        income_share = st.slider("Proporción del ingreso del hogar", 0.0, 1.0, 0.5)
        household = st.selectbox(
            "Estructura del hogar", ["nuclear", "extendido", "monoparental"]
        )
    with col3:
        n_children = st.slider("N° hijas/os dependientes", 0, 4, 1)
        n_elderly = st.slider("N° adultos mayores / personas con discapacidad a cargo", 0, 2, 0)
        context = st.selectbox("Contexto de ingreso del país", ["low", "medium", "high"])

    scenario = st.selectbox("Escenario de política activo", list(SCENARIOS.keys()))

    ind = Individual(
        gender=gender,
        age=age,
        education_level=education,
        employment_sector=sector,
        income_share_household=income_share,
        num_dependents_children=n_children,
        num_dependents_elderly_disabled=n_elderly,
        household_structure=household,
        country_income_context=context,
        has_partner=(household != "monoparental"),
    )
    rng = np.random.default_rng(0)
    outcome = allocate_time(ind, scenario, rng)

    st.write("### Resultado: asignación semanal de tiempo (168 h)")
    result_df = pd.DataFrame(
        {
            "categoria": [
                "Trabajo no remunerado / cuidado",
                "Trabajo remunerado",
                "Ocio",
                "Sueño + cuidado personal (fijo)",
            ],
            "horas_semana": [
                outcome["unpaid_care_hours_week"],
                outcome["paid_work_hours_week"],
                outcome["leisure_hours_week"],
                70.0,
            ],
        }
    )
    cc1, cc2 = st.columns([2, 1])
    with cc1:
        st.bar_chart(result_df.set_index("categoria"))
    with cc2:
        st.dataframe(result_df, hide_index=True, use_container_width=True)
        st.metric(
            "¿Participa en el mercado laboral?",
            "Sí" if outcome["labor_participation"] else "No",
        )
        st.metric("Índice de empleabilidad", f"{outcome['employability_index']:.2f}")

# ---------------------------------------------------------------------------
# Escenarios A-F (ya existía)
# ---------------------------------------------------------------------------
with tab_escenarios:
    st.subheader("Comparación de escenarios de política de cuidado")
    col1, col2 = st.columns([1, 3])
    with col1:
        n = st.slider("Tamaño de población simulada", 500, 5000, 2000, step=500)
        seed = st.number_input("Seed", value=123, step=1)
        run = st.button("🔁 Simular escenarios con estos parámetros", type="primary")

    cache_path = OUTPUT_DIR / "comparacion_escenarios.csv"
    if run:
        with st.spinner("Simulando 7 escenarios sobre la población..."):
            df_scenarios = compare_scenarios(n=n, seed=int(seed))
        df_scenarios.to_csv(cache_path, index=False)
    elif cache_path.exists():
        df_scenarios = pd.read_csv(cache_path)
    else:
        df_scenarios = compare_scenarios(n=1000, seed=123)

    st.dataframe(df_scenarios, use_container_width=True, hide_index=True)

    c1, c2 = st.columns(2)
    with c1:
        st.bar_chart(df_scenarios.set_index("escenario")["brecha_genero_horas_no_remuneradas"])
        st.caption("Brecha de género en horas no remuneradas por escenario (menor es mejor)")
    with c2:
        st.bar_chart(df_scenarios.set_index("escenario")["participacion_laboral_femenina"])
        st.caption("Participación laboral femenina por escenario")

    st.bar_chart(df_scenarios.set_index("escenario")["costo_fiscal_semanal_percapita_usd"])
    st.caption("Costo fiscal semanal per cápita (USD) por escenario")
