import { useEffect, useRef, useState } from "react";
import { FieldRow, SelectField, SliderField } from "../components/Field";
import { ScenarioPicker } from "../components/ScenarioPicker";
import { Section } from "../components/Section";
import { StatGrid, StatTile } from "../components/StatTile";
import { WeekLedger } from "../components/WeekLedger";
import * as api from "../lib/api";
import type {
  CountryContext,
  EducationLevel,
  EmploymentSector,
  Gender,
  HouseholdStructure,
  IndividualOutcome,
  ScenarioKey,
  ScenariosMeta,
} from "../lib/types";

const FIXED_HOURS = 168 - 98; // sueño (56h) + cuidado personal (14h): 70h, no depende de política

export function IndividuoView() {
  const [meta, setMeta] = useState<ScenariosMeta | null>(null);
  const [outcome, setOutcome] = useState<IndividualOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [gender, setGender] = useState<Gender>("female");
  const [age, setAge] = useState(32);
  const [education, setEducation] = useState<EducationLevel>("secundaria");
  const [sector, setSector] = useState<EmploymentSector>("formal");
  const [incomeShare, setIncomeShare] = useState(0.5);
  const [household, setHousehold] = useState<HouseholdStructure>("nuclear");
  const [children, setChildren] = useState(1);
  const [elderly, setElderly] = useState(0);
  const [context, setContext] = useState<CountryContext>("medium");
  const [scenario, setScenario] = useState<ScenarioKey>("Base");

  useEffect(() => {
    api.getScenariosMeta().then(setMeta).catch((e) => setError(e.message));
  }, []);

  const debounceRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      api
        .postIndividualSimulate({
          gender,
          age,
          education_level: education,
          employment_sector: sector,
          income_share_household: incomeShare,
          num_dependents_children: children,
          num_dependents_elderly_disabled: elderly,
          household_structure: household,
          country_income_context: context,
          scenario,
        })
        .then(setOutcome)
        .catch((e) => setError(e instanceof Error ? e.message : "No se pudo simular"));
    }, 150);
    return () => window.clearTimeout(debounceRef.current);
  }, [gender, age, education, sector, incomeShare, children, elderly, household, context, scenario]);

  return (
    <>
      <Section
        title="Simulador de asignación de tiempo"
        caption="Describe a una persona y un escenario de política; el motor reparte sus 168 horas semanales entre cuidado, trabajo remunerado y ocio."
      >
        <FieldRow>
          <SelectField
            label="Género"
            value={gender}
            onChange={setGender}
            options={[
              { value: "female", label: "Mujer" },
              { value: "male", label: "Hombre" },
            ]}
          />
          <SliderField label="Edad" value={age} min={18} max={65} onChange={setAge} unit=" años" />
          <SelectField
            label="Nivel educativo"
            value={education}
            onChange={setEducation}
            options={[
              { value: "primaria", label: "Primaria" },
              { value: "secundaria", label: "Secundaria" },
              { value: "terciaria", label: "Terciaria" },
            ]}
          />
          <SelectField
            label="Sector de empleo"
            value={sector}
            onChange={setSector}
            options={[
              { value: "formal", label: "Formal" },
              { value: "informal", label: "Informal" },
              { value: "unemployed", label: "Desempleada/o" },
            ]}
          />
          <SliderField
            label="Proporción del ingreso del hogar"
            value={incomeShare}
            min={0}
            max={1}
            step={0.05}
            onChange={setIncomeShare}
          />
          <SelectField
            label="Estructura del hogar"
            value={household}
            onChange={setHousehold}
            options={[
              { value: "nuclear", label: "Nuclear" },
              { value: "extendido", label: "Extendido" },
              { value: "monoparental", label: "Monoparental" },
            ]}
          />
          <SliderField
            label="Hijas/os dependientes"
            value={children}
            min={0}
            max={4}
            onChange={setChildren}
          />
          <SliderField
            label="Adultos mayores / con discapacidad a cargo"
            value={elderly}
            min={0}
            max={2}
            onChange={setElderly}
          />
          <SelectField
            label="Contexto de ingreso del país"
            value={context}
            onChange={setContext}
            options={[
              { value: "low", label: "Bajo" },
              { value: "medium", label: "Medio" },
              { value: "high", label: "Alto" },
            ]}
          />
        </FieldRow>

        <div style={{ marginTop: 20 }}>
          <span className="field-label" style={{ marginBottom: 8, display: "block" }}>
            Escenario de política activo
          </span>
          {meta && (
            <ScenarioPicker order={meta.order} info={meta.info} value={scenario} onChange={setScenario} />
          )}
        </div>
      </Section>

      {error && (
        <p style={{ color: "var(--error)" }}>{error}</p>
      )}

      {outcome && (
        <Section
          title="Resultado: la semana de esta persona"
          caption="168 horas totales. El sueño y el cuidado personal (70 h) son fijos; el resto se reparte según el escenario."
        >
          <WeekLedger
            segments={[
              { key: "sleep", label: "Sueño + cuidado personal (fijo)", hours: FIXED_HOURS, colorVar: "var(--series-sleep)" },
              { key: "unpaid", label: "Trabajo no remunerado / cuidado", hours: outcome.unpaid_care_hours_week, colorVar: "var(--series-unpaid-care)" },
              { key: "paid", label: "Trabajo remunerado", hours: outcome.paid_work_hours_week, colorVar: "var(--series-paid-work)" },
              { key: "leisure", label: "Ocio", hours: outcome.leisure_hours_week, colorVar: "var(--series-leisure)" },
            ]}
          />

          <div style={{ marginTop: 22 }}>
            <StatGrid>
              <StatTile
                label="Participa en el mercado laboral"
                value={outcome.labor_participation ? "Sí" : "No"}
                note="más de 5 h/semana de trabajo remunerado"
              />
              <StatTile
                label="Índice de empleabilidad"
                value={outcome.employability_index.toFixed(2)}
                note="combina educación y sector de empleo"
              />
            </StatGrid>
          </div>
        </Section>
      )}
    </>
  );
}
