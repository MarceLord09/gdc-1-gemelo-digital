"""Lanza el app de Streamlit y captura una screenshot por pestana (fase CRISP-DM)
usando Playwright, guardando los PNG en CAPTURAS-Motor_Streamlit_CRISP_DM/."""
import subprocess
import time
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

APP_DIR = Path(__file__).parent
OUT_DIR = Path(
    "/Users/marceloflores/Documents/Santos/GDC-1_Manuscrito_y_Revista/"
    "CAPTURAS-Motor_Streamlit_CRISP_DM"
)
OUT_DIR.mkdir(parents=True, exist_ok=True)

PORT = 8577
URL = f"http://localhost:{PORT}"

TABS = [
    ("🏗️ Comprensión y arquitectura", "fase0_comprension_arquitectura.png"),
    ("🔍 EDA", "fase1_eda_matriz_correlacion_y_distribuciones.png"),
    ("✂️ Partición y preparación", "fase2_particion_estratificada.png"),
    ("🏆 Selección de modelo", "fase3_seleccion_mejor_modelo_leaderboard.png"),
    ("📈 Validación cruzada", "fase4_validacion_cruzada_estratificada.png"),
    ("📊 Pruebas estadísticas", "fase5_pruebas_estadisticas_wilcoxon.png"),
    ("🧠 Interpretabilidad SHAP", "fase6_interpretabilidad_xai_shap.png"),
    ("🧍 Simulador individual", "fase7_simulador_individual.png"),
    ("📋 Escenarios A-F", "fase8_escenarios_politica.png"),
]


def main():
    proc = subprocess.Popen(
        [
            str(APP_DIR / ".venv" / "bin" / "streamlit"), "run", str(APP_DIR / "app.py"),
            "--server.port", str(PORT),
            "--server.headless", "true",
            "--browser.gatherUsageStats", "false",
        ],
        cwd=str(APP_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    try:
        # esperar a que el server este listo
        ready = False
        for _ in range(60):
            line = proc.stdout.readline().decode(errors="ignore")
            if "You can now view" in line or "Local URL" in line:
                ready = True
            if proc.poll() is not None:
                break
            if ready:
                break
            time.sleep(0.5)
        time.sleep(3)

        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1440, "height": 1000})
            page.goto(URL, wait_until="networkidle", timeout=30000)
            time.sleep(2)

            for label, filename in TABS:
                tab_locator = page.get_by_role("tab", name=label)
                tab_locator.click()
                time.sleep(1.5)
                # esperar a que desaparezcan los spinners de streamlit si los hay
                try:
                    page.wait_for_selector("text=Running", state="detached", timeout=5000)
                except Exception:
                    pass
                time.sleep(1.0)
                out_path = OUT_DIR / filename
                page.screenshot(path=str(out_path), full_page=True)
                print(f"Guardado: {out_path}")

            browser.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    main()
