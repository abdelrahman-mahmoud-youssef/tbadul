import { describe, expect, it } from 'vitest';
import { parseContentId } from './content-id.ts';
import { sameIdentity } from './platform-scoped.ts';

const id = '7000000000000000000';

describe('parseContentId for tiktok', () => {
  it.each([
    id,
    `  ${id}  `,
    `https://www.tiktok.com/@some.user/video/${id}`,
    `https://www.tiktok.com/@some.user/video/${id}?is_from_webapp=1&sender_device=pc`,
    `tiktok.com/video/${id}`,
  ])('extracts the numeric id from %j', (input) => {
    expect(parseContentId('tiktok', input)).toEqual({
      ok: true,
      value: { platform: 'tiktok', value: id },
    });
  });

  it.each([
    ['https://vm.tiktok.com/ZMabcdef/', 'short_link_unsupported'],
    ['https://vt.tiktok.com/ZSabcdef/', 'short_link_unsupported'],
    ['https://www.tiktok.com/t/ZTabcdef/', 'short_link_unsupported'],
    ['', 'not_numeric'],
    ['abc', 'not_numeric'],
    ['https://www.tiktok.com/@some.user', 'not_numeric'],
  ])('rejects %j with reason %s', (input, reason) => {
    expect(parseContentId('tiktok', input)).toEqual({
      ok: false,
      error: { kind: 'invalid_content_id', input, reason },
    });
  });
});

describe('sameIdentity on content ids', () => {
  it('compares platform and id', () => {
    const a = parseContentId('tiktok', id);
    const b = parseContentId('tiktok', `https://www.tiktok.com/@x/video/${id}`);
    const c = parseContentId('tiktok', '1');
    if (!a.ok || !b.ok || !c.ok) throw new Error('fixtures must parse');
    expect(sameIdentity(a.value, b.value)).toBe(true);
    expect(sameIdentity(a.value, c.value)).toBe(false);
  });
});
