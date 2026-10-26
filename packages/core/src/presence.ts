// Which process an attached agent is, so the page can tell when it has gone. `trove attach` runs in a
// shell the agent started: the server finds the process on the other end of that request with lsof and
// walks up its parents to the agent's own (claude or codex). macOS and Linux; anywhere that fails the
// pid is null and attached means connected, as before.
// ponytail: a pid can be reused after the agent exits; compare start times if a stale "connected" shows up.
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import type { AgentId } from './types.js';

const out = (cmd: string, args: string[]) => {
  try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }); } catch { return null; }
};

/** The process with the other end of a local TCP connection whose client side is `port`. */
export function peerOf(port: number): number | null {
  const pids = (out('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:ESTABLISHED']) ?? '').split('\n').map(Number);
  return pids.find((p) => p > 0 && p !== process.pid) ?? null;
}

/** The nearest process at or above `pid` that is the `id` agent: its executable, or node running it. */
export function agentAbove(pid: number | null, id: AgentId): number | null {
  if (id === 'other') return null;
  for (let hops = 0; pid && pid > 1 && hops < 30; hops++) {
    const line = out('ps', ['-o', 'ppid=', '-o', 'comm=', '-p', String(pid)])?.trim();
    if (!line) return null;
    const [, ppid, comm] = line.match(/^(\d+)\s+(.*)$/) ?? [];
    const exe = basename(comm ?? '');
    if (exe === id) return pid;
    if (exe === 'node' && new RegExp(`/${id}(?:-code)?[/\\s]|/${id}$`).test(out('ps', ['-o', 'args=', '-p', String(pid)]) ?? '')) return pid;
    pid = Number(ppid);
  }
  return null;
}

export const alive = (pid: number) => {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
};
