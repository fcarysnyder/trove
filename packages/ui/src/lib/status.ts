// Review state -> label, icon and words, one rule for the tree, the footer and the progress pill.
import { stateOf, type ReviewState } from '@trove/core/anchor';
import { AGENT_LABELS, type FileRow } from '@trove/core/types';

export type IconName = 'circle-check' | 'sparkles' | 'file-pen' | 'message-square' | 'loader-circle' | 'circle' | 'file-plus' | 'circle-dashed' | 'circle-x';

/**
 * The attached agent's label (AgentInfo.label), as said mid-sentence (agent), to start one (Agent), and as a sender (who);
 * `folder`: the source is a folder, where Accept marks a file reviewed.
 */
export const names = (label: string, folder = false) => {
  const Agent = label.charAt(0).toUpperCase() + label.slice(1);
  return { agent: label, Agent, who: label === AGENT_LABELS.other ? 'Your agent' : Agent, folder };
};
export type Names = ReturnType<typeof names>;

/** The pill's order. Only Accepted names its git state: Accept is the one action that stages. */
export const PROGRESS: ReviewState[] = ['accepted', 'updated', 'edited', 'drafts', 'working', 'skipped', 'pending', 'rejected'];

export function stateInfo(s: ReviewState, n: Names): { label: string; icon: IconName; words: string } {
  switch (s) {
    case 'accepted': return n.folder ? { label: 'Reviewed', icon: 'circle-check', words: 'reviewed' } : { label: 'Accepted (staged)', icon: 'circle-check', words: 'accepted' };
    case 'updated': return { label: `Updated by ${n.agent}`, icon: 'sparkles', words: `updated by ${n.agent}` };
    case 'edited': return { label: 'Edited', icon: 'file-pen', words: 'edited' };
    case 'drafts': return { label: 'Has comments', icon: 'message-square', words: 'with comments' };
    case 'working': return { label: `${n.Agent} is working`, icon: 'loader-circle', words: `with ${n.agent}` };
    case 'skipped': return { label: 'Skipped', icon: 'circle-dashed', words: 'skipped' };
    case 'pending': return { label: 'Pending', icon: 'circle', words: 'pending' };
    case 'rejected': return { label: 'Rejected', icon: 'circle-x', words: 'rejected' };
  }
}

/** A folder's file nobody reviewed and this review has not touched: a plain file in the tree, left out of the counts. */
export const plain = (f: Pick<FileRow, 'state' | 'unreviewed'>) => !!f.unreviewed && f.state === 'accepted';

/** One file's status; a pending untracked file reads as newly added. `tone` is its colour class key. */
export function status(f: Pick<FileRow, 'state' | 'updated' | 'edited' | 'drafts' | 'untracked' | 'unreviewed'>, n: Names) {
  const s = stateOf(f);
  if (plain(f)) return { state: s, label: 'Not reviewed', icon: 'circle-dashed' as IconName, tone: '' };
  if (s === 'pending' && f.untracked) return { state: s, label: 'Newly added', icon: 'file-plus' as IconName, tone: '' };
  const { label, icon } = stateInfo(s, n);
  return { state: s, label, icon, tone: s === 'pending' || s === 'working' ? '' : s };
}

type Listed = Pick<FileRow, 'path' | 'state' | 'committed'>;

/** In the tree's folders: committed and rejected files have sections of their own. */
export const inFolders = (f: Listed) => !f.committed && f.state !== 'rejected';

/** j/k: the next or previous file the tree shows (`shown`), by position in the full list (so it works from a file outside them), passing over skipped ones. */
export function stepFrom<T extends Listed>(files: T[], current: string | undefined, dir: 1 | -1, shown: (f: T) => boolean): T | undefined {
  const at = files.findIndex((f) => f.path === current);
  const list = files.filter((f, i) => inFolders(f) && shown(f) && f.state !== 'skipped' && (dir > 0 ? i > at : i < at));
  return dir > 0 ? list[0] : list.at(-1);
}
