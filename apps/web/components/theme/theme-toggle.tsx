'use client';

import { Moon, Sun } from 'lucide-react';
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { themeStorageKey } from './theme-script';

const flip = () => {
  const root = document.documentElement;
  const next = root.dataset['theme'] === 'dark' ? 'light' : 'dark';
  root.dataset['theme'] = next;
  localStorage.setItem(themeStorageKey, next);
};

export function ThemeToggle() {
  const t = useTranslations('theme');
  const [flips, setFlips] = useState(0);
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        flip();
        setFlips((count) => count + 1);
      }}
    >
      <span className="sr-only dark:hidden">{t('toDark')}</span>
      <span className="sr-only hidden dark:inline">{t('toLight')}</span>
      <MotionConfig reducedMotion="user">
        <LazyMotion features={domAnimation} strict>
          <AnimatePresence initial={false} mode="wait">
            <m.span
              key={flips}
              aria-hidden="true"
              className="grid"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Moon className="col-start-1 row-start-1 dark:invisible" />
              <Sun className="invisible col-start-1 row-start-1 dark:visible" />
            </m.span>
          </AnimatePresence>
        </LazyMotion>
      </MotionConfig>
    </Button>
  );
}
