import { describe, expect, it } from 'vitest';
import { localizedPath } from './paths';

describe('localizedPath', () => {
  it('leaves paths of the default locale without a prefix', () => {
    expect(localizedPath('/', 'ar')).toBe('/');
    expect(localizedPath('/accounts', 'ar')).toBe('/accounts');
  });
});
