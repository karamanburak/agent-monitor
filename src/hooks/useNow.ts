import { useEffect, useState } from 'react';

// One shared 1s ticker so live clocks keep advancing even when no Redux state changed.
const subs = new Set<(n: number) => void>();
let timer: number | null = null;

function ensure() {
  if (timer != null) return;
  timer = window.setInterval(() => {
    const n = Date.now();
    for (const fn of subs) fn(n);
  }, 1000);
}

export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    subs.add(setNow);
    ensure();
    return () => {
      subs.delete(setNow);
      if (subs.size === 0 && timer != null) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return now;
}
