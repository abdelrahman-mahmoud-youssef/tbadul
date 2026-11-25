import { AtSign, Camera, Music2, Play, type LucideIcon } from 'lucide-react';
import type { PlatformId } from '@/lib/platforms';

const icons: Record<PlatformId, LucideIcon> = {
  tiktok: Music2,
  instagram: Camera,
  youtube: Play,
  x: AtSign,
};

interface PlatformIconProps {
  readonly id: PlatformId;
  readonly muted?: boolean;
}

export function PlatformIcon({ id, muted = false }: PlatformIconProps) {
  const Icon = icons[id];
  return (
    <span
      aria-hidden="true"
      className={`grid size-12 shrink-0 place-items-center rounded-xl [&_svg]:size-6 ${
        muted ? 'bg-muted text-muted-foreground' : 'bg-secondary text-secondary-foreground'
      }`}
    >
      <Icon />
    </span>
  );
}
