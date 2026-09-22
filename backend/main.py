"""API FastAPI para GDC-1 — expone el motor de calculo, los escenarios y el
pipeline de ML existentes en ../src a la interfaz React.

No reimplementa ninguna logica de dominio: importa y llama exactamente las
mismas funciones que usa app.py (Streamlit) y main.py, para que ambas
interfaces queden respaldadas por el mismo motor.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Literal, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR / "src"))

from motor_calculo import Individual, SCENARIOS, allocate_time  # noqa: E402
from escenarios import compare_scenarios  # noqa: E402
from pipeline_ml import run_pipeline  # noqa: E402

OUTPUT_DIR = ROOT_DIR / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)
SCENARIOS_CACHE = OUTPUT_DIR / "comparacion_escenarios.csv"
DATASET_PATH = OUTPUT_DIR / "dataset_sintetico.csv"
ML_RESULTS_PATH = OUTPUT_DIR / "ml_results.json"
ML_PERF_PATH = OUTPUT_DIR / "model_performance.csv"

SCENARIO_INFO = {
    "Base": {
        "label": "Base",
        "description": "Sin intervención de política. Statu quo del reparto de tiempo.",
    },
    "A_guarderias_universales": {
        "label": "Guarderías universales",
        "description": "Cuidado infantil público y gratuito: reduce en 45% las horas directas de cuidado de hijas/os.",
    },
    "B_licencia_igualitaria": {
        "label": "Licencia igualitaria",
        "description": "26 semanas de licencia parental, 50% reservadas al otro progenitor; debilita la especialización de género en el hogar.",
    },
    "C_bono_cuidador": {
        "label": "Bono al cuidador",
        "description": "Transferencia de USD 150/mes a quien asume el cuidado, que mejora su poder de negociación intrahogar.",
    },
    "D_reduccion_jornada": {
        "label": "Reducción de jornada",
        "description": "Tope de 35h semanales de trabajo remunerado, con sustitución parcial para personas desempleadas.",
    },
    "E_infraestructura_cuidados": {
        "label": "Infraestructura de cuidados",
        "description": "Servicios de proximidad para personas mayores o con discapacidad: reduce 35% esas horas y suma empleabilidad.",
    },
    "F_intervencion_integral": {
        "label": "Intervención integral",
        "description": "Combina las cinco políticas anteriores (A-E) de forma simultánea.",
    },
}

app = FastAPI(title="GDC-1 API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------
# Escenarios
# --------------------------------------------------------------------------

class ScenarioCompareRequest(BaseModel):
    n: int = Field(2000, ge=100, le=20000)
    seed: int = 123


def _scenarios_df_to_payload(df: pd.DataFrame) -> dict:
    return {
        "columns": list(df.columns),
        "rows": df.to_dict(orient="records"),
    }


@app.get("/api/scenarios/meta")
def scenarios_meta():
    return {
        "order": list(SCENARIOS.keys()),
        "info": SCENARIO_INFO,
    }


@app.get("/api/scenarios/compare")
def get_scenarios_compare():
    if SCENARIOS_CACHE.exists():
        df = pd.read_csv(SCENARIOS_CACHE)
    else:
        df = compare_scenarios(n=1000, seed=123)
        df.to_csv(SCENARIOS_CACHE, index=False)
    return _scenarios_df_to_payload(df)


@app.post("/api/scenarios/compare")
def post_scenarios_compare(req: ScenarioCompareRequest):
    df = compare_scenarios(n=req.n, seed=req.seed)
    df.to_csv(SCENARIOS_CACHE, index=False)
    return _scenarios_df_to_payload(df)


# --------------------------------------------------------------------------
# Simulador individual
# --------------------------------------------------------------------------

class IndividualRequest(BaseModel):
    gender: Literal["female", "male"]
    age: int = Field(32, ge=18, le=65)
    education_level: Literal["primaria", "secundaria", "terciaria"]
    employment_sector: Literal["formal", "informal", "unemployed"]
    income_share_household: float = Field(0.5, ge=0.0, le=1.0)
    num_dependents_children: int = Field(0, ge=0, le=4)
    num_dependents_elderly_disabled: int = Field(0, ge=0, le=2)
    household_structure: Literal["nuclear", "extendido", "monoparental"]
    country_income_context: Literal["low", "medium", "high"]
    scenario: str


@app.post("/api/individual/simulate")
def simulate_individual(req: IndividualRequest):
    if req.scenario not in SCENARIOS:
        raise HTTPException(status_code=400, detail=f"Escenario desconocido: {req.scenario}")

    ind = Individual(
        gender=req.gender,
        age=req.age,
        education_level=req.education_level,
        employment_sector=req.employment_sector,
        income_share_household=req.income_share_household,
        num_dependents_children=req.num_dependents_children,
        num_dependents_elderly_disabled=req.num_dependents_elderly_disabled,
        household_structure=req.household_structure,
        country_income_context=req.country_income_context,
        has_partner=(req.household_structure != "monoparental"),
    )
    rng = np.random.default_rng(0)
    outcome = allocate_time(ind, req.scenario, rng)
    return outcome


# --------------------------------------------------------------------------
# Modelos de ML
# --------------------------------------------------------------------------

@app.get("/api/ml/performance")
def ml_performance():
    performance = None
    results = None

    if ML_PERF_PATH.exists():
        perf_df = pd.read_csv(ML_PERF_PATH, index_col=0)
        performance = {
            "models": list(perf_df.index),
            "rows": perf_df.reset_index(names="model").to_dict(orient="records"),
        }

    if ML_RESULTS_PATH.exists():
        import json

        with open(ML_RESULTS_PATH) as f:
            results = json.load(f)

    return {"performance": performance, "results": results}


@app.post("/api/ml/retrain")
def ml_retrain():
    if not DATASET_PATH.exists():
        raise HTTPException(
            status_code=409,
            detail="No existe el dataset sintetico todavia. Corre main.py al menos una vez.",
        )
    df = pd.read_csv(DATASET_PATH)
    summary = run_pipeline(df, str(OUTPUT_DIR))
    return summary


@app.get("/api/health")
def health():
    return {"status": "ok"}


# --------------------------------------------------------------------------
# Interfaz React compilada (opcional): si existe frontend/dist, se sirve
# desde el mismo proceso para poder correr todo con un solo comando. En
# desarrollo, usa en cambio `npm run dev` en frontend/ (proxy a esta API).
# --------------------------------------------------------------------------

FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"
if FRONTEND_DIST.exists():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
