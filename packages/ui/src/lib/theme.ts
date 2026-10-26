import type { Theme } from '@trove/core/types';

export const resolveTheme = (theme: Theme, prefersDark: boolean): 'light' | 'dark' =>
  theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;

const query = () => matchMedia('(prefers-color-scheme: dark)');

/** Put the theme on <html> and follow the system while it is `system`. Returns the unsubscribe. */
export function applyTheme(theme: Theme): () => void {
  const set = () => document.documentElement.classList.toggle('dark', resolveTheme(theme, query().matches) === 'dark');
  set();
  if (theme !== 'system') return () => {};
  const q = query();
  q.addEventListener('change', set);
  return () => q.removeEventListener('change', set);
}
