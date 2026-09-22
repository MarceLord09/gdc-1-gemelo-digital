import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from generador_datos import generate_population
from pipeline_ml import run_pipeline
from escenarios import compare_scenarios

OUTPUT_DIR = Path(__file__).parent / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)


def main():
    print("== Generando poblacion sintetica ==")
    df = generate_population(n=2500, seed=42)
    df.to_csv(OUTPUT_DIR / "dataset_sintetico.csv", index=False)
    print(f"Dataset: {df.shape[0]} filas, {df.shape[1]} columnas")
    print(df[["unpaid_care_hours_week", "paid_work_hours_week", "labor_participation"]].describe())

    print("\n== Entrenando pipeline de ML (5 modelos) ==")
    summary = run_pipeline(df, str(OUTPUT_DIR))
    print("\nDesempeno por modelo:")
    for name, metrics in summary["model_performance"].items():
        print(f"  {name}: RMSE={metrics['rmse_mean']:.3f} (+/-{metrics['rmse_std']:.3f})  "
              f"R2={metrics['r2_mean']:.3f}")
    print(f"Modelo ganador: {summary['winner']}")
    print(f"Friedman: chi2={summary['friedman']['statistic']:.3f} p={summary['friedman']['p_value']:.4f}")

    print("\n== Comparando escenarios A-F ==")
    scenarios_df = compare_scenarios(n=2000, seed=123)
    scenarios_df.to_csv(OUTPUT_DIR / "comparacion_escenarios.csv", index=False)
    print(scenarios_df.to_string(index=False))

    print(f"\nTodo guardado en: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
