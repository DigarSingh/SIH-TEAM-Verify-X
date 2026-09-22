import { api } from '../api/client';
import type { RegistrationOptions } from '../types';

/** Public options: departments, job roles, registration policy, feature flags and the upload limit. */
export const fetchRegistrationOptions = async () => (await api.get<RegistrationOptions>('/meta/options')).data;
