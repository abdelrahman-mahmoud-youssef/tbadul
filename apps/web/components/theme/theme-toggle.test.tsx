import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.dataset['theme'] = 'light';
    localStorage.clear();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('switches between light and dark and remembers the choice', async () => {
    render(<ThemeToggle toDark="داكن" toLight="فاتح" />);
    const toggle = screen.getByRole('button');

    await userEvent.click(toggle);
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');

    await userEvent.click(toggle);
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
