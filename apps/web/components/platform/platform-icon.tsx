import { siInstagram, siTiktok, siX, siYoutube, type SimpleIcon } from 'simple-icons';
import type { PlatformId } from '@/lib/platforms';

const brands: Record<PlatformId, SimpleIcon> = {
  tiktok: siTiktok,
  instagram: siInstagram,
  youtube: siYoutube,
  x: siX,
};

const blackHex = '000000';

interface PlatformIconProps {
  readonly id: PlatformId;
  readonly muted?: boolean;
}

export function PlatformIcon({ id, muted = false }: PlatformIconProps) {
  const { path, hex } = brands[id];
  const fill = muted || hex === blackHex ? 'currentColor' : `#${hex}`;
  return (
    <span
      aria-hidden="true"
      className={`grid size-12 shrink-0 place-items-center rounded-xl ${
        muted ? 'bg-muted text-muted-foreground' : 'bg-secondary text-secondary-foreground'
      }`}
    >
      <svg viewBox="0 0 24 24" fill={fill} className="size-6">
        <path d={path} />
      </svg>
    </span>
  );
}
