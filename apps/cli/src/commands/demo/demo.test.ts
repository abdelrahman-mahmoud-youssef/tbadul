import { content, handle, token } from '@engagement-exchange/verification/testing';
import { describe, expect, it } from 'vitest';
import { parseDemo } from './demo.ts';

describe('parseDemo', () => {
  it.each([
    [['profile', '@TikTok'], { command: 'profile', subject: handle('tiktok') }],
    [
      ['owns', 'tiktok', 'ee-7f3a'],
      { command: 'owns', subject: handle('tiktok'), token: token('ee-7f3a') },
    ],
    [
      ['follows', 'tiktok', 'https://www.tiktok.com/@tiktokcreators'],
      { command: 'follows', performer: handle('tiktok'), target: handle('tiktokcreators') },
    ],
    [
      ['liked', 'tiktok', '7000000000000000000'],
      { command: 'liked', performer: handle('tiktok'), content: content('7000000000000000000') },
    ],
  ])('parses %j', (positionals, demo) => {
    expect(parseDemo(positionals)).toEqual({ ok: true, value: demo });
  });

  it.each([
    [['follows', 'not valid', 'tiktok'], 'invalid handle: not valid'],
    [['liked', 'tiktok', 'abc'], 'invalid content: abc'],
    [['owns', 'tiktok', ' '], 'invalid bio token:  '],
  ])('refuses %j', (positionals, error) => {
    expect(parseDemo(positionals)).toEqual({ ok: false, error });
  });

  it('parses a watch with its interval and run count', () => {
    expect(
      parseDemo(['watch', 'follows', 'tiktok', 'tiktokcreators'], { every: '30', times: '4' }),
    ).toEqual({
      ok: true,
      value: {
        command: 'watch',
        performer: handle('tiktok'),
        target: handle('tiktokcreators'),
        every: 30,
        times: 4,
      },
    });
  });

  it('leaves the interval and run count of a watch unset when not given', () => {
    expect(parseDemo(['watch', 'follows', 'tiktok', 'tiktokcreators'])).toMatchObject({
      ok: true,
      value: { every: undefined, times: undefined },
    });
  });

  it.each([
    [{ every: '0' }, 'invalid --every: use a positive whole number'],
    [{ times: 'abc' }, 'invalid --times: use a positive whole number'],
    [{ every: '1.5', times: '-1' }, 'invalid --every, --times: use a positive whole number'],
  ])('refuses watch flags %j', (flags, error) => {
    expect(parseDemo(['watch', 'follows', 'tiktok', 'tiktokcreators'], flags)).toEqual({
      ok: false,
      error,
    });
  });

  it.each([
    [['watch', 'liked', 'tiktok', '7000000000000000000']],
    [['watch', 'follows', 'tiktok']],
    [['link', 'start', 'tiktok']],
    [['profile']],
    [['follows', 'tiktok']],
    [[]],
  ])('leaves %j to the other commands', (positionals) => {
    expect(parseDemo(positionals)).toBeUndefined();
  });
});
