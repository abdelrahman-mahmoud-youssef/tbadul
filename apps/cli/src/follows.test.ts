import { createVerifier, failed, type Answer } from '@engagement-exchange/verification';
import {
  fakeSource,
  listEvidence,
  manualClock,
  profileEvidence,
  recordingSink,
} from '@engagement-exchange/verification/testing';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { followsCommand } from './follows.ts';

const cost = { unit: 'request', amount: 1 } as const;
const targetFound: Answer<'profile'> = {
  outcome: 'verified',
  evidence: profileEvidence('bio'),
  cost,
};

const run = (target: Answer<'profile'>, follows: Answer<'follows'>) => {
  const clock = manualClock();
  const sink = recordingSink();
  const source = fakeSource('scraper', {
    profile: () => {
      clock.advance(400);
      return Promise.resolve(target);
    },
    follows: () => {
      clock.advance(300);
      return Promise.resolve(follows);
    },
  });
  const verifier = createVerifier(
    { order: ['scraper'], timeoutMs: 1000, pageCap: 1 },
    { sources: [source], clock, measurements: sink },
  );
  return {
    source,
    command: (performer: string, target: string) =>
      followsCommand(verifier, sink.attempts, performer, target),
  };
};

describe('followsCommand', () => {
  let log: MockInstance;
  let error: MockInstance;

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['verified', { outcome: 'verified', evidence: listEvidence, cost }, 0],
    ['not_following', { outcome: 'not_following', evidence: listEvidence, cost }, 1],
    ['private', { outcome: 'private', cost }, 2],
    ['not_found', { outcome: 'not_found', cost }, 3],
    ['source_error (blocked)', failed({ kind: 'blocked', message: 'waf' }, cost), 4],
  ] as const)(
    'prints %s with its exit code, latency and requests',
    async (outcome, answer, code) => {
      const { command } = run(targetFound, answer);
      await expect(command('@tiktok', 'tiktokcreators')).resolves.toBe(code);
      expect(log.mock.calls.flat()).toEqual([
        `@tiktok follows @tiktokcreators: ${outcome}`,
        'latency 700 ms, requests 2',
      ]);
    },
  );

  it('stops with not_found when the target does not exist', async () => {
    const { command, source } = run(
      { outcome: 'not_found', cost },
      { outcome: 'verified', evidence: listEvidence, cost },
    );
    await expect(command('tiktok', 'zq8v1k0x9m2nope')).resolves.toBe(3);
    expect(log.mock.calls.flat()).toEqual([
      'target @zq8v1k0x9m2nope: not_found',
      'latency 400 ms, requests 1',
    ]);
    expect(source.calls.map((check) => check.kind)).toEqual(['profile']);
  });

  it('refuses an invalid handle with the usage exit code and calls no source', async () => {
    const { command, source } = run(targetFound, {
      outcome: 'verified',
      evidence: listEvidence,
      cost,
    });
    await expect(command('not valid', 'tiktok')).resolves.toBe(64);
    expect(error).toHaveBeenCalledWith('invalid handle: not valid');
    expect(source.calls).toEqual([]);
  });
});
