// A file path's right-click menu, and copying a path with a toast. Wrap anything that shows a path:
//   <PathMenu path={rel}><button …>{name}</button></PathMenu>
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { api } from '@/lib/api';
import { nameOf } from '@/lib/text';
import { showInFolder } from './actions';
import { useStore } from './store';

/** Copy `text` (a path) to the clipboard and say so. */
export const copyPath = (text: string) =>
  navigator.clipboard.writeText(text).then(() => void toast(`Copied ${text}`), () => void toast.error('Copy failed'));

/** The file in its default app, opened by the server. */
const openFile = (path: string) => api('open', { path }).catch((e: Error) => toast.error(e.message));

/**
 * Right-click `children` for the file at `path`, relative to the root. `children` becomes the menu's trigger, so it is
 * one element, or a trigger that passes props on (`<TooltipTrigger asChild>`, not `<Tooltip>`):
 * copy its path, relative path or name; show it in the file manager; open it in its default app.
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
        <ContextMenuItem onSelect={() => void openFile(path)}>Open in default app</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
