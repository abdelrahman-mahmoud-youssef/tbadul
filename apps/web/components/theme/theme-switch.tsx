import { getTranslations } from 'next-intl/server';
import { ThemeToggle } from './theme-toggle';

export async function ThemeSwitch() {
  const t = await getTranslations('theme');
  return <ThemeToggle toDark={t('toDark')} toLight={t('toLight')} />;
}
