'use client';

import { cn } from 'cn';
import type { ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';

interface NavLinkProps {
  readonly href: '/accounts' | '/admin';
  readonly icon: ReactNode;
  readonly label: string;
}

export function NavLink({ href, icon, label }: NavLinkProps) {
  const current = usePathname().startsWith(href);
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'flex min-h-14 min-w-18 flex-col items-center justify-center gap-0.5 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&_svg]:size-6',
        current
          ? 'bg-secondary text-secondary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
