import { lazy, Suspense, useMemo, type ReactNode } from 'react';

// goey-toast pulls in framer-motion (~⅓ of the bundle), and toasts only ever appear after a
// user action — so the library lives in its own chunk, fetched right after first paint.
const loadLib = () => import('goey-toast');
const LazyToaster = lazy(() =>
  loadLib().then((m) => ({ default: () => <m.GooeyToaster position="bottom-center" /> })),
);

type ToastKind = '' | 'ok' | 'err';
interface ToastApi {
  toast: (msg: string, kind?: ToastKind) => void;
  copyText: (text: string, label?: string) => Promise<void>;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <LazyToaster />
      </Suspense>
    </>
  );
}

const show = (msg: string, kind: ToastKind = '') =>
  loadLib().then(({ gooeyToast }) => {
    if (kind === 'ok') gooeyToast.success(msg);
    else if (kind === 'err') gooeyToast.error(msg);
    else gooeyToast(msg);
  });

export function useToast(): ToastApi {
  return useMemo<ToastApi>(
    () => ({
      toast(msg, kind = '') {
        void show(msg, kind);
      },
      async copyText(text, label) {
        try {
          await navigator.clipboard.writeText(text);
          void show((label || 'Copied') + ' to clipboard', 'ok');
        } catch {
          void show('Copy failed — select and ⌘C', 'err');
        }
      },
    }),
    [],
  );
}
