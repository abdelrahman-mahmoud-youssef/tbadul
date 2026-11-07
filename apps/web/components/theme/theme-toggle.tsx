'use client';

import { Moon, Sun } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { themeStorageKey } from './theme-script';

interface ThemeToggleProps {
  readonly toDark: string;
  readonly toLight: string;
}

const turn = async (icon: HTMLElement): Promise<void> => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const { animate } = await import('motion/mini');
  await animate(icon, { rotate: [-90, 0], opacity: [0, 1] }, { duration: 0.2 });
};

export function ThemeToggle({ toDark, toLight }: ThemeToggleProps) {
  const icon = useRef<HTMLSpanElement>(null);
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        const root = document.documentElement;
        const next = root.dataset['theme'] === 'dark' ? 'light' : 'dark';
        root.dataset['theme'] = next;
        localStorage.setItem(themeStorageKey, next);
        if (icon.current !== null) void turn(icon.current);
      }}
    >
      <span className="sr-only dark:hidden">{toDark}</span>
      <span className="sr-only hidden dark:inline">{toLight}</span>
      <span ref={icon} aria-hidden="true" className="grid">
        <Moon className="col-start-1 row-start-1 dark:invisible" />
        <Sun className="invisible col-start-1 row-start-1 dark:visible" />
      </span>
    </Button>
  );
}
