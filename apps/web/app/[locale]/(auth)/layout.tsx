import { Wordmark } from '@/components/brand/wordmark';
import { ThemeSwitch } from '@/components/theme/theme-switch';

export default function AuthLayout({ children }: LayoutProps<'/[locale]'>) {
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="mx-auto flex w-full max-w-md items-center justify-between gap-4 px-4 py-3">
        <Wordmark />
        <ThemeSwitch />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-6 pb-16">
        {children}
      </main>
    </div>
  );
}
