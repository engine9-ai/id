export const LOG_PREFIX = '[engine9-id]';

export type DebugLog = (step: string, detail?: Record<string, unknown>) => void;

/** `console.info` per step when `enabled`; a no-op otherwise. */
export function createDebugLog(enabled: boolean | undefined): DebugLog {
  if (!enabled || typeof console === 'undefined') return () => {};
  return (step, detail) => {
    if (detail === undefined) console.info(LOG_PREFIX, step);
    else console.info(LOG_PREFIX, step, detail);
  };
}
