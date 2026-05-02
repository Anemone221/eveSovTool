import { useOpsec } from '@/state/opsecStore';

/**
 * Briefly enables capture-mode opsec redaction across mounted panels,
 * waits for React to commit the redacted DOM, runs the capture,
 * then disables capture mode again. The live UI flashes to redacted
 * state for a frame; this is the price of single-instance panels.
 */
export async function withOpsecCapture<T>(fn: () => Promise<T>): Promise<T> {
  const setCaptureActive = useOpsec.getState().setCaptureActive;
  setCaptureActive(true);
  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return await fn();
  } finally {
    setCaptureActive(false);
  }
}
