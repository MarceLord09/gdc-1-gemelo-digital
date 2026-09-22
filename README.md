# GDC-1 — Gemelo Digital de Ecosistemas de Cuidado

El motor de simulación (`src/`) es el mismo para las dos interfaces:

- **Streamlit** (`app.py`) — la interfaz original, sigue funcionando igual que antes.
- **React + FastAPI** (`frontend/` + `backend/`) — interfaz nueva, pedida por el profesor.

Ninguna reimplementa la lógica de dominio: ambas llaman a `src/motor_calculo.py`,
`src/escenarios.py` y `src/pipeline_ml.py`.

## Interfaz React (nueva)

### Requisitos

- El entorno virtual de siempre (`.venv`), más las dependencias de la API:
  ```bash
  .venv/bin/pip install -r backend/requirements.txt
  ```
- Node 18+ (para el frontend).

### Desarrollo (dos procesos, con recarga en caliente)

```bash
# Terminal 1 — API
.venv/bin/uvicorn backend.main:app --reload --port 8000

# Terminal 2 — interfaz
cd frontend
npm install   # solo la primera vez
npm run dev
```

Abre **http://localhost:5173**. El servidor de Vite redirige `/api/*` a
`http://127.0.0.1:8000` (configurado en `frontend/vite.config.ts`), así que no
hace falta configurar CORS a mano para desarrollo.

### Un solo comando (para mostrar el resultado, sin recarga en caliente)

```bash
cd frontend && npm install && npm run build && cd ..
.venv/bin/uvicorn backend.main:app --port 8000
```

Con `frontend/dist/` ya compilado, el backend sirve la interfaz completa en
**http://localhost:8000** — un solo proceso.

### Qué hace cada pantalla

- **Escenarios A–F**: corre `compare_scenarios(n, seed)` sobre una población
  simulada y compara las 7 políticas (brecha de género, participación
  laboral, pobreza de tiempo, costo fiscal).
- **Simulador individual**: arma un `Individual` con el formulario y llama a
  `allocate_time(...)` para repartir sus 168 horas semanales bajo el
  escenario elegido.
- **Modelos de ML**: lee `outputs/model_performance.csv` y
  `outputs/ml_results.json` (generados por `main.py`); el botón "Reentrenar"
  vuelve a correr `run_pipeline(...)` (1–3 minutos: tuning + CV de 5 modelos).

Si `outputs/dataset_sintetico.csv` no existe todavía, corre primero:

```bash
.venv/bin/python main.py
```

## Interfaz Streamlit (existente)

```bash
.venv/bin/streamlit run app.py
```
