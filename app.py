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

OUTPUT_DIR = Path(__file__).parent / "outputs"

st.set_page_config(page_title="GDC-1", layout="wide")
st.title("GDC-1 — Gemelo Digital de Ecosistemas de Cuidado")
st.caption(
    "Capa exploratoria del sistema. La evaluación formal (validación cruzada, bateria "
    "estadistica) esta documentada en el articulo, Secciones 2-4."
)

tab_escenarios, tab_individuo, tab_ml = st.tabs(
    ["📊 Escenarios A-F", "🧍 Simulador individual", "🤖 Modelos de ML"]
)

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

with tab_ml:
    st.subheader("Desempeño de los 5 modelos de aprendizaje automático")
    results_path = OUTPUT_DIR / "ml_results.json"
    perf_path = OUTPUT_DIR / "model_performance.csv"

    if perf_path.exists():
        perf_df = pd.read_csv(perf_path, index_col=0)
        st.dataframe(perf_df, use_container_width=True)
        st.bar_chart(perf_df["rmse_mean"])
        st.caption("RMSE promedio (validación cruzada 10-fold) — menor es mejor")
    else:
        st.info("Todavía no hay resultados de ML guardados. Corre main.py al menos una vez.")

    if results_path.exists():
        with open(results_path) as f:
            results = json.load(f)
        st.write(f"**Modelo ganador:** {results['winner']}")
        st.write(
            f"**Prueba de Friedman (5 modelos):** χ² = {results['friedman']['statistic']:.2f}, "
            f"p = {results['friedman']['p_value']:.4g}"
        )
        st.write("**Wilcoxon post-hoc frente al ganador:**")
        st.json(results["wilcoxon_vs_winner"])
        st.write(
            f"**IC bootstrap 95% del RMSE del ganador:** "
            f"[{results['bootstrap_ci_rmse_winner']['lower']:.2f}, "
            f"{results['bootstrap_ci_rmse_winner']['upper']:.2f}] h/semana"
        )

    st.divider()
    st.caption(
        "Reentrenar corre de nuevo la busqueda de hiperparametros y la validacion cruzada "
        "completa de los 5 modelos; puede tardar 1-3 minutos."
    )
    if st.button("🔄 Reentrenar los 5 modelos ahora"):
        dataset_path = OUTPUT_DIR / "dataset_sintetico.csv"
        if dataset_path.exists():
            df = pd.read_csv(dataset_path)
            with st.spinner("Entrenando y validando 5 modelos..."):
                summary = run_pipeline(df, str(OUTPUT_DIR))
            st.success(f"Listo. Modelo ganador: {summary['winner']}")
            st.rerun()
        else:
            st.error("Primero genera el dataset corriendo main.py al menos una vez.")
