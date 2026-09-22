import { useState } from "react";
import "./components/Layout.css";
import { EscenariosView } from "./views/EscenariosView";
import { IndividuoView } from "./views/IndividuoView";
import { MLView } from "./views/MLView";

type Tab = "escenarios" | "individuo" | "ml";

const TABS: { key: Tab; label: string }[] = [
  { key: "escenarios", label: "Escenarios A–F" },
  { key: "individuo", label: "Simulador individual" },
  { key: "ml", label: "Modelos de ML" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("escenarios");

  return (
    <div className="app-shell">
      <header className="masthead">
        <div className="masthead-inner">
          <div className="masthead-title">
            <h1>GDC-1</h1>
          </div>
          <p className="masthead-subtitle">Gemelo digital de ecosistemas de cuidado</p>
          <p className="masthead-caption">
            Capa exploratoria del sistema: compara políticas de cuidado, simula a una persona y
            revisa el desempeño de los modelos que predicen el reparto del tiempo. La validación
            formal — cross-validation, batería estadística — está documentada en el artículo,
            Secciones 2–4.
          </p>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className="tab"
              data-active={tab === t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {tab === "escenarios" && <EscenariosView />}
        {tab === "individuo" && <IndividuoView />}
        {tab === "ml" && <MLView />}
      </main>
    </div>
  );
}
