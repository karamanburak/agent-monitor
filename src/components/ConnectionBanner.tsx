import { useEffect, useState } from 'react';
import { useAppSelector } from '../store/hooks';

// Delayed 4s so a brief reconnect blip doesn't flash the banner
export default function ConnectionBanner() {
  const connected = useAppSelector((s) => s.ui.connected);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (connected) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), 4000);
    return () => clearTimeout(t);
  }, [connected]);

  // adds a #root grid row so the banner pushes content down instead of overlapping
  useEffect(() => {
    document.body.classList.toggle('conn-lost', show);
    return () => document.body.classList.remove('conn-lost');
  }, [show]);

  if (!show) return null;
  return (
    <div className="connbanner" role="status" aria-live="polite">
      <span className="cb-dot" aria-hidden="true"></span>
      Can't reach the monitor server — reconnecting… Events may be delayed. Check that <code>bun run dev</code> is
      still running.
    </div>
  );
}
