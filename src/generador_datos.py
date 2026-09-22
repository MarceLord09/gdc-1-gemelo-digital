"""Generador estocastico causal del conjunto de datos sinteticos de GDC-1."""
from __future__ import annotations

import numpy as np
import pandas as pd

from motor_calculo import Individual, SCENARIOS, allocate_time

EDUCATION_LEVELS = ["primaria", "secundaria", "terciaria"]
EMPLOYMENT_SECTORS = ["formal", "informal", "unemployed"]
HOUSEHOLD_STRUCTURES = ["nuclear", "extendido", "monoparental"]
COUNTRY_CONTEXTS = ["low", "medium", "high"]
SCENARIO_NAMES = list(SCENARIOS.keys())


def _sample_individual(rng: np.random.Generator) -> Individual:
    gender = rng.choice(["female", "male"])
    age = int(rng.integers(18, 66))
    education_level = rng.choice(EDUCATION_LEVELS, p=[0.35, 0.4, 0.25])
    employment_sector = rng.choice(EMPLOYMENT_SECTORS, p=[0.45, 0.35, 0.2])
    household_structure = rng.choice(HOUSEHOLD_STRUCTURES, p=[0.55, 0.25, 0.2])
    has_partner = household_structure != "monoparental"

    income_share_household = (
        float(rng.beta(2, 2)) if has_partner else 1.0
    )
    num_children = int(rng.choice([0, 1, 2, 3, 4], p=[0.35, 0.3, 0.2, 0.1, 0.05]))
    num_elderly_disabled = int(rng.choice([0, 1, 2], p=[0.75, 0.2, 0.05]))
    country_income_context = rng.choice(COUNTRY_CONTEXTS, p=[0.4, 0.4, 0.2])

    return Individual(
        gender=gender,
        age=age,
        education_level=education_level,
        employment_sector=employment_sector,
        income_share_household=income_share_household,
        num_dependents_children=num_children,
        num_dependents_elderly_disabled=num_elderly_disabled,
        household_structure=household_structure,
        country_income_context=country_income_context,
        has_partner=has_partner,
    )


def generate_population(
    n: int,
    seed: int = 42,
    scenario_distribution: dict | None = None,
    fixed_scenario: str | None = None,
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    if fixed_scenario is not None:
        scenarios = [fixed_scenario] * n
    elif scenario_distribution is not None:
        names = list(scenario_distribution.keys())
        probs = list(scenario_distribution.values())
        scenarios = rng.choice(names, size=n, p=probs)
    else:
        scenarios = rng.choice(SCENARIO_NAMES, size=n)

    rows = []
    for i in range(n):
        ind = _sample_individual(rng)
        scenario = scenarios[i]
        outcome = allocate_time(ind, scenario, rng)
        rows.append(
            {
                "gender": ind.gender,
                "age": ind.age,
                "education_level": ind.education_level,
                "employment_sector": ind.employment_sector,
                "income_share_household": round(ind.income_share_household, 3),
                "num_dependents_children": ind.num_dependents_children,
                "num_dependents_elderly_disabled": ind.num_dependents_elderly_disabled,
                "household_structure": ind.household_structure,
                "country_income_context": ind.country_income_context,
                "has_partner": ind.has_partner,
                "policy_scenario": scenario,
                **outcome,
            }
        )

    return pd.DataFrame(rows)


FEATURE_COLUMNS_NUMERIC = [
    "age",
    "income_share_household",
    "num_dependents_children",
    "num_dependents_elderly_disabled",
]
FEATURE_COLUMNS_CATEGORICAL = [
    "gender",
    "education_level",
    "employment_sector",
    "household_structure",
    "country_income_context",
    "policy_scenario",
]
TARGET_COLUMN = "unpaid_care_hours_week"
