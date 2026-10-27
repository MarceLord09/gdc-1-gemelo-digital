import type {
  Benchmark,
  Sensitivity,
  IndividualOutcome,
  IndividualRequest,
  MlPerformanceResponse,
  ScenariosCompareResponse,
  ScenariosMeta,
} from "./types";

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // sin cuerpo JSON, se mantiene el statusText
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

export { ApiError };

export function getScenariosMeta() {
  return request<ScenariosMeta>("/api/scenarios/meta");
}

export function getScenariosCompare() {
  return request<ScenariosCompareResponse>("/api/scenarios/compare");
}

export function postScenariosCompare(n: number, seed: number) {
  return request<ScenariosCompareResponse>("/api/scenarios/compare", {
    method: "POST",
    body: JSON.stringify({ n, seed }),
  });
}

export function postIndividualSimulate(payload: IndividualRequest) {
  return request<IndividualOutcome>("/api/individual/simulate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getMlPerformance() {
  return request<MlPerformanceResponse>("/api/ml/performance");
}

export function postMlRetrain() {
  return request<MlPerformanceResponse["results"]>("/api/ml/retrain", {
    method: "POST",
  });
}

export function getMlBenchmark() {
  return request<Benchmark | null>("/api/ml/benchmark");
}

export function postMlBenchmark() {
  return request<Benchmark>("/api/ml/benchmark", { method: "POST" });
}

export function getSensitivity() {
  return request<Sensitivity | null>("/api/scenarios/sensitivity");
}

export function postSensitivity() {
  return request<Sensitivity>("/api/scenarios/sensitivity", { method: "POST" });
}
