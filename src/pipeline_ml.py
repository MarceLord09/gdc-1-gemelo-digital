"""Pipeline de ML (5 modelos) y bateria de validacion estadistica de GDC-1."""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import shap
from scipy import stats
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor, StackingRegressor
from sklearn.linear_model import Ridge
from sklearn.model_selection import (
    RandomizedSearchCV,
    StratifiedKFold,
    train_test_split,
)
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVR
from statsmodels.stats.diagnostic import het_breuschpagan
from statsmodels.tools import add_constant
from xgboost import XGBRegressor

from generador_datos import FEATURE_COLUMNS_CATEGORICAL, FEATURE_COLUMNS_NUMERIC, TARGET_COLUMN

RANDOM_STATE = 42


def build_preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), FEATURE_COLUMNS_NUMERIC),
            ("cat", OneHotEncoder(handle_unknown="ignore"), FEATURE_COLUMNS_CATEGORICAL),
        ]
    )


def _tune(estimator, param_dist, X_train, y_train, n_iter=10):
    search = RandomizedSearchCV(
        estimator,
        param_distributions=param_dist,
        n_iter=n_iter,
        cv=5,
        scoring="neg_root_mean_squared_error",
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    search.fit(X_train, y_train)
    return search.best_estimator_


class BlendingEnsemble:
    def __init__(self, estimators: dict):
        self.estimators = estimators
        self.weights_ = None
        self.names_ = list(estimators.keys())

    def fit(self, X, y, X_val, y_val):
        preds_val = np.column_stack(
            [self.estimators[name].predict(X_val) for name in self.names_]
        )
        best_rmse, best_w = np.inf, None
        grid = np.linspace(0, 1, 11)
        for w0 in grid:
            for w1 in grid:
                w2 = 1.0 - w0 - w1
                if w2 < 0 or w2 > 1:
                    continue
                weights = np.array([w0, w1, w2])
                pred = preds_val @ weights
                rmse = mean_squared_error(y_val, pred) ** 0.5
                if rmse < best_rmse:
                    best_rmse, best_w = rmse, weights
        self.weights_ = best_w
        return self

    def predict(self, X):
        preds = np.column_stack(
            [self.estimators[name].predict(X) for name in self.names_]
        )
        return preds @ self.weights_


def make_strata(y: pd.Series, q: int = 4) -> np.ndarray:
    """Bins continuos de la variable objetivo para estratificar el k-fold de regresion."""
    return pd.qcut(y, q=q, labels=False, duplicates="drop").to_numpy()


def _cv_scores(model_fn, X: pd.DataFrame, y: pd.Series, y_strata: np.ndarray, k=10):
    skf = StratifiedKFold(n_splits=k, shuffle=True, random_state=RANDOM_STATE)
    rmses, r2s, maes = [], [], []
    for train_idx, test_idx in skf.split(X, y_strata):
        X_tr, X_te = X.iloc[train_idx], X.iloc[test_idx]
        y_tr, y_te = y.iloc[train_idx], y.iloc[test_idx]
        model = model_fn()
        model.fit(X_tr, y_tr)
        pred = model.predict(X_te)
        rmses.append(mean_squared_error(y_te, pred) ** 0.5)
        r2s.append(r2_score(y_te, pred))
        maes.append(mean_absolute_error(y_te, pred))
    return np.array(rmses), np.array(r2s), np.array(maes)


def nadeau_bengio_test(diffs: np.ndarray, n_train: int, n_test: int) -> tuple[float, float]:
    k = len(diffs)
    mean_diff = diffs.mean()
    var_diff = diffs.var(ddof=1)
    correction = (1.0 / k) + (n_test / n_train)
    denom = np.sqrt(correction * var_diff) if var_diff > 0 else 1e-12
    t_stat = mean_diff / denom
    p_value = 2 * (1 - stats.t.cdf(abs(t_stat), df=k - 1))
    return float(t_stat), float(p_value)


def bootstrap_ci_rmse(y_true, y_pred, n_boot=2000, seed=RANDOM_STATE):
    rng = np.random.default_rng(seed)
    n = len(y_true)
    boot_rmses = np.empty(n_boot)
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    for i in range(n_boot):
        idx = rng.integers(0, n, n)
        boot_rmses[i] = mean_squared_error(y_true[idx], y_pred[idx]) ** 0.5
    lo, hi = np.percentile(boot_rmses, [2.5, 97.5])
    return float(lo), float(hi)


def run_pipeline(df: pd.DataFrame, output_dir: str) -> dict:
    X = df[FEATURE_COLUMNS_NUMERIC + FEATURE_COLUMNS_CATEGORICAL]
    y = df[TARGET_COLUMN]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=RANDOM_STATE
    )
    X_train_fit, X_val, y_train_fit, y_val = train_test_split(
        X_train, y_train, test_size=0.2, random_state=RANDOM_STATE
    )

    def make_pipeline(estimator):
        return Pipeline([("prep", build_preprocessor()), ("model", estimator)])

    rf_dist = {
        "model__n_estimators": [100, 200, 300, 400],
        "model__max_depth": [None, 8, 12, 16, 20],
        "model__min_samples_leaf": [1, 2, 4],
    }
    xgb_dist = {
        "model__n_estimators": [100, 200, 300, 400],
        "model__max_depth": [3, 4, 5, 6, 8],
        "model__learning_rate": [0.03, 0.05, 0.1, 0.2],
        "model__subsample": [0.7, 0.8, 1.0],
    }
    svr_dist = {
        "model__C": [1, 5, 10, 50, 100],
        "model__gamma": ["scale", 0.01, 0.1],
        "model__epsilon": [0.1, 0.5, 1.0],
    }

    print("Tuning Random Forest...")
    rf_best = _tune(
        make_pipeline(RandomForestRegressor(random_state=RANDOM_STATE)),
        rf_dist, X_train, y_train, n_iter=12,
    )
    print("Tuning XGBoost...")
    xgb_best = _tune(
        make_pipeline(XGBRegressor(random_state=RANDOM_STATE, verbosity=0)),
        xgb_dist, X_train, y_train, n_iter=12,
    )
    print("Tuning SVR...")
    svr_best = _tune(
        make_pipeline(SVR(kernel="rbf")),
        svr_dist, X_train, y_train, n_iter=10,
    )

    stacking = Pipeline(
        [
            ("prep", build_preprocessor()),
            (
                "model",
                StackingRegressor(
                    estimators=[
                        ("rf", rf_best.named_steps["model"]),
                        ("xgb", xgb_best.named_steps["model"]),
                        ("svr", svr_best.named_steps["model"]),
                    ],
                    final_estimator=Ridge(),
                    cv=5,
                ),
            ),
        ]
    )
    print("Fitting Stacking...")
    stacking.fit(X_train, y_train)

    print("Fitting Blending...")
    rf_best.fit(X_train_fit, y_train_fit)
    xgb_best.fit(X_train_fit, y_train_fit)
    svr_best.fit(X_train_fit, y_train_fit)
    blend = BlendingEnsemble({"rf": rf_best, "xgb": xgb_best, "svr": svr_best})
    blend.fit(X_train_fit, y_train_fit, X_val, y_val)

    y_strata = make_strata(y, q=4)

    results = {}
    cv_rmse_matrix = {}

    for name, fitted_model in [
        ("RandomForest", rf_best),
        ("XGBoost", xgb_best),
        ("SVR", svr_best),
        ("Stacking", stacking),
    ]:
        rmses, r2s, maes = _cv_scores(lambda m=fitted_model: _clone_fitted(m), X, y, y_strata, k=10)
        cv_rmse_matrix[name] = rmses
        results[name] = {
            "rmse_mean": float(rmses.mean()),
            "rmse_std": float(rmses.std()),
            "r2_mean": float(r2s.mean()),
            "r2_std": float(r2s.std()),
            "mae_mean": float(maes.mean()),
            "mae_std": float(maes.std()),
        }

    blend_rmses = []
    blend_r2s = []
    blend_maes = []
    skf = StratifiedKFold(n_splits=10, shuffle=True, random_state=RANDOM_STATE)
    for train_idx, test_idx in skf.split(X, y_strata):
        X_tr, X_te = X.iloc[train_idx], X.iloc[test_idx]
        y_tr, y_te = y.iloc[train_idx], y.iloc[test_idx]
        X_tr_fit, X_tr_val, y_tr_fit, y_tr_val = train_test_split(
            X_tr, y_tr, test_size=0.2, random_state=RANDOM_STATE
        )
        rf_fold = _clone_fitted(rf_best, X_tr_fit, y_tr_fit)
        xgb_fold = _clone_fitted(xgb_best, X_tr_fit, y_tr_fit)
        svr_fold = _clone_fitted(svr_best, X_tr_fit, y_tr_fit)
        blend_fold = BlendingEnsemble({"rf": rf_fold, "xgb": xgb_fold, "svr": svr_fold})
        blend_fold.fit(X_tr_fit, y_tr_fit, X_tr_val, y_tr_val)
        pred = blend_fold.predict(X_te)
        blend_rmses.append(mean_squared_error(y_te, pred) ** 0.5)
        blend_r2s.append(r2_score(y_te, pred))
        blend_maes.append(mean_absolute_error(y_te, pred))
    blend_rmses = np.array(blend_rmses)
    cv_rmse_matrix["Blending"] = blend_rmses
    results["Blending"] = {
        "rmse_mean": float(blend_rmses.mean()),
        "rmse_std": float(blend_rmses.std()),
        "r2_mean": float(np.mean(blend_r2s)),
        "r2_std": float(np.std(blend_r2s)),
        "mae_mean": float(np.mean(blend_maes)),
        "mae_std": float(np.std(blend_maes)),
    }

    winner = min(results, key=lambda k: results[k]["rmse_mean"])

    model_names = list(cv_rmse_matrix.keys())
    rmse_table = np.column_stack([cv_rmse_matrix[m] for m in model_names])
    friedman_stat, friedman_p = stats.friedmanchisquare(*[rmse_table[:, i] for i in range(rmse_table.shape[1])])

    wilcoxon_results = {}
    nb_results = {}
    winner_idx = model_names.index(winner)
    n_test_fold = len(X) // 10
    n_train_fold = len(X) - n_test_fold
    for i, name in enumerate(model_names):
        if name == winner:
            continue
        diffs = rmse_table[:, i] - rmse_table[:, winner_idx]
        try:
            w_stat, w_p = stats.wilcoxon(rmse_table[:, i], rmse_table[:, winner_idx])
        except ValueError:
            w_stat, w_p = float("nan"), float("nan")
        wilcoxon_results[name] = {"statistic": float(w_stat), "p_value": float(w_p)}
        nb_t, nb_p = nadeau_bengio_test(diffs, n_train_fold, n_test_fold)
        nb_results[name] = {"t_statistic": nb_t, "p_value": nb_p}

    winner_model = {"RandomForest": rf_best, "XGBoost": xgb_best, "SVR": svr_best,
                     "Stacking": stacking}.get(winner)
    if winner == "Blending":
        y_pred_test = blend.predict(X_test)
    else:
        winner_model_full = _clone_fitted({"RandomForest": rf_best, "XGBoost": xgb_best,
                                            "SVR": svr_best, "Stacking": stacking}[winner],
                                           X_train, y_train)
        y_pred_test = winner_model_full.predict(X_test)

    residuals = y_test.values - y_pred_test
    ci_lo, ci_hi = bootstrap_ci_rmse(y_test.values, y_pred_test)
    shapiro_stat, shapiro_p = stats.shapiro(residuals)

    X_test_design = add_constant(y_pred_test)
    bp_stat, bp_p, _, _ = het_breuschpagan(residuals, X_test_design)

    print("Calculando interpretabilidad SHAP sobre el modelo ganador...")
    winner_predict = blend.predict if winner == "Blending" else winner_model_full.predict

    # SHAP necesita entradas numericas: codificamos las categoricas a enteros
    # (segun las categorias vistas en los datos) y decodificamos dentro de la
    # funcion de prediccion antes de llamar al pipeline real.
    cat_categories = {col: sorted(X[col].astype(str).unique().tolist())
                       for col in FEATURE_COLUMNS_CATEGORICAL}

    def _encode(df_raw: pd.DataFrame) -> pd.DataFrame:
        enc = df_raw.copy()
        for col in FEATURE_COLUMNS_CATEGORICAL:
            cats = cat_categories[col]
            enc[col] = enc[col].astype(str).map({c: i for i, c in enumerate(cats)}).astype(float)
        for col in FEATURE_COLUMNS_NUMERIC:
            enc[col] = enc[col].astype(float)
        return enc[X.columns]

    def _decode(arr: np.ndarray) -> pd.DataFrame:
        df = pd.DataFrame(arr, columns=X.columns)
        for col in FEATURE_COLUMNS_CATEGORICAL:
            cats = cat_categories[col]
            idx = df[col].round().clip(0, len(cats) - 1).astype(int)
            df[col] = idx.map(lambda i: cats[i])
        for col in FEATURE_COLUMNS_NUMERIC:
            df[col] = df[col].astype(float)
        return df[X.columns]

    def _predict_array(data):
        return winner_predict(_decode(np.asarray(data)))

    bg_sample = _encode(X_train.sample(n=min(40, len(X_train)), random_state=RANDOM_STATE))
    eval_sample = _encode(X_test.sample(n=min(120, len(X_test)), random_state=RANDOM_STATE))

    explainer = shap.Explainer(_predict_array, bg_sample, algorithm="permutation",
                                seed=RANDOM_STATE)
    shap_result = explainer(eval_sample, max_evals="auto")
    mean_abs_shap = np.abs(shap_result.values).mean(axis=0)
    shap_importance = dict(
        sorted(zip(X.columns.tolist(), mean_abs_shap.tolist()), key=lambda kv: -kv[1])
    )
    print("SHAP listo:", shap_importance)

    summary = {
        "model_performance": results,
        "winner": winner,
        "friedman": {"statistic": float(friedman_stat), "p_value": float(friedman_p)},
        "wilcoxon_vs_winner": wilcoxon_results,
        "nadeau_bengio_vs_winner": nb_results,
        "bootstrap_ci_rmse_winner": {"lower": ci_lo, "upper": ci_hi},
        "shapiro_wilk_residuals": {"statistic": float(shapiro_stat), "p_value": float(shapiro_p)},
        "breusch_pagan_residuals": {"statistic": float(bp_stat), "p_value": float(bp_p)},
        "blending_weights": blend.weights_.tolist() if winner != "Blending" else blend.weights_.tolist(),
        "shap_importance": shap_importance,
        "y_test_sample": y_test.values[:300].tolist(),
        "y_pred_sample": y_pred_test[:300].tolist(),
        "cv_fold_rmse": {name: arr.tolist() for name, arr in cv_rmse_matrix.items()},
        "strata_counts": {
            int(k): int(v) for k, v in pd.Series(y_strata).value_counts().sort_index().items()
        },
    }

    with open(f"{output_dir}/ml_results.json", "w") as f:
        json.dump(summary, f, indent=2)

    pd.DataFrame(results).T.to_csv(f"{output_dir}/model_performance.csv")
    return summary


def _clone_fitted(pipeline: Pipeline, X=None, y=None):
    from sklearn.base import clone
    cloned = clone(pipeline)
    if X is not None and y is not None:
        cloned.fit(X, y)
    return cloned
