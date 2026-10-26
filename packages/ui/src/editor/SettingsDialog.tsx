// Settings for this source, shaped like Hyperion's site settings: a rail of categories, a pane of
// rows under a sticky title, and nothing written until Save.
import { DEFAULT_DOC_TYPES, type GitScope, type Settings, type Theme } from '@trove/core/types';
import { Settings as Gear, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { diffSettings, parseExclude, typeOn } from '@/lib/settings';
import { plural } from '@/lib/text';
import { cn } from '@/lib/utils';
import { saveSettings } from './actions';
import { IconButton } from './bits';
import { get, set, useStore } from './store';

const CATEGORIES = ['General', 'Documents', 'Source'] as const;
type Category = (typeof CATEGORIES)[number];

export function SettingsDialog() {
  const open = useStore((s) => s.settingsOpen);
  return (
    <Dialog open={open} onOpenChange={(o) => set({ settingsOpen: o })}>
      <DialogContent aria-describedby={undefined} showCloseButton={false}
        className="flex h-[85vh] w-[calc(100vw-80px)] max-w-[880px] gap-0 overflow-hidden rounded-lg border bg-background p-0 ring-0 sm:max-w-[880px]">
        {open && <Body />}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, note, htmlFor, children }: { label: string; note?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-6 py-3.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label htmlFor={htmlFor} className="text-sm font-semibold text-foreground">{label}</Label>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      <div className="flex min-h-9 shrink-0 items-center">{children}</div>
    </li>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <Row label={label}>
      <code className="folder max-w-[420px] font-mono text-xs text-body" title={value ?? undefined}>{`\u200E${value ?? '–'}\u200E`}</code>
    </Row>
  );
}

function Body() {
  const saved = useStore((s) => s.settings);
  const source = useStore((s) => s.source);
  const [category, setCategory] = useState<Category>('General');
  const [draft, setDraft] = useState<Settings>(() => get().settings);
  const [exclude, setExclude] = useState(() => get().settings.exclude.join('\n'));
  const [saving, setSaving] = useState(false);
  const full = { ...draft, exclude: parseExclude(exclude) };
  const { patch, changes } = diffSettings(saved, full);
  const edit = (p: Partial<Settings>) => setDraft((d) => ({ ...d, ...p }));
  const clear = () => { setDraft(saved); setExclude(saved.exclude.join('\n')); };
  const save = async () => {
    setSaving(true);
    try {
      await saveSettings(patch);
      set({ settingsOpen: false });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const panes: Record<Category, ReactNode> = {
    General: (
      <>
        <Row label="Theme" htmlFor="set-theme">
          <Select value={draft.theme} onValueChange={(v) => edit({ theme: v as Theme })}>
            <SelectTrigger id="set-theme" size="sm" className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Show new" htmlFor="set-show-new">
          <Switch id="set-show-new" checked={draft.showNew} onCheckedChange={(v) => edit({ showNew: v })} />
        </Row>
      </>
    ),
    Documents: (
      <>
        {DEFAULT_DOC_TYPES.map((t) => (
          <Row key={t.id} label={t.label} note={t.extensions.join(', ')} htmlFor={`set-type-${t.id}`}>
            <Switch id={`set-type-${t.id}`} checked={typeOn(draft, t)} onCheckedChange={(v) => edit({ types: { ...draft.types, [t.id]: v } })} />
          </Row>
        ))}
        <Row label="Exclude" htmlFor="set-exclude">
          <Textarea id="set-exclude" value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="drafts/**" spellCheck={false}
            className="min-h-24 w-[280px] font-mono text-xs md:text-xs" />
        </Row>
      </>
    ),
    Source: (
      <>
        <Row label="Scope" htmlFor="set-scope">
          <Select value={draft.scope} onValueChange={(v) => edit({ scope: v as GitScope })}>
            <SelectTrigger id="set-scope" size="sm" className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="uncommitted">Uncommitted changes</SelectItem>
              <SelectItem value="branch">Branch vs base</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Base" htmlFor="set-base">
          <Input id="set-base" value={draft.base ?? ''} disabled={draft.scope !== 'branch'} placeholder={source?.base ?? 'auto'} spellCheck={false}
            onChange={(e) => edit({ base: e.target.value.trim() || null })} className="h-8 w-[200px] font-mono text-xs md:text-xs" />
        </Row>
        <Fact label="Branch" value={source?.branch ?? null} />
        <Fact label="Repository" value={source?.root ?? null} />
        <Fact label="Review state" value={source?.stateDir ?? null} />
      </>
    ),
  };

  return (
    <div className="flex min-h-0 w-full flex-1">
      <aside className="flex w-[216px] shrink-0 flex-col gap-2.5 bg-card p-2.5">
        <div className="flex h-8 items-center gap-2 px-1.5 font-semibold text-foreground"><Gear className="size-4" aria-hidden />Settings</div>
        <nav aria-label="Settings categories" className="flex flex-col gap-0.5">
          {CATEGORIES.map((c) => (
            <Button key={c} variant="ghost" size="sm" aria-current={c === category ? 'page' : undefined} onClick={() => setCategory(c)}
              className={cn('w-full justify-start px-2', c === category && 'bg-accent text-foreground')}>
              {c}
            </Button>
          ))}
        </nav>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 grow flex-col overflow-y-auto px-5 pb-5">
          <div className="sticky top-0 z-10 flex items-center bg-background pt-5 pb-2">
            <DialogTitle className="flex-1 text-base font-semibold text-foreground">{category}</DialogTitle>
            <IconButton label="Close" className="-mr-1" onClick={() => set({ settingsOpen: false })}><X /></IconButton>
          </div>
          <ul className="flex flex-col divide-y">{panes[category]}</ul>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2.5 border-t px-5 py-3">
          {changes === 0 ? (
            <DialogClose asChild><Button variant="ghost" size="sm">Cancel</Button></DialogClose>
          ) : (
            <Button variant="ghost" size="sm" onClick={clear}>Clear changes</Button>
          )}
          <Button size="sm" disabled={!changes || saving} onClick={() => void save()}>
            {changes ? `Save ${plural(changes, 'change')}` : 'Save'}
          </Button>
        </div>
      </section>
    </div>
  );
}
