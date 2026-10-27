"""Analisis de sensibilidad e incertidumbre de los escenarios de GDC-1.

1) Incertidumbre muestral: los siete escenarios sobre 20 poblaciones
   sinteticas (semillas 1-20, n = 2000).
2) Sensibilidad a los modificadores de cada politica (0,5x a 1,5x) con
   numeros aleatorios comunes (misma semilla 123).
3) Sensibilidad a parametros base del motor (+-25 %).
4) Pobreza de tiempo con distintos umbrales de ocio.
"""
from __future__ import annotations

import copy
import json

import numpy as np

import motor_calculo as mc
from generador_datos import _sample_individual

N = 2000
SEEDS = list(range(1, 21))
REF_SEED = 123
FACTORS = [0.5, 0.75, 1.0, 1.25, 1.5]
LEISURE_THRESHOLDS = [14, 21, 28, 35]

SCENARIO_KEYS = list(mc.SCENARIOS.keys())

MODIFIER_LABELS = {
    "child_care_hours_reduction": "Reducción de horas de cuidado infantil",
    "leave_share_other_parent": "Parte de la licencia del otro progenitor",
    "specialization_strength_mult": "Multiplicador de especialización",
    "leave_weeks": "Semanas de licencia",
    "caregiver_income_boost": "Bono al cuidador (USD/mes)",
    "paid_hours_cap": "Tope de horas remuneradas",
    "unemployment_substitution": "Sustitución de desempleo",
    "elderly_disabled_hours_reduction": "Reducción de horas (mayores/discapacidad)",
    "proximity_bonus_employability": "Bono de empleabilidad por proximidad",
}

BASE_LABELS = {
    "specialization_strength": "Fuerza de especialización",
    "hours_per_child": "Horas por hija/o dependiente",
    "noise_std_fraction": "Ruido gaussiano",
    "gender_norm_pull": "Presión de norma de género",
}


def _run(seed: int, scenarios: list[str], thresholds: bool = False) -> dict:
    rng = np.random.default_rng(seed)
    population = [mc_sample(rng) for _ in range(N)]
    female = np.array([i.gender == "female" for i in population])
    out = {}
    for idx, sc in enumerate(SCENARIO_KEYS):
        if sc not in scenarios:
            continue
        rng_s = np.random.default_rng([seed, idx])
        res = [mc.allocate_time(ind, sc, rng_s) for ind in population]
        unpaid = np.array([r["unpaid_care_hours_week"] for r in res])
        part = np.array([r["labor_participation"] for r in res])
        leis = np.array([r["leisure_hours_week"] for r in res])
        d = {
            "gap": float(unpaid[female].mean() - unpaid[~female].mean()),
            "participation": float(part[female].mean()),
        }
        if thresholds:
            d["poverty"] = {str(t): float((leis < t).mean()) for t in LEISURE_THRESHOLDS}
        out[sc] = d
    return out


def mc_sample(rng):
    return _sample_individual(rng)


def run_sensitivity(output_path: str) -> dict:
    # 1) incertidumbre muestral
    per_seed = [_run(s, SCENARIO_KEYS) for s in SEEDS]
    seeds_rows = []
    base_gaps = np.array([r["Base"]["gap"] for r in per_seed])
    for sc in SCENARIO_KEYS:
        gaps = np.array([r[sc]["gap"] for r in per_seed])
        delta = gaps - base_gaps  # diferencia pareada con el Base en la misma poblacion
        half = 2.093 * delta.std(ddof=1) / np.sqrt(len(delta))  # t(19), IC 95 %
        parts = np.array([r[sc]["participation"] for r in per_seed])
        seeds_rows.append({
            "scenario": sc,
            "gap_values": gaps.tolist(),
            "gap_mean": float(gaps.mean()),
            "gap_sd": float(gaps.std(ddof=1)),
            "delta_mean": float(delta.mean()),
            "delta_sd": float(delta.std(ddof=1)),
            "delta_ci_low": float(delta.mean() - half),
            "delta_ci_high": float(delta.mean() + half),
            "participation_mean": float(parts.mean()),
            "participation_sd": float(parts.std(ddof=1)),
        })

    # 2) modificadores de politica
    original = copy.deepcopy(mc.SCENARIOS)
    modifiers = []
    try:
        for sc, mods in original.items():
            if sc in ("Base", "F_intervencion_integral"):
                continue
            for key, base_value in mods.items():
                points = []
                for f in FACTORS:
                    v = base_value * f
                    if key in ("child_care_hours_reduction", "elderly_disabled_hours_reduction",
                               "leave_share_other_parent", "unemployment_substitution"):
                        v = min(v, 0.99)
                    mc.SCENARIOS[sc] = {**original[sc], key: v}
                    r = _run(REF_SEED, [sc])[sc]
                    points.append({"factor": f, "value": v, "gap": r["gap"], "participation": r["participation"]})
                mc.SCENARIOS[sc] = copy.deepcopy(original[sc])
                modifiers.append({
                    "scenario": sc, "key": key, "label": MODIFIER_LABELS[key],
                    "base_value": base_value, "points": points,
                })
    finally:
        mc.SCENARIOS.clear()
        mc.SCENARIOS.update(original)

    # 3) parametros base (+-25 %) -> brecha del Base y reduccion lograda por F
    base_original = copy.deepcopy(mc.BASE_PARAMS)
    base_params = []
    try:
        for key in BASE_LABELS:
            points = []
            for f in (0.75, 1.0, 1.25):
                if key == "gender_norm_pull":
                    mc.BASE_PARAMS[key] = {k: v * f for k, v in base_original[key].items()}
                else:
                    mc.BASE_PARAMS[key] = base_original[key] * f
                r = _run(REF_SEED, ["Base", "F_intervencion_integral"])
                points.append({
                    "factor": f,
                    "gap_base": r["Base"]["gap"],
                    "gap_F": r["F_intervencion_integral"]["gap"],
                    "participation_base": r["Base"]["participation"],
                    "participation_F": r["F_intervencion_integral"]["participation"],
                })
            mc.BASE_PARAMS[key] = copy.deepcopy(base_original[key])
            base_params.append({"key": key, "label": BASE_LABELS[key], "points": points})
    finally:
        mc.BASE_PARAMS.clear()
        mc.BASE_PARAMS.update(base_original)

    # 4) pobreza de tiempo con distintos umbrales de ocio
    ref = _run(REF_SEED, SCENARIO_KEYS, thresholds=True)
    poverty = [{"scenario": sc, "rates": ref[sc]["poverty"]} for sc in SCENARIO_KEYS]

    out = {
        "n": N, "seeds": SEEDS, "ref_seed": REF_SEED, "factors": FACTORS,
        "leisure_thresholds": LEISURE_THRESHOLDS,
        "seeds_rows": seeds_rows, "modifiers": modifiers,
        "base_params": base_params, "poverty": poverty,
    }
    with open(output_path, "w") as f:
        json.dump(out, f, indent=2)
    return out
