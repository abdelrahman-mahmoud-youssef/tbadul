import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Attempt } from '@engagement-exchange/verification';
import { content, handle } from '@engagement-exchange/verification/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readEnv, type Env } from './config.ts';
import type { Demo } from './demo.ts';
import { measurementLog, missingKey } from './measurement-log.ts';

const key = 'panel-key-for-tests';
const performer = handle('panel.performer');
const target = handle('panel.target');

const env = (source: Record<string, string>): Env => {
  const loaded = readEnv(source);
  if (!loaded.ok) throw new Error(loaded.error.join('; '));
  return loaded.value;
};

const digest = (value: string) => createHmac('sha256', key).update(value).digest('hex');

const verified: Attempt = {
  source: 'lamatok',
  platform: 'tiktok',
  check: 'profile',
  outcome: 'verified',
  cost: { unit: 'request', amount: 1 },
  startedAt: Date.UTC(2026, 10, 3, 12),
  latencyMs: 412,
};

const blocked: Attempt = {
  source: 'scraper',
  platform: 'tiktok',
  check: 'follows',
  outcome: 'source_error',
  error: {
    kind: 'http',
    message: 'refused https://www.tiktok.com/@panel.performer',
    httpStatus: 403,
    providerStatus: 10201,
  },
  startedAt: Date.UTC(2026, 10, 3, 12, 0, 1),
  latencyMs: 90,
};

describe('measurementLog', () => {
  let directory: string;
  let file: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'measurements-'));
    file = join(directory, 'measurements.jsonl');
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const record = (demo: Demo, attempts: readonly Attempt[]) => {
    const log = measurementLog(
      env({ MEASUREMENT_HMAC_KEY: key, MEASUREMENT_LOG_FILE: file }),
      demo,
    );
    if (!log.ok) throw new Error(log.error);
    for (const attempt of attempts) log.value.record(attempt);
    return readFileSync(file, 'utf8');
  };

  it('appends one line per attempt with the handles hashed under the key', () => {
    const written = record({ command: 'follows', performer, target }, [verified, blocked]);
    expect(
      written
        .trimEnd()
        .split('\n')
        .map((entry) => JSON.parse(entry) as unknown),
    ).toEqual([
      {
        at: '2026-11-03T12:00:00.000Z',
        command: 'follows',
        check: 'profile',
        source: 'lamatok',
        outcome: 'verified',
        latencyMs: 412,
        cost: { unit: 'request', amount: 1 },
        performer: digest('panel.performer'),
        target: digest('panel.target'),
      },
      {
        at: '2026-11-03T12:00:01.000Z',
        command: 'follows',
        check: 'follows',
        source: 'scraper',
        outcome: 'source_error',
        latencyMs: 90,
        cost: null,
        errorKind: 'http',
        httpStatus: 403,
        providerStatus: 10201,
        performer: digest('panel.performer'),
        target: digest('panel.target'),
      },
    ]);
  });

  it('writes no raw handle, no error message and no key', () => {
    const written = record({ command: 'follows', performer, target }, [verified, blocked]);
    expect(written).not.toContain('panel.performer');
    expect(written).not.toContain('panel.target');
    expect(written).not.toContain('"message"');
    expect(written).not.toContain(key);
  });

  it('hashes the video as the target of a liked check', () => {
    const video = content('7000000000000000000');
    const written = record({ command: 'liked', performer, content: video }, [verified]);
    expect(JSON.parse(written)).toMatchObject({ target: digest('7000000000000000000') });
    expect(written).not.toContain('7000000000000000000');
  });

  it('writes no target for a profile command', () => {
    const written = record({ command: 'profile', subject: performer }, [verified]);
    expect(JSON.parse(written)).toMatchObject({ performer: digest('panel.performer') });
    expect(JSON.parse(written)).not.toHaveProperty('target');
  });

  it('refuses without a key, an empty one included', () => {
    const demo: Demo = { command: 'profile', subject: performer };
    expect(measurementLog(env({}), demo)).toEqual({ ok: false, error: missingKey });
    expect(measurementLog(env({ MEASUREMENT_HMAC_KEY: '' }), demo)).toEqual({
      ok: false,
      error: missingKey,
    });
  });
});
