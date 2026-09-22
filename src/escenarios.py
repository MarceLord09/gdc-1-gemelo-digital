"""Modulo de comparacion de escenarios de politica de cuidado (Base + A-F)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from generador_datos import _sample_individual
from motor_calculo import SCENARIOS, allocate_time

FISCAL_COST_PER_CAPITA_WEEKLY = {
    "Base": 0.0,
    "A_guarderias_universales": 42.0,
    "B_licencia_igualitaria": 28.0,
    "C_bono_cuidador": 35.0,
    "D_reduccion_jornada": 15.0,
    "E_infraestructura_cuidados": 30.0,
    "F_intervencion_integral": 42.0 + 28.0 + 35.0 + 15.0 + 30.0,
}


def compare_scenarios(n: int = 2000, seed: int = 123) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    population = [_sample_individual(rng) for _ in range(n)]

    rows = []
    for i, scenario in enumerate(SCENARIOS):
        rng_scenario = np.random.default_rng([seed, i])  # semilla fija por escenario (hash() de str cambia en cada ejecucion)
        unpaid_hours = []
        paid_hours = []
        participation = []
        gender_gap_samples = {"female": [], "male": []}

        for ind in population:
            outcome = allocate_time(ind, scenario, rng_scenario)
            unpaid_hours.append(outcome["unpaid_care_hours_week"])
            paid_hours.append(outcome["paid_work_hours_week"])
            participation.append(outcome["labor_participation"])
            gender_gap_samples[ind.gender].append(outcome["unpaid_care_hours_week"])

        female_mask = [ind.gender == "female" for ind in population]
        female_participation = np.mean([p for p, f in zip(participation, female_mask) if f])
        female_unpaid_mean = np.mean(gender_gap_samples["female"])
        male_unpaid_mean = np.mean(gender_gap_samples["male"])
        gender_gap = female_unpaid_mean - male_unpaid_mean

        discretionary_hours = 98.0
        min_leisure = 14.0
        time_poor = np.mean(
            [
                1.0
                if (u + p) > (discretionary_hours - min_leisure)
                else 0.0
                for u, p in zip(unpaid_hours, paid_hours)
            ]
        )

        rows.append(
            {
                "escenario": scenario,
                "participacion_laboral_femenina": round(float(female_participation), 3),
                "brecha_genero_horas_no_remuneradas": round(float(gender_gap), 2),
                "horas_no_remuneradas_mujeres": round(float(female_unpaid_mean), 2),
                "horas_no_remuneradas_hombres": round(float(male_unpaid_mean), 2),
                "tasa_pobreza_tiempo": round(float(time_poor), 3),
                "costo_fiscal_semanal_percapita_usd": FISCAL_COST_PER_CAPITA_WEEKLY[scenario],
            }
        )

    return pd.DataFrame(rows)
