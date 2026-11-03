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
      TIKTOK_SIGNER_URL: 'http://localhost:8080',
      VERIFICATION_ACCOUNTS: ['verify.one', 'verify.two'],
      VERIFICATION_SOURCE_ORDER: ['scraper'],
      OUTBOUND_TIMEOUT_MS: 15_000,
      CLAIMS_FILE: 'claims.local.json',
      CLI_USER_ID: 'local',
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
      TIKTOK_SIGNER_URL: 'http://localhost:8080',
      VERIFICATION_ACCOUNTS: [],
      VERIFICATION_SOURCE_ORDER: ['scraper'],
      OUTBOUND_TIMEOUT_MS: 15_000,
      CLAIMS_FILE: 'claims.local.json',
      CLI_USER_ID: 'local',
    });
  });

  it('defaults the signer url when it is unset', () => {
    expect(readEnv({}).TIKTOK_SIGNER_URL).toBe('http://localhost:8080');
  });

  it('rejects a signer url that is not a url', () => {
    expect(() => readEnv({ TIKTOK_SIGNER_URL: 'localhost' })).toThrow();
  });
});
