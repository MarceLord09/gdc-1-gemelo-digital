"""Barrido de hiperparametros de GDC-1: error (RMSE en CV), latencia de
prediccion y tamano del modelo. Alimenta el mapa de hiperparametros y la
frontera de Pareto de la interfaz."""
from __future__ import annotations

import io
import json
import pickle
import time
from itertools import product

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import mean_squared_error
from sklearn.pipeline import Pipeline
from sklearn.svm import SVR
from xgboost import XGBRegressor

from generador_datos import FEATURE_COLUMNS_CATEGORICAL, FEATURE_COLUMNS_NUMERIC, TARGET_COLUMN
from pipeline_ml import RANDOM_STATE, build_preprocessor, make_strata

LATENCY_ROWS = 1000  # filas por lote para medir la latencia


def _grid():
    for n, d in product([100, 200, 300, 400], [4, 8, 12, 20]):
        yield "RandomForest", {"n_estimators": n, "max_depth": d}, lambda n=n, d=d: RandomForestRegressor(
            n_estimators=n, max_depth=d, random_state=RANDOM_STATE, n_jobs=-1)
    for n, d in product([100, 200, 400], [3, 4, 5, 8]):
        yield "XGBoost", {"n_estimators": n, "max_depth": d}, lambda n=n, d=d: XGBRegressor(
            n_estimators=n, max_depth=d, learning_rate=0.1, subsample=1.0, random_state=RANDOM_STATE, verbosity=0, n_jobs=1)
    for c, e in product([1, 10, 100], [0.1, 0.5, 1.0]):
        yield "SVR", {"C": c, "epsilon": e}, lambda c=c, e=e: SVR(kernel="rbf", C=c, gamma=0.1, epsilon=e)


def run_benchmark(df: pd.DataFrame, output_path: str) -> dict:
    cols = FEATURE_COLUMNS_NUMERIC + FEATURE_COLUMNS_CATEGORICAL
    X, y = df[cols], df[TARGET_COLUMN]
    # mismo protocolo que la Tabla 2: 10 pliegues estratificados por cuartiles del objetivo
    # sobre las 2500 observaciones
    strata = make_strata(y, q=4)
    cv = StratifiedKFold(n_splits=10, shuffle=True, random_state=RANDOM_STATE)
    batch = X.sample(n=LATENCY_ROWS, replace=True, random_state=RANDOM_STATE)

    rows = []
    for model_name, params, factory in _grid():
        pipe = Pipeline([("prep", build_preprocessor()), ("model", factory())])
        scores = []
        for tr, te in cv.split(X, strata):
            m = Pipeline([("prep", build_preprocessor()), ("model", factory())]).fit(X.iloc[tr], y.iloc[tr])
            scores.append(mean_squared_error(y.iloc[te], m.predict(X.iloc[te])) ** 0.5)
        scores = np.array(scores)
        pipe.fit(X, y)
        times = []
        for _ in range(5):
            t0 = time.perf_counter()
            pipe.predict(batch)
            times.append((time.perf_counter() - t0) * 1000)
        buf = io.BytesIO()
        pickle.dump(pipe, buf)
        rows.append({
            "model": model_name,
            "params": params,
            "rmse_mean": float(scores.mean()),
            "rmse_std": float(scores.std()),
            "latency_ms": float(np.median(times)),
            "size_kb": buf.tell() / 1024,
        })
        print(f"{model_name} {params}: RMSE {scores.mean():.2f}, {np.median(times):.1f} ms, {buf.tell()/1024:.0f} KB")

    out = {"latency_rows": LATENCY_ROWS, "cv_folds": 10, "rows": rows}
    with open(output_path, "w") as f:
        json.dump(out, f, indent=2)
    return out
