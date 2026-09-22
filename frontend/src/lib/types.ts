export type ScenarioKey =
  | "Base"
  | "A_guarderias_universales"
  | "B_licencia_igualitaria"
  | "C_bono_cuidador"
  | "D_reduccion_jornada"
  | "E_infraestructura_cuidados"
  | "F_intervencion_integral";

export interface ScenarioInfo {
  label: string;
  description: string;
}

export interface ScenariosMeta {
  order: ScenarioKey[];
  info: Record<ScenarioKey, ScenarioInfo>;
}

export interface ScenarioRow {
  escenario: ScenarioKey;
  participacion_laboral_femenina: number;
  brecha_genero_horas_no_remuneradas: number;
  horas_no_remuneradas_mujeres: number;
  horas_no_remuneradas_hombres: number;
  tasa_pobreza_tiempo: number;
  costo_fiscal_semanal_percapita_usd: number;
}

export interface ScenariosCompareResponse {
  columns: string[];
  rows: ScenarioRow[];
}

export type Gender = "female" | "male";
export type EducationLevel = "primaria" | "secundaria" | "terciaria";
export type EmploymentSector = "formal" | "informal" | "unemployed";
export type HouseholdStructure = "nuclear" | "extendido" | "monoparental";
export type CountryContext = "low" | "medium" | "high";

export interface IndividualRequest {
  gender: Gender;
  age: number;
  education_level: EducationLevel;
  employment_sector: EmploymentSector;
  income_share_household: number;
  num_dependents_children: number;
  num_dependents_elderly_disabled: number;
  household_structure: HouseholdStructure;
  country_income_context: CountryContext;
  scenario: ScenarioKey;
}

export interface IndividualOutcome {
  unpaid_care_hours_week: number;
  paid_work_hours_week: number;
  leisure_hours_week: number;
  labor_participation: 0 | 1;
  employability_index: number;
}

export interface ModelPerformanceRow {
  model: string;
  rmse_mean: number;
  rmse_std: number;
  r2_mean: number;
  r2_std: number;
}

export interface ModelPerformance {
  models: string[];
  rows: ModelPerformanceRow[];
}

export interface WilcoxonEntry {
  statistic: number;
  p_value: number;
}

export interface MlResults {
  model_performance: Record<string, { rmse_mean: number; rmse_std: number; r2_mean: number; r2_std: number }>;
  winner: string;
  friedman: { statistic: number; p_value: number };
  wilcoxon_vs_winner: Record<string, WilcoxonEntry>;
  nadeau_bengio_vs_winner: Record<string, WilcoxonEntry>;
  bootstrap_ci_rmse_winner: { lower: number; upper: number };
  shapiro_wilk_residuals: { statistic: number; p_value: number };
  breusch_pagan_residuals: { statistic: number; p_value: number };
  blending_weights: number[];
}

export interface MlPerformanceResponse {
  performance: ModelPerformance | null;
  results: MlResults | null;
}
