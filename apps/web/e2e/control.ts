import { controlOrigin } from './origins';

export const control = async (route: string, body: object = {}): Promise<void> => {
  const response = await fetch(`${controlOrigin}${route}`, {
    method: 'POST',
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${route} answered ${response.status}`);
};

export const poolHandle = 'verifier_pool';

export const ensurePool = (): Promise<void> => control('/pool', { handle: poolHandle });
