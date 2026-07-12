import { useState } from 'react';
import { useAppSelector } from '../store/hooks';
import { fmtMoney, fmtTokens } from '../lib/format';
import { useNow } from '../hooks/useNow';
import type { UsageBucket } from '../lib/types';

export default function TokenFooter({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const usage = useAppSelector((s) => s.usage);
  const now = useNow();
  const [spinning, setSpinning] = useState(false);

  const d = usage.data;
  const seg = (label: string, b?: UsageBucket) =>
    b ? (
      <span
        key={label}
        title={`in ${fmtTokens(b.input)} · out ${fmtTokens(b.output)} · cache ${fmtTokens(b.cache)} · ≈ ${fmtMoney(b.cost)} API-equiv`}
      >
        {label} <b>{fmtTokens(b.input + b.output)}</b>
      </span>
    ) : null;
  const cseg = (label: string, b?: UsageBucket) =>
    b ? (
      <span key={label} title="API list-price equivalent of your usage — NOT your Team/subscription bill">
        {label} <b>{fmtMoney(b.cost)}</b>
      </span>
    ) : null;

  let meta = '—';
  if (usage.bad || !usage.fetchedAt) meta = usage.bad ? 'server offline' : 'reading…';
  else {
    const ageS = Math.max(0, Math.round((now - usage.updated) / 1000));
    const nextS = Math.max(0, Math.round((usage.fetchedAt + usage.scanEvery - now) / 1000));
    const ago = ageS < 60 ? ageS + 's ago' : Math.round(ageS / 60) + 'm ago';
    meta = `updated ${ago} · next in ${nextS}s`;
  }

  return (
    <div className="rail-foot">
      <div>
        My tokens · in+out{' '}
        <span className="mono" style={{ opacity: 0.7 }}>
          (this Mac)
        </span>
      </div>
      <div className="tok">
        {d ? [seg('Today', d.today), seg('7d', d.week), seg('30d', d.month), seg('Year', d.year)] : '–'}
      </div>
      <div
        style={{ marginTop: 8 }}
        title="Your token usage priced at Anthropic API list rates. This is NOT what you pay on a Team/subscription plan (that's a flat seat fee) — it's the API-equivalent value of your usage. Edit rates in server.ts."
      >
        API-equiv.{' '}
        <span className="mono" style={{ opacity: 0.7 }}>
          (list price, not your plan)
        </span>
      </div>
      <div className="tok">
        {d ? [cseg('Today', d.today), cseg('7d', d.week), cseg('30d', d.month), cseg('Year', d.year)] : '–'}
      </div>
      <div className="tokmeta">
        <span title="When these figures were last read from your local transcripts">{meta}</span>
        <button
          className={'tokref' + (spinning ? ' spin' : '')}
          title="Refresh now"
          onClick={() => {
            setSpinning(true);
            Promise.resolve(onRefresh()).finally(() => setTimeout(() => setSpinning(false), 500));
          }}
        >
          ↻
        </button>
      </div>
    </div>
  );
}
