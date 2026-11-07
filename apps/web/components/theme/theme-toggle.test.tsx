import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderInArabic } from '@/testing/render';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.dataset['theme'] = 'light';
    localStorage.clear();
  });

  it('switches between light and dark and remembers the choice', async () => {
    renderInArabic(<ThemeToggle />);
    const toggle = screen.getByRole('button');

    await userEvent.click(toggle);
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');

    await userEvent.click(toggle);
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
