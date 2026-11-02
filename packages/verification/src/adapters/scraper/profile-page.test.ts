import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractUserDetail } from './profile-page.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('extractUserDetail', () => {
  it('reads the user detail of a public profile page', () => {
    expect(extractUserDetail(fixture('profile-public.html'))).toMatchObject({
      ok: true,
      value: {
        statusCode: 0,
        userInfo: {
          user: {
            uniqueId: 'tiktok',
            privateAccount: false,
            followingVisibility: 1,
            openFavorite: false,
          },
        },
      },
    });
  });

  it('reads the status of a missing profile page', () => {
    expect(extractUserDetail(fixture('profile-missing.html'))).toEqual({
      ok: true,
      value: { statusCode: 10221 },
    });
  });

  it('reports blocked when the page carries no rehydration data', () => {
    expect(extractUserDetail('<html><body>Please wait...</body></html>')).toEqual({
      ok: false,
      error: { kind: 'blocked', message: 'profile page carries no rehydration data' },
    });
  });

  it('reports parse when the rehydration data is not JSON', () => {
    const html = '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{oops</script>';
    expect(extractUserDetail(html)).toMatchObject({ ok: false, error: { kind: 'parse' } });
  });

  it('reports parse when the user detail misses a field', () => {
    const html =
      '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{"__DEFAULT_SCOPE__":{"webapp.user-detail":{"statusCode":0,"userInfo":{"user":{"id":"1"}}}}}</script>';
    expect(extractUserDetail(html)).toMatchObject({
      ok: false,
      error: { kind: 'parse', message: expect.stringContaining('secUid') as string },
    });
  });
});
