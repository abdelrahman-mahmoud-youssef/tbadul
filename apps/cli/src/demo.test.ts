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

  it.each([[['link', 'start', 'tiktok']], [['profile']], [['follows', 'tiktok']], [[]]])(
    'leaves %j to the other commands',
    (positionals) => {
      expect(parseDemo(positionals)).toBeUndefined();
    },
  );
});
