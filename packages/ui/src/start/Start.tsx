// The desktop start page, a three-step wizard: 1 Repository (open a git repository with a scope, or a
// recent one; a folder that is not a repository stays here with the reason), 2 Agent (start Claude Code
// or Codex in Terminal, attached to the repository's server), 3 Editor (the repository's own window).
// In a plain browser there is no bridge, so it says how to run the server instead.
import { attachCommand, type AgentTool, type GitProbe, type GitScope, type Recent } from '@trove/core/types';
import { Copy, GitBranch, X } from 'lucide-react';
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
/** What step 1 chose: the window to open, and the agent the repository had last time. */
type Target = { path: string; scope?: GitScope; base?: string | null; agent?: AgentTool | null };
const nameOf = (path: string) => path.split('/').at(-1);

function Steps({ current }: { current: 1 | 2 }) {
  return (
    <ol className="flex gap-4 text-sm text-muted-foreground" aria-label="Steps">
      {['Repository', 'Agent', 'Editor'].map((label, i) => (
        <li key={label} aria-current={i + 1 === current ? 'step' : undefined} className={cn(i + 1 === current && 'font-medium text-foreground')}>{`${i + 1} ${label}`}</li>
      ))}
    </ol>
  );
}

function Picker() {
  const bridge = window.trove!;
  const [recents, setRecents] = useState<Recent[]>([]);
  const [notRepos, setNotRepos] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Picked | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
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
      if (path) void bridge.probe(path).then((res) => { setTarget(null); setPicked(res ?? { path, git: null }); }, (e) => toast(errText(e)));
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
  const next = (t: Target) => setTarget({ agent: recents.find((r) => r.path === t.path)?.agent, ...t });
  return (
    <div
      className={cn('flex w-full max-w-lg flex-col gap-4 rounded-xl outline-2 outline-offset-8 outline-transparent transition-[outline-color]', dragging && 'outline-dashed outline-border')}
      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={() => setDragging(false)}
    >
      <Card>
        <CardHeader className="gap-3">
          <Steps current={target ? 2 : 1} />
          <CardTitle className="text-foreground">{target ? nameOf(target.path) : picked ? nameOf(picked.path) : 'Trove'}</CardTitle>
        </CardHeader>
        <CardContent>
          {target ? <AgentStep key={target.path} target={target} onBack={() => setTarget(null)} />
            : repo ? <RepoStep repo={repo} onBack={() => setPicked(null)} onNext={next} /> : (
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
      {!repo && !target && recents.length > 0 && (
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
                        onClick={() => setTarget({ path: r.path, scope: r.scope, base: r.base, agent: r.agent })}>
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

function RepoStep({ repo, onBack, onNext }: { repo: { path: string; git: GitProbe }; onBack: () => void; onNext: (t: Target) => void }) {
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
        <Button onClick={() => onNext({ path, scope, base: scope === 'branch' ? base || null : null })}>Next</Button>
      </div>
    </div>
  );
}

type Choice = AgentTool | 'none';
const CHOICES: [Choice, string, string][] = [['claude', 'Claude Code', 'bg-agent-claude'], ['codex', 'Codex', 'bg-agent-codex'], ['none', 'None for now', 'bg-muted-foreground']];

/** Step 2: which agent to start beside the editor. The server picks its port on open, so the command shows <port> until then. */
function AgentStep({ target, onBack }: { target: Target; onBack: () => void }) {
  const bridge = window.trove!;
  const [choice, setChoice] = useState<Choice>(target.agent === null ? 'none' : target.agent ?? 'claude');
  const [tools, setTools] = useState<Record<AgentTool, boolean> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void bridge.tools().then(setTools, () => {}); }, []);
  const go = (agent: AgentTool | null) => {
    setBusy(true);
    bridge.open({ path: target.path, scope: target.scope, base: target.base, agent }).catch((e) => toast(errText(e))).finally(() => setBusy(false));
  };
  const command = choice === 'none' ? null : attachCommand(choice, target.path, '<port>');
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast('Copied'), () => toast('Copy failed'));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <RadioGroup value={choice} onValueChange={(v) => setChoice(v as Choice)} className="gap-3" aria-label="Agent">
          {CHOICES.map(([value, label, dot]) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem id={`agent-${value}`} value={value} />
              <Label htmlFor={`agent-${value}`} className="font-normal text-foreground">
                <span className={cn('size-2 rounded-full', dot)} aria-hidden />{label}
              </Label>
            </div>
          ))}
        </RadioGroup>
        {choice !== 'none' && tools && !tools[choice] && <span role="status" className="text-sm text-muted-foreground">{`${choice} is not installed`}</span>}
      </div>
      {command && (
        <div className="flex items-start gap-1">
          <code className="min-w-0 flex-1 rounded-sm bg-background px-2 py-1 font-mono text-xs break-all text-foreground">{command}</code>
          <IconButton label="Copy command" onClick={() => copy(command)}><Copy /></IconButton>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="text-muted-foreground" disabled={busy} onClick={() => go(null)}>Skip</Button>
        <Button variant="ghost" className="ml-auto" onClick={onBack}>Back</Button>
        <Button disabled={busy} onClick={() => go(choice === 'none' ? null : choice)}>{choice === 'none' ? 'Open editor' : 'Launch'}</Button>
      </div>
    </div>
  );
}
