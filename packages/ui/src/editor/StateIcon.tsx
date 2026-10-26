import { Circle, CircleCheck, FilePen, FilePlus, LoaderCircle, Lock, MessageSquare, Sparkles, type LucideIcon } from 'lucide-react';
import type { FileRow } from '@trove/core/types';
import { cn } from '@/lib/utils';
import { status, type IconName, type Names } from '@/lib/status';

export const ICONS: Record<IconName, LucideIcon> = {
  'circle-check': CircleCheck,
  sparkles: Sparkles,
  'file-pen': FilePen,
  'message-square': MessageSquare,
  'loader-circle': LoaderCircle,
  circle: Circle,
  'file-plus': FilePlus,
};
export const TONE: Record<string, string> = { accepted: 'text-good', updated: 'text-agent', drafts: 'text-dirty' };

export function Icon({ name, tone = '', label, className }: { name: IconName; tone?: string; label?: string; className?: string }) {
  const I = ICONS[name];
  return (
    <I
      className={cn('size-4 shrink-0 text-muted-foreground', TONE[tone], name === 'loader-circle' && 'animate-spin', className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}

/** A file's status icon, and a lock while the agent works on it. */
export function StateIcons({ file, names, className }: { file: FileRow; names: Names; className?: string }) {
  const s = status(file, names);
  return (
    <>
      <Icon name={s.icon} tone={s.tone} label={s.label} className={className} />
      {file.state === 'working' && <Lock className={cn('size-4 shrink-0 text-muted-foreground', className)} aria-hidden />}
    </>
  );
}
