import { useEffect, useRef } from 'react';
import { SHORTCUTS, isTypingTarget, matchesCombo } from '../lib/shortcuts';

type Handlers = Partial<Record<string, () => void>>;

// Binds the global shortcuts from lib/shortcuts.ts to handlers keyed by shortcut id.
// Shortcuts are inert while typing unless the definition opts in (⌘K, Esc).
export function useHotkeys(handlers: Handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingTarget(document.activeElement);
      for (const def of SHORTCUTS) {
        const run = ref.current[def.id];
        if (!def.combo || !run) continue;
        if (typing && !def.whileTyping) continue;
        if (!matchesCombo(def.combo, e)) continue;
        if (def.combo.key !== 'Escape') e.preventDefault();
        run();
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
