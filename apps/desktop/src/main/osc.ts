// OSC 9 notifications in the agent terminal's output: `ESC ] 9 ; text` ended by BEL or `ESC \`. Codex's TUI sends
// them with `tui.notification_method = "osc9"`; Claude Code with its iTerm2 notification channel.

const START = '\x1b]9;';
const SEQ = /\x1b\]9;([^\x07\x1b]*)(?:\x07|\x1b\\)/g;

/** The notification texts in `chunk`, and what to carry into the next chunk: a sequence it cut short. */
export function osc9(chunk: string, carry = ''): { texts: string[]; carry: string } {
  const s = carry + chunk;
  const texts: string[] = [];
  let end = 0;
  for (const m of s.matchAll(SEQ)) {
    if (!/^\d+;/.test(m[1])) texts.push(m[1]); // `9;4;…` is ConEmu's progress bar, not a notification
    end = m.index + m[0].length;
  }
  const open = s.indexOf(START, end);
  if (open !== -1) return { texts, carry: s.length - open > 4096 ? '' : s.slice(open) };
  const k = [3, 2, 1].find((n) => s.length - end >= n && START.startsWith(s.slice(-n)));
  return { texts, carry: k ? s.slice(-k) : '' };
}

// ponytail: told apart by wording (Codex's "Approval requested: …", "Codex wants to edit …", Claude's "… needs your
// permission …"); everything else is a finished turn. Codex's hooks.json would say it outright, if this misreads.
export const osc9Kind = (text: string) => (/approval|permission|wants to/i.test(text) ? 'permission' : 'idle');
