import { errorCode } from '@engagement-exchange/contracts';
import { describe, expect, it } from 'vitest';
import messages from './ar.json';

describe('the Arabic messages', () => {
  it('word every API error code', () => {
    expect(Object.keys(messages.errors).toSorted()).toEqual(errorCode.options.toSorted());
  });
});
