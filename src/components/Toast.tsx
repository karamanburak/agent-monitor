import { useMemo, type ReactNode } from 'react';
import { GooeyToaster, gooeyToast } from 'goey-toast';

type ToastKind = '' | 'ok' | 'err';
interface ToastApi {
  toast: (msg: string, kind?: ToastKind) => void;
  copyText: (text: string, label?: string) => Promise<void>;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <GooeyToaster position="bottom-center" />
    </>
  );
}

export function useToast(): ToastApi {
  return useMemo<ToastApi>(
    () => ({
      toast(msg, kind = '') {
        if (kind === 'ok') gooeyToast.success(msg);
        else if (kind === 'err') gooeyToast.error(msg);
        else gooeyToast(msg);
      },
      async copyText(text, label) {
        try {
          await navigator.clipboard.writeText(text);
          gooeyToast.success((label || 'Copied') + ' to clipboard');
        } catch {
          gooeyToast.error('Copy failed — select and ⌘C');
        }
      },
    }),
    [],
  );
}
