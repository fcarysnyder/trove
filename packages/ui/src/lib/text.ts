import type { DocKind } from '@trove/core/types';

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const dirOf = (path: string) => path.split('/').slice(0, -1).join('/');
export const nameOf = (path: string) => path.split('/').at(-1) ?? path;
/** LRM marks keep a folder's slashes in order inside the rtl box that truncates its start. */
export const folderText = (dir: string) => `\u200E${dir}/\u200E`;
/** The old server sends no kind; the extension decides. */
export const kindOf = (path: string, kind?: DocKind): DocKind =>
  kind ?? (/\.html?$/i.test(path) ? 'html' : /\.txt$/i.test(path) ? 'text' : 'markdown');
export const mod = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? 'Cmd' : 'Ctrl';
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// ponytail: home is guessed from the path (/Users/<name>, /home/<name>); the server could send it if that misses.
export const tilde = (p: string) => p.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, '~');
