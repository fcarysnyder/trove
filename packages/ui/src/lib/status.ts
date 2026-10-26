// Review state -> label, icon and words, one rule for the tree, the footer and the progress pill.
import { stateOf, type ReviewState } from '@trove/core/anchor';
import type { FileRow } from '@trove/core/types';

export type IconName = 'circle-check' | 'sparkles' | 'file-pen' | 'message-square' | 'loader-circle' | 'circle' | 'file-plus';

/** The agent serving the page, as said mid-sentence (agent), to start one (Agent), and as a sender (who). */
export const names = (agent: 'claude' | 'other') =>
  agent === 'claude' ? { agent: 'Claude', Agent: 'Claude', who: 'Claude' } : { agent: 'the agent', Agent: 'The agent', who: 'Your agent' };
export type Names = ReturnType<typeof names>;

/** The pill's order. Only Accepted names its git state: Accept is the one action that stages. */
export const PROGRESS: ReviewState[] = ['accepted', 'updated', 'edited', 'drafts', 'working', 'pending'];

export function stateInfo(s: ReviewState, n: Names): { label: string; icon: IconName; words: string } {
  switch (s) {
    case 'accepted': return { label: 'Accepted (staged)', icon: 'circle-check', words: 'accepted' };
    case 'updated': return { label: `Updated by ${n.agent}`, icon: 'sparkles', words: `updated by ${n.agent}` };
    case 'edited': return { label: 'Edited', icon: 'file-pen', words: 'edited' };
    case 'drafts': return { label: 'Has comments', icon: 'message-square', words: 'with comments' };
    case 'working': return { label: `${n.Agent} is working`, icon: 'loader-circle', words: `with ${n.agent}` };
    case 'pending': return { label: 'Pending', icon: 'circle', words: 'pending' };
  }
}

/** One file's status; a pending untracked file reads as newly added. `tone` is its colour class key. */
export function status(f: Pick<FileRow, 'state' | 'updated' | 'edited' | 'drafts' | 'untracked'>, n: Names) {
  const s = stateOf(f);
  if (s === 'pending' && f.untracked) return { state: s, label: 'Newly added', icon: 'file-plus' as IconName, tone: '' };
  const { label, icon } = stateInfo(s, n);
  return { state: s, label, icon, tone: s === 'pending' || s === 'working' ? '' : s };
}
