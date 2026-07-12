import { useEffect, useState } from 'react';

interface TipState {
  x: number;
  y: number;
  text: string;
}

// position:fixed tooltip via [data-tip] delegation — avoids overflow:hidden clipping that CSS/::after tips suffer
export default function TipLayer() {
  const [tip, setTip] = useState<TipState | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const place = (el: HTMLElement) => {
      const text = el.getAttribute('data-tip');
      if (!text?.trim()) return;
      const r = el.getBoundingClientRect();
      const x = Math.max(96, Math.min(window.innerWidth - 96, r.left + r.width / 2));
      const y = Math.min(window.innerHeight - 12, r.bottom + 6);
      setTip({ x, y, text });
    };

    const over = (e: Event) => {
      const el = (e.target as HTMLElement)?.closest?.('[data-tip]') as HTMLElement | null;
      clearTimeout(timer);
      if (!el) {
        setTip(null);
        return;
      }
      timer = setTimeout(() => place(el), 140);
    };
    const clear = () => {
      clearTimeout(timer);
      setTip(null);
    };

    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', clear);
    // hide immediately on click/scroll so a stale tip can't linger
    document.addEventListener('mousedown', clear, true);
    window.addEventListener('scroll', clear, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mouseout', clear);
      document.removeEventListener('mousedown', clear, true);
      window.removeEventListener('scroll', clear, true);
    };
  }, []);

  if (!tip) return null;
  return (
    <div className="tiplayer" role="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  );
}
