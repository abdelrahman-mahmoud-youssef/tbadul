import { describe, expect, it } from 'vitest';
import { readEnv, sourceChoice } from './config.ts';

describe('sourceChoice', () => {
  it('defaults to the chain', () => {
    expect(sourceChoice.parse(undefined)).toBe('chain');
  });

  it('refuses a name that is not a source', () => {
    expect(sourceChoice.safeParse('tiktok').success).toBe(false);
  });
});

describe('readEnv', () => {
  it('parses the names from the environment with defaults', () => {
    expect(
      readEnv({
        TIKTOK_SIGNER_URL: 'http://localhost:8080',
        VERIFICATION_ACCOUNTS: ' verify.one, verify.two ',
      }),
    ).toEqual({
      ok: true,
      value: {
        TIKTOK_SIGNER_URL: 'http://localhost:8080',
        VERIFICATION_ACCOUNTS: ['verify.one', 'verify.two'],
        VERIFICATION_CONFIRM_NOT_FOLLOWING: true,
        OUTBOUND_TIMEOUT_MS: 15_000,
        CLI_USER_ID: 'local',
        MEASUREMENT_LOG_FILE: 'measurements.jsonl',
        WATCH_INTERVAL_SECONDS: 60,
      },
    });
  });

  it('treats empty values as unset so the defaults apply', () => {
    expect(
      readEnv({
        TIKTOK_SIGNER_URL: '',
        VERIFICATION_ACCOUNTS: '',
        VERIFICATION_SOURCE_ORDER: '',
        OUTBOUND_TIMEOUT_MS: '',
        CLI_USER_ID: '',
        DATABASE_URL: '',
      }),
    ).toMatchObject({
      ok: true,
      value: {
        TIKTOK_SIGNER_URL: 'http://localhost:8080',
        VERIFICATION_ACCOUNTS: [],
        OUTBOUND_TIMEOUT_MS: 15_000,
        CLI_USER_ID: 'local',
      },
    });
  });

  it.each(['postgres://app@localhost:5432/app', 'postgresql://app@db.internal/app'])(
    'accepts %s as the database url',
    (url) => {
      expect(readEnv({ DATABASE_URL: url })).toMatchObject({
        ok: true,
        value: { DATABASE_URL: url },
      });
    },
  );

  it('refuses a database url of another scheme without echoing it', () => {
    const result = readEnv({ DATABASE_URL: 'mysql://app:secret@localhost/app' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toHaveLength(1);
      expect(result.error[0]).toMatch(/^config DATABASE_URL: /);
      expect(result.error[0]).not.toContain('secret');
    }
  });

  it('defaults the signer url when it is unset', () => {
    expect(readEnv({})).toMatchObject({
      ok: true,
      value: { TIKTOK_SIGNER_URL: 'http://localhost:8080' },
    });
  });

  it('names the variable when a signer url is not a url', () => {
    const result = readEnv({ TIKTOK_SIGNER_URL: 'localhost' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error[0]).toMatch(/^config TIKTOK_SIGNER_URL: /);
  });

  it('names the position of an unknown source without echoing it', () => {
    const result = readEnv({ VERIFICATION_SOURCE_ORDER: 'scraper, some.account' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toHaveLength(1);
      expect(result.error[0]).toMatch(/^config VERIFICATION_SOURCE_ORDER\.1: /);
      expect(result.error[0]).not.toContain('some.account');
    }
  });
});
