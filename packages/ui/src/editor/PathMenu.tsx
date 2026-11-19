// A file path's right-click menu, and copying a path with a toast. Wrap anything that shows a path:
//   <PathMenu path={rel}><button …>{name}</button></PathMenu>
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { api } from '@/lib/api';
import { copy } from '@/lib/copy';
import { kindOf, nameOf } from '@/lib/text';
import { showInFolder } from './actions';
import { useStore } from './store';

/** Copy `text` (a path) to the clipboard and say so. */
export const copyPath = (text: string) => copy(text, `Copied ${text}`);

/** An HTML file in the default browser, as the server serves it. */
const openInBrowser = (path: string) => api('open', { path }).catch((e: Error) => toast.error(e.message));

/**
 * Right-click `children` for the file at `path`, relative to the root. `children` becomes the menu's trigger, so it is
 * one element, or a trigger that passes props on (`<TooltipTrigger asChild>`, not `<Tooltip>`):
 * copy its path, relative path or name; show it in the file manager; an HTML file, open it in the browser. Nothing opens
 * markdown or text elsewhere: Trove may be the system's app for them.
 */
export function PathMenu({ path, children }: { path: string; children: ReactNode }) {
  const root = useStore((s) => s.source?.root);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem disabled={!root} onSelect={() => void copyPath(`${root}/${path}`)}>Copy path</ContextMenuItem>
        <ContextMenuItem onSelect={() => void copyPath(path)}>Copy relative path</ContextMenuItem>
        <ContextMenuItem onSelect={() => void copyPath(nameOf(path))}>Copy filename</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void showInFolder(path)}>{navigator.platform.startsWith('Mac') ? 'Show in Finder' : 'Show in folder'}</ContextMenuItem>
        {kindOf(path) === 'html' && <ContextMenuItem onSelect={() => void openInBrowser(path)}>Open in browser</ContextMenuItem>}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * Right-click a folder heading in the tree: copy its path, show it in the file manager (through `first`, a file in it,
 * since only listed files are revealed), and on the desktop open another folder.
 */
export function DirMenu({ dir, first, children }: { dir: string; first: string; children: ReactNode }) {
  const root = useStore((s) => s.source?.root);
  const bridge = window.trove;
  const other = () => bridge!.pickFolder().then((p) => p && bridge!.open({ path: p.path })).catch((e: Error) => toast.error(e.message));
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem disabled={!root} onSelect={() => void copyPath(dir ? `${root}/${dir}` : root!)}>Copy path</ContextMenuItem>
        {dir && <ContextMenuItem onSelect={() => void copyPath(dir)}>Copy relative path</ContextMenuItem>}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => void showInFolder(first)}>{navigator.platform.startsWith('Mac') ? 'Show in Finder' : 'Show in folder'}</ContextMenuItem>
        {bridge && <ContextMenuItem onSelect={() => void other()}>Open another folder…</ContextMenuItem>}
      </ContextMenuContent>
    </ContextMenu>
  );
}
