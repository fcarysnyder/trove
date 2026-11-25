// Where the open file's text lives in the page: one .block-body per markdown block, or the HTML frame's body.
import { get, type State } from '../store';

/** Source lays out every line in the page: about 190 ms per MB measured, so past 1 MB (mostly inlined images) it is off. */
export const SOURCE_LIMIT = 1_000_000;
export const showsSource = (s: State = get()) => s.current?.kind === 'html' && s.htmlView === 'source' && s.current.text.length <= SOURCE_LIMIT;

export const frameEl = () => document.querySelector<HTMLIFrameElement>('iframe.doc-frame');
export const blockEl = (i: number) => document.querySelector<HTMLElement>(`.md .block[data-i="${i}"]`);
export function bodyOf(i: number | null): HTMLElement | null {
  if (get().current?.kind === 'html' && !showsSource()) return frameEl()?.contentDocument?.body ?? null;
  return i == null ? null : document.querySelector<HTMLElement>(`.md .block[data-i="${i}"] > .block-body`);
}
export const nodeEl = (n: Node) => (n.nodeType === 1 ? (n as Element) : n.parentElement);

/** Heading path for HTML: every h1-h6 before the node, each level replacing deeper ones. */
export function headingPath(doc: Document, node: Node) {
  const path: string[] = [];
  for (const h of doc.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    if (!(h.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
    const level = Number(h.tagName[1]);
    path.length = level - 1;
    path[level - 1] = h.textContent?.trim() ?? '';
  }
  return path.filter((h) => h !== undefined);
}
