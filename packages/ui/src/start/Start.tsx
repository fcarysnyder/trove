// The desktop zero state: open a folder or a git repository (with a scope), or a recent one.
// In a plain browser there is no bridge, so it says how to run the server instead.
import type { GitProbe, GitScope, Recent } from '@trove/core/types';
import { FolderOpen, GitBranch, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { applyTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { IconButton } from '@/editor/bits';
import { toast } from 'sonner';

const ago = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  const f = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (!Number.isFinite(s)) return '';
  if (s < 3600) return f.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return f.format(-Math.round(s / 3600), 'hour');
  return f.format(-Math.round(s / 86400), 'day');
};
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function Start() {
  useEffect(() => applyTheme('system'), []);
  useEffect(() => { document.title = 'Trove'; }, []);
  return (
    <TooltipProvider delayDuration={300}>
      <main className="grid min-h-screen place-items-center p-6">
        {window.trove ? <Picker /> : <NoBridge />}
      </main>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}

function NoBridge() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader><CardTitle className="text-foreground">Trove</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p>Run Trove from a folder or a git repository, then open the address it prints:</p>
        <code className="rounded-md bg-background px-3 py-2 font-mono text-[13px] text-foreground">trove serve</code>
      </CardContent>
    </Card>
  );
}

function Picker() {
  const bridge = window.trove!;
  const [recents, setRecents] = useState<Recent[]>([]);
  const [repo, setRepo] = useState<{ path: string; git: GitProbe } | null>(null);
  const [dragging, setDragging] = useState(false);
  const reload = () => bridge.recents().then(setRecents, () => setRecents([]));
  useEffect(() => { void reload(); }, []);
  const pick = async () => {
    try {
      const res = await bridge.pickFolder();
      if (!res) return;
      if (res.git) setRepo({ path: res.path, git: res.git });
      else await bridge.open({ path: res.path });
    } catch (e) {
      toast(errText(e));
    }
  };
  return (
    <div
      className={cn('flex w-full max-w-lg flex-col gap-4 rounded-xl outline-2 outline-offset-8 outline-transparent transition-[outline-color]', dragging && 'outline-dashed outline-border')}
      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={() => setDragging(false)}
    >
      <Card>
        <CardHeader><CardTitle className="text-foreground">{repo ? repo.path.split('/').at(-1) : 'Trove'}</CardTitle></CardHeader>
        <CardContent>
          {repo ? <RepoStep repo={repo} onBack={() => setRepo(null)} /> : (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => void pick()}><FolderOpen />Open folder</Button>
              <Button variant="ghost" onClick={() => void pick()}><GitBranch />Open git repository</Button>
            </div>
          )}
        </CardContent>
      </Card>
      {!repo && recents.length > 0 && (
        <Card className="gap-0 py-2">
          <CardHeader className="px-4 py-2"><CardTitle className="text-sm text-foreground">Recent</CardTitle></CardHeader>
          <ul>
            {recents.map((r, k) => (
              <li key={r.path}>
                {k > 0 && <Separator />}
                <div className="group flex items-center gap-2 px-2">
                  <button className="flex min-w-0 flex-1 flex-col items-start rounded-md px-2 py-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => bridge.open({ path: r.path, scope: r.scope, base: r.base }).catch((e) => toast(errText(e)))}>
                    <span className="flex w-full items-center gap-2">
                      <span className="truncate font-medium text-foreground">{r.name}</span>
                      <span className="text-xs text-muted-foreground">{r.kind === 'git' ? (r.scope === 'branch' ? `git · branch vs ${r.base ?? 'base'}` : 'git') : 'folder'}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{ago(r.openedAt)}</span>
                    </span>
                    <span className="folder w-full text-left text-xs text-muted-foreground">{`‎${r.path}‎`}</span>
                  </button>
                  <IconButton label={`Remove ${r.name} from recents`} tip="Remove" onClick={() => bridge.forget(r.path).then(reload)}><X /></IconButton>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function RepoStep({ repo, onBack }: { repo: { path: string; git: GitProbe }; onBack: () => void }) {
  const { git } = repo;
  const [scope, setScope] = useState<GitScope>('uncommitted');
  const [base, setBase] = useState(git.defaultBase ?? git.branches[0] ?? '');
  const bases = git.branches.filter((b) => b !== git.branch);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm"><GitBranch className="size-4 text-muted-foreground" aria-hidden /><span className="font-mono text-foreground">{git.branch ?? 'detached HEAD'}</span></div>
      <RadioGroup value={scope} onValueChange={(v) => setScope(v as GitScope)} className="gap-3">
        <div className="flex items-center gap-2">
          <RadioGroupItem id="scope-uncommitted" value="uncommitted" />
          <Label htmlFor="scope-uncommitted" className="font-normal text-foreground">Uncommitted changes</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem id="scope-branch" value="branch" disabled={!bases.length} />
          <Label htmlFor="scope-branch" className="font-normal text-foreground">Branch vs base</Label>
          <Select value={base} onValueChange={setBase} disabled={scope !== 'branch'}>
            <SelectTrigger size="sm" className="ml-auto w-[200px] font-mono text-xs" aria-label="Base"><SelectValue /></SelectTrigger>
            <SelectContent>{bases.map((b) => <SelectItem key={b} value={b} className="font-mono text-xs">{b}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </RadioGroup>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button onClick={() => window.trove!.open({ path: repo.path, scope, base: scope === 'branch' ? base || null : null }).catch((e) => toast(errText(e)))}>Open</Button>
      </div>
    </div>
  );
}
