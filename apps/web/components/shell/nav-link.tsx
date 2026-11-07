'use client';

import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';
import type { ReactNode } from 'react';

interface NavLinkProps {
  readonly href: string;
  readonly segment: string;
  readonly icon: ReactNode;
  readonly label: string;
}

export function NavLink({ href, segment, icon, label }: NavLinkProps) {
  const current = useSelectedLayoutSegment() === segment;
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={`flex min-h-14 min-w-18 flex-col items-center justify-center gap-0.5 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&_svg]:size-6 ${
        current
          ? 'bg-secondary text-secondary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}
