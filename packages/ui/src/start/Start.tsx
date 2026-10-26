// The desktop zero state: open a git repository (with a scope), or a recent one. A folder that is
// not a repository stays here with the reason. In a plain browser there is no bridge, so it says
// how to run the server instead.
import type { GitProbe, GitScope, Recent } from '@trove/core/types';
import { GitBranch, X } from 'lucide-react';
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
        <p>Run Trove on a git repository, then open the address it prints:</p>
        <code className="rounded-md bg-background px-3 py-2 font-mono text-[13px] text-foreground">trove serve --root &lt;repo&gt;</code>
      </CardContent>
    </Card>
  );
}

const NOT_A_REPO = 'Not a git repository. Try again.';
type Picked = { path: string; git: GitProbe | null };

function Picker() {
  const bridge = window.trove!;
  const [recents, setRecents] = useState<Recent[]>([]);
  const [notRepos, setNotRepos] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Picked | null>(null);
  const [dragging, setDragging] = useState(false);
  const reload = async () => {
    const list = await bridge.recents().catch(() => []);
    const probes = await Promise.all(list.map((r) => bridge.probe(r.path).catch(() => null)));
    setNotRepos(new Set(list.filter((_, k) => !probes[k]?.git).map((r) => r.path)));
    setRecents(list);
  };
  useEffect(() => { void reload(); }, []);
  // The app stages a folder here (a drop, or File > Open) by putting its path in the hash.
  useEffect(() => {
    const stage = () => {
      const path = decodeURIComponent(location.hash.slice(1));
      history.replaceState(null, '', location.pathname); // so staging the same path again is a change
      if (path) void bridge.probe(path).then((res) => setPicked(res ?? { path, git: null }), (e) => toast(errText(e)));
    };
    stage();
    addEventListener('hashchange', stage);
    return () => removeEventListener('hashchange', stage);
  }, []);
  const pick = async () => {
    try {
      const res = await bridge.pickFolder();
      if (res) setPicked(res);
    } catch (e) {
      toast(errText(e));
    }
  };
  const repo = picked?.git ? { path: picked.path, git: picked.git } : null;
  return (
    <div
      className={cn('flex w-full max-w-lg flex-col gap-4 rounded-xl outline-2 outline-offset-8 outline-transparent transition-[outline-color]', dragging && 'outline-dashed outline-border')}
      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={() => setDragging(false)}
    >
      <Card>
        <CardHeader><CardTitle className="text-foreground">{picked ? picked.path.split('/').at(-1) : 'Trove'}</CardTitle></CardHeader>
        <CardContent>
          {repo ? <RepoStep repo={repo} onBack={() => setPicked(null)} /> : (
            <div className="flex flex-col items-start gap-3">
              {picked && (
                <div className="flex w-full min-w-0 flex-col gap-1">
                  <span className="folder w-full text-left font-mono text-xs text-muted-foreground">{`\u200E${picked.path}\u200E`}</span>
                  <span role="alert" className="text-sm text-destructive">{NOT_A_REPO}</span>
                </div>
              )}
              <Button onClick={() => void pick()}><GitBranch />Open repository</Button>
            </div>
          )}
        </CardContent>
      </Card>
      {!repo && recents.length > 0 && (
        <Card className="gap-0 py-2">
          <CardHeader className="px-4 py-2"><CardTitle className="text-sm text-foreground">Recent</CardTitle></CardHeader>
          <ul>
            {recents.map((r, k) => {
              const bad = notRepos.has(r.path);
              const body = (
                <>
                  <span className="flex w-full items-center gap-2">
                    <span className="truncate font-medium text-foreground">{r.name}</span>
                    {bad ? <span className="text-xs text-destructive">{NOT_A_REPO}</span>
                      : r.scope === 'branch' && <span className="text-xs text-muted-foreground">{`branch vs ${r.base ?? 'base'}`}</span>}
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{ago(r.openedAt)}</span>
                  </span>
                  <span className="folder w-full text-left text-xs text-muted-foreground">{`\u200E${r.path}\u200E`}</span>
                </>
              );
              const row = 'flex min-w-0 flex-1 flex-col items-start rounded-md px-2 py-2 text-left';
              return (
                <li key={r.path}>
                  {k > 0 && <Separator />}
                  <div className="group flex items-center gap-2 px-2">
                    {bad ? <div className={cn(row, 'opacity-60')} aria-disabled>{body}</div> : (
                      <button className={cn(row, 'outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring')}
                        onClick={() => bridge.open({ path: r.path, scope: r.scope, base: r.base }).catch((e) => toast(errText(e)))}>
                        {body}
                      </button>
                    )}
                    <IconButton label={`Remove ${r.name} from recents`} tip="Remove" onClick={() => bridge.forget(r.path).then(reload)}><X /></IconButton>
                  </div>
                </li>
              );
            })}
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
  // With worktrees, any branch checked out in one opens that worktree; the others are switched to in the editor.
  const [branch, setBranch] = useState(git.branch ?? '');
  const chosen = git.local.find((b) => b.name === branch);
  const path = chosen?.worktree ?? repo.path;
  const bases = git.branches.filter((b) => b !== branch);
  return (
    <div className="flex flex-col gap-4">
      {git.worktrees.length > 1 ? (
        <div className="flex flex-col gap-1">
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger size="sm" className="w-full font-mono text-xs" aria-label="Branch"><GitBranch className="size-4 text-muted-foreground" aria-hidden /><SelectValue placeholder="detached HEAD" /></SelectTrigger>
            <SelectContent>
              {git.local.map((b) => (
                <SelectItem key={b.name} value={b.name} disabled={!b.current && !b.worktree} className="font-mono text-xs">{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {path !== repo.path && <span className="folder w-full text-left font-mono text-xs text-muted-foreground">{`\u200E${path}\u200E`}</span>}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm"><GitBranch className="size-4 text-muted-foreground" aria-hidden /><span className="font-mono text-foreground">{git.branch ?? 'detached HEAD'}</span></div>
      )}
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
        <Button onClick={() => window.trove!.open({ path, scope, base: scope === 'branch' ? base || null : null }).catch((e) => toast(errText(e)))}>Open</Button>
      </div>
    </div>
  );
}
