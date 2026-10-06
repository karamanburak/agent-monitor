import { useState } from 'react';
import { useAppSelector } from '../store/hooks';
import { fmtMoney, fmtTokens } from '../lib/format';
import { useNow } from '../hooks/useNow';
import type { UsageBucket } from '../lib/types';

// One line: today's tokens + API-equivalent cost. The full breakdown lives in the
// tooltip; clicking the line opens the Analytics overlay for the real detail.
export default function TokenFooter({
  onRefresh,
  onOpenStats,
}: {
  onRefresh: () => Promise<void>;
  onOpenStats: () => void;
}) {
  const usage = useAppSelector((s) => s.usage);
  const now = useNow();
  const [spinning, setSpinning] = useState(false);

  const d = usage.data;

  let meta = '—';
  if (usage.bad || !usage.fetchedAt) meta = usage.bad ? 'server offline' : 'reading…';
  else {
    const ageS = Math.max(0, Math.round((now - usage.updated) / 1000));
    const nextS = Math.max(0, Math.round((usage.fetchedAt + usage.scanEvery - now) / 1000));
    const ago = ageS < 60 ? ageS + 's ago' : Math.round(ageS / 60) + 'm ago';
    meta = `updated ${ago} · next in ${nextS}s`;
  }

  const line = (label: string, b?: UsageBucket) =>
    b ? `${label} ${fmtTokens(b.input + b.output)} · ${fmtMoney(b.cost)}` : null;
  const tip = [
    'Tokens in+out on this Mac · $ = API list-price equivalent, NOT your plan bill',
    d && [line('Today', d.today), line('7d', d.week), line('30d', d.month), line('Year', d.year)].filter(Boolean).join('   '),
    meta,
    'Click for full analytics',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div className="rail-foot">
      <button type="button" className="tokline" title={tip} onClick={onOpenStats}>
        <span className="toklbl">Tokens</span>
        {d?.today && !(d.today.input + d.today.output) ? (
          <span>none used today</span>
        ) : d?.today ? (
          <>
            <b>{fmtTokens(d.today.input + d.today.output)}</b> today ·{' '}
            <b title="API list-price equivalent — not your plan bill">≈{fmtMoney(d.today.cost)}</b>
          </>
        ) : (
          <span>{usage.bad ? 'server offline' : 'reading…'}</span>
        )}
      </button>
      <button
        className={'tokref' + (spinning ? ' spin' : '')}
        title="Refresh now"
        aria-label="Refresh token usage"
        onClick={() => {
          setSpinning(true);
          Promise.resolve(onRefresh()).finally(() => setTimeout(() => setSpinning(false), 500));
        }}
      >
        ↻
      </button>
    </div>
  );
}
