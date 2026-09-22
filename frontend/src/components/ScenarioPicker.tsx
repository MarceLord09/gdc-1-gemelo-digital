import { scenarioCode } from "../lib/scenario";
import type { ScenarioInfo, ScenarioKey } from "../lib/types";

interface ScenarioPickerProps {
  order: ScenarioKey[];
  info: Record<ScenarioKey, ScenarioInfo>;
  value: ScenarioKey;
  onChange: (key: ScenarioKey) => void;
}

export function ScenarioPicker({ order, info, value, onChange }: ScenarioPickerProps) {
  const active = info[value];
  return (
    <div>
      <div className="scenario-picker" role="tablist" aria-label="Escenario de política">
        {order.map((key) => {
          const code = scenarioCode(key);
          return (
            <button
              key={key}
              type="button"
              role="tab"
              className="scenario-chip"
              data-active={key === value}
              aria-selected={key === value}
              onClick={() => onChange(key)}
            >
              <span className="badge">{code}</span>
              {code === "Base" ? null : <span>{info[key]?.label}</span>}
            </button>
          );
        })}
      </div>
      {active && <p className="scenario-description">{active.description}</p>}
    </div>
  );
}
