import { api } from '../api/client';
import type { EngineConfig, EngineConfigResponse, SimulationResult } from '../types';

/** Thresholds and formula weights currently in force (readable by every signed-in user). */
export const fetchEngineConfig = async () => (await api.get<EngineConfigResponse>('/competencies/engine/config')).data;
export const saveEngineConfig = async (config: EngineConfig) => (await api.put<EngineConfigResponse>('/competencies/engine/config', config)).data;
export const resetEngineConfig = async () => (await api.post<EngineConfigResponse>('/competencies/engine/config/reset')).data;

export interface SimulationInput {
  config?: EngineConfig;
  requiredLevel: number;
  currentLevel: number;
  importance: number;
  roleCriticality: number;
  assessmentScore?: number;
  trainerEvaluationScore?: number;
  practicalScore?: number;
  ceiling?: number;
}

/** What-if calculator: runs the real engine functions without touching any data. */
export const simulateEngine = async (input: SimulationInput) => (await api.post<SimulationResult>('/competencies/engine/simulate', input)).data;
