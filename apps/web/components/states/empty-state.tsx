import type { ReactNode } from 'react';

interface EmptyStateProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly body: string;
  readonly action?: ReactNode;
}

export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <section className="@container flex flex-col items-center gap-4 rounded-2xl border border-dashed border-input bg-card px-6 py-10 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-secondary text-secondary-foreground [&_svg]:size-7">
        {icon}
      </div>
      <div className="flex max-w-prose flex-col gap-1">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-muted-foreground">{body}</p>
      </div>
      {action}
    </section>
  );
}
