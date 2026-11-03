import { describe, expect, it } from 'vitest';
import { readEnv } from './config.ts';

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
        OUTBOUND_TIMEOUT_MS: 15_000,
        CLAIMS_FILE: 'claims.local.json',
        CLI_USER_ID: 'local',
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
        CLAIMS_FILE: '',
        CLI_USER_ID: '',
      }),
    ).toMatchObject({
      ok: true,
      value: {
        TIKTOK_SIGNER_URL: 'http://localhost:8080',
        VERIFICATION_ACCOUNTS: [],
        OUTBOUND_TIMEOUT_MS: 15_000,
        CLAIMS_FILE: 'claims.local.json',
        CLI_USER_ID: 'local',
      },
    });
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
