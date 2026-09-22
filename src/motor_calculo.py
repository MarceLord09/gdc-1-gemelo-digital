"""Motor de calculo del gemelo digital GDC-1.

Reparte el tiempo semanal de un individuo entre trabajo remunerado,
trabajo no remunerado/cuidado y ocio, siguiendo un problema de
negociacion intrahogar (McElroy & Horney, via Doss 2013) mas un
principio de especializacion comparativa. Los parametros son
calibraciones de orden de magnitud tomadas de la literatura citada en
el articulo (OIT, OCDE, IZA, NBER) -- no de microdatos reales, ver
limitaciones en la Seccion 4 del articulo.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

HOURS_PER_WEEK = 168.0
SLEEP_HOURS = 56.0
PERSONAL_CARE_HOURS = 14.0
DISCRETIONARY_HOURS = HOURS_PER_WEEK - SLEEP_HOURS - PERSONAL_CARE_HOURS  # 98h
MIN_LEISURE_HOURS = 14.0

BASE_PARAMS = {
    "base_household_care_hours": 8.0,
    "hours_per_child": 12.0,
    "hours_per_elderly_disabled": 15.0,
    "bargaining_weight_income": 0.6,
    "bargaining_weight_employability": 0.25,
    "specialization_strength": 0.35,
    "gender_norm_pull": {"low": 0.16, "medium": 0.09, "high": 0.02},
    "sector_max_paid_hours": {"formal": 45.0, "informal": 50.0, "unemployed": 0.0},
    "noise_std_fraction": 0.08,
}

SCENARIOS = {
    "Base": {},
    "A_guarderias_universales": {"child_care_hours_reduction": 0.45},
    "B_licencia_igualitaria": {
        "leave_weeks": 26.0,
        "leave_share_other_parent": 0.5,
        "specialization_strength_mult": 0.55,
    },
    "C_bono_cuidador": {"caregiver_income_boost": 150.0},
    "D_reduccion_jornada": {"paid_hours_cap": 35.0, "unemployment_substitution": 0.7},
    "E_infraestructura_cuidados": {
        "elderly_disabled_hours_reduction": 0.35,
        "proximity_bonus_employability": 0.08,
    },
    "F_intervencion_integral": {
        "child_care_hours_reduction": 0.45,
        "leave_weeks": 26.0,
        "leave_share_other_parent": 0.5,
        "specialization_strength_mult": 0.55,
        "caregiver_income_boost": 150.0,
        "paid_hours_cap": 35.0,
        "unemployment_substitution": 0.7,
        "elderly_disabled_hours_reduction": 0.35,
        "proximity_bonus_employability": 0.08,
    },
}


@dataclass
class Individual:
    gender: str
    age: int
    education_level: str
    employment_sector: str
    income_share_household: float
    num_dependents_children: int
    num_dependents_elderly_disabled: int
    household_structure: str
    country_income_context: str
    has_partner: bool


def _employability_index(edu: str, sector: str) -> float:
    edu_score = {"primaria": 0.3, "secundaria": 0.6, "terciaria": 1.0}[edu]
    sector_score = {"formal": 1.0, "informal": 0.6, "unemployed": 0.2}[sector]
    return 0.5 * edu_score + 0.5 * sector_score


def _bargaining_power(ind: Individual, employability: float, params: dict) -> float:
    return (
        params["bargaining_weight_income"] * ind.income_share_household
        + params["bargaining_weight_employability"] * employability
    )


def _household_care_need(ind: Individual, mods: dict, params: dict) -> float:
    need = params["base_household_care_hours"]
    child_hours = ind.num_dependents_children * params["hours_per_child"]
    if "child_care_hours_reduction" in mods:
        child_hours *= 1.0 - mods["child_care_hours_reduction"]
    need += child_hours

    elder_hours = ind.num_dependents_elderly_disabled * params["hours_per_elderly_disabled"]
    if "elderly_disabled_hours_reduction" in mods:
        elder_hours *= 1.0 - mods["elderly_disabled_hours_reduction"]
    need += elder_hours
    return need


def _individual_care_share(ind: Individual, employability: float, mods: dict, params: dict) -> float:
    if not ind.has_partner or ind.household_structure == "monoparental":
        return 1.0

    bp_self = _bargaining_power(ind, employability, params)
    if "caregiver_income_boost" in mods:
        bp_self += min(0.15, mods["caregiver_income_boost"] / 1000.0)

    partner_employability = employability  # simplificacion: pareja con empleabilidad promedio simetrica
    bp_partner = _bargaining_power(
        Individual(**{**ind.__dict__, "income_share_household": 1.0 - ind.income_share_household}),
        partner_employability,
        params,
    )

    strength = params["specialization_strength"] * mods.get("specialization_strength_mult", 1.0)
    share = 0.5 - strength * (bp_self - bp_partner)

    pull = params["gender_norm_pull"][ind.country_income_context]
    share += pull if ind.gender == "female" else -pull

    return min(0.95, max(0.05, share))


def _paid_hours_capacity(ind: Individual, employability: float, unpaid_hours: float, mods: dict, params: dict) -> float:
    sector_max = params["sector_max_paid_hours"][ind.employment_sector]
    if ind.employment_sector == "unemployed" and "unemployment_substitution" in mods:
        sector_max = mods.get("paid_hours_cap", 35.0) * mods["unemployment_substitution"] * 0.5
    elif "paid_hours_cap" in mods:
        sector_max = min(sector_max, mods["paid_hours_cap"])

    time_capacity = max(0.0, DISCRETIONARY_HOURS - unpaid_hours - MIN_LEISURE_HOURS)
    desired = sector_max * employability
    hours = min(desired, time_capacity)

    leave_weeks = mods.get("leave_weeks")
    if leave_weeks and ind.num_dependents_children > 0 and ind.has_partner:
        split = mods.get("leave_share_other_parent", 0.5)
        own_leave_weeks = leave_weeks * (split if ind.gender == "male" else 1.0 - split)
        prob_on_leave = min(1.0, own_leave_weeks / 52.0)
        hours *= 1.0 - prob_on_leave

    return max(0.0, hours)


def allocate_time(ind: Individual, scenario: str, rng) -> dict:
    params = BASE_PARAMS
    mods = SCENARIOS[scenario]

    employability = _employability_index(ind.education_level, ind.employment_sector)
    if "proximity_bonus_employability" in mods:
        employability = min(1.0, employability + mods["proximity_bonus_employability"])

    care_need = _household_care_need(ind, mods, params)
    share = _individual_care_share(ind, employability, mods, params)
    unpaid_hours = care_need * share

    if ind.household_structure == "monoparental":
        unpaid_hours *= 0.85 if "child_care_hours_reduction" in mods or "elderly_disabled_hours_reduction" in mods else 1.0

    noise = rng.normal(0.0, params["noise_std_fraction"] * max(unpaid_hours, 1.0))
    unpaid_hours = max(0.0, unpaid_hours + noise)

    paid_hours = _paid_hours_capacity(ind, employability, unpaid_hours, mods, params)
    leisure_hours = max(0.0, DISCRETIONARY_HOURS - unpaid_hours - paid_hours)

    return {
        "unpaid_care_hours_week": round(unpaid_hours, 2),
        "paid_work_hours_week": round(paid_hours, 2),
        "leisure_hours_week": round(leisure_hours, 2),
        "labor_participation": int(paid_hours > 5.0),
        "employability_index": round(employability, 3),
    }
