import { loadApiEnv, type ApiEnv } from '@prayer/shared';

export function env(): ApiEnv {
  return loadApiEnv();
}
