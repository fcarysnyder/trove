import { toast } from 'sonner';

/** Copy `text` to the clipboard and say so with `msg`. */
export const copy = (text: string, msg = 'Copied') =>
  navigator.clipboard.writeText(text).then(() => void toast(msg), () => void toast.error('Copy failed'));
