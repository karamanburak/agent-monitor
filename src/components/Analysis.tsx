import { useCallback, useEffect, useState } from 'react';
import { explainSession, getAnalysis, getAnalystProviders, saveAnalystSettings } from '../lib/api';
import { clock } from '../lib/format';
import type { AnalystProviders, AnalystReport, ExplainResponse, Finding, Session, SessionAnalysis } from '../lib/types';
import Icon from './Icon';
import { useToast } from './Toast';

const KIND_LABEL: Record<AnalystReport['recommendations'][number]['kind'], string> = {
  claude_md: 'CLAUDE.md',
  permission: 'Permission',
  skill: 'Skill',
  workflow: 'Workflow',
};

function healthClass(h: number): string {
  return h >= 90 ? 'good' : h >= 70 ? 'fair' : 'poor';
}

function FindingRow({ f, onCopy }: { f: Finding; onCopy: (text: string) => void }) {
  return (
    <li className={'afind ' + f.severity}>
      <div className="afhead">
        <span className="afsev">{f.severity}</span>
        <b>{f.title}</b>
        <span className="afid mono">{f.id}</span>
      </div>
      <p className="afdetail">{f.detail}</p>
      {f.evidence.length > 0 && (
        <ul className="afev">
          {f.evidence.map((e, i) => (
            <li key={i}>
              <span className="mono">{clock(e.at)}</span> {e.text}
            </li>
          ))}
        </ul>
      )}
      {f.suggestion && (
        <div className="afsugg">
          <span>{f.suggestion}</span>
          <button
            className="fitbtn iconbtn"
            title="Copy"
            aria-label="Copy suggestion"
            onClick={() => onCopy(f.suggestion!)}
          >
            <Icon name="copy" size={11} />
          </button>
        </div>
      )}
    </li>
  );
}

// Rule-based findings for one session, plus an optional LLM explanation on demand.
// Collapsed by default: one line with the health score so it never crowds the timeline.
export default function Analysis({ session: s }: { session: Session }) {
  const { copyText, toast } = useToast();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SessionAnalysis | null>(null);
  const [prov, setProv] = useState<AnalystProviders | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExplainResponse | null>(null);

  // re-analyse when the session gains events (cheap: pure rules on the server)
  useEffect(() => {
    let cancelled = false;
    getAnalysis(s.id)
      .then((a) => !cancelled && setData(a))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [s.id, s.lastSeen]);

  useEffect(() => {
    if (!open || prov) return;
    getAnalystProviders()
      .then(setProv)
      .catch(() => {});
  }, [open, prov]);

  const picked = prov?.providers.find((p) => p.id === prov.picked) || null;

  const runExplain = useCallback(async () => {
    setBusy(true);
    try {
      setResult(await explainSession(s.id));
    } catch {
      toast('Could not reach the analyst', 'err');
    } finally {
      setBusy(false);
    }
  }, [s.id, toast]);

  const allowCloud = async () => {
    const r = await saveAnalystSettings({ cloudConsent: true }).catch(() => null);
    if (!r?.ok) return toast('Could not save the setting', 'err');
    setProv((p) => (p ? { ...p, settings: r.settings } : p));
    runExplain();
  };

  const changeProvider = async (provider: AnalystProviders['settings']['provider']) => {
    const r = await saveAnalystSettings({ provider }).catch(() => null);
    if (!r?.ok) return toast('Could not save the setting', 'err');
    setResult(null);
    setProv(await getAnalystProviders(true).catch(() => null));
  };

  if (!data) return null;
  const n = data.findings.length;

  return (
    <section className={'danalysis' + (open ? ' open' : '')}>
      <button className="ahead" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="activity" size={13} />
        <span className="atitle">Session analysis</span>
        <span className={'ahealth ' + healthClass(data.health)} title="100 = no friction found">
          {data.health}
        </span>
        <span className="acount">{n ? `${n} finding${n === 1 ? '' : 's'}` : 'no friction found'}</span>
        <span className="achev">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="abody">
          {n > 0 ? (
            <ul className="afinds">
              {data.findings.map((f) => (
                <FindingRow key={f.id} f={f} onCopy={(t) => copyText(t, 'Suggestion')} />
              ))}
            </ul>
          ) : (
            <p className="aempty">No loops, retry storms, permission friction or corrections in this session.</p>
          )}

          <div className="aai">
            <div className="aaihead">
              <b>AI explanation</b>
              {prov && (
                <span className="aprov">
                  {picked ? (
                    <span className={'abadge ' + (picked.local ? 'local' : 'cloud')}>
                      {picked.local ? '🔒 local' : '☁️ cloud'} · {picked.label}
                    </span>
                  ) : (
                    <span className="abadge off">no provider</span>
                  )}
                  <select
                    aria-label="LLM provider"
                    value={prov.settings.provider}
                    onChange={(e) => changeProvider(e.target.value as AnalystProviders['settings']['provider'])}
                  >
                    <option value="auto">Auto</option>
                    {prov.providers.map((p) => (
                      <option key={p.id} value={p.id} disabled={!p.ok} title={p.detail}>
                        {p.label}
                        {p.ok ? '' : ' — unavailable'}
                      </option>
                    ))}
                    <option value="off">Off</option>
                  </select>
                </span>
              )}
            </div>

            {result?.ok === false && result.reason === 'consent' ? (
              <div className="aconsent">
                <p>
                  {picked?.label || 'This provider'} sends the findings above to Anthropic — titles, counts and short,
                  secret-masked examples. No source files, no full prompts.
                </p>
                <button className="abtn" onClick={allowCloud}>
                  Allow and explain
                </button>
              </div>
            ) : result?.ok === false ? (
              <p className="aerr">{result.message || 'The explanation failed.'}</p>
            ) : null}

            {result?.ok ? (
              <div className="areport">
                <p className="asummary">{result.report.summary}</p>
                {result.report.rootCauses.length > 0 && (
                  <>
                    <h4>Why</h4>
                    <ul>
                      {result.report.rootCauses.map((c, i) => (
                        <li key={i}>
                          {c.text} <span className="acite mono">{c.findingIds.join(', ')}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {result.report.recommendations.length > 0 && (
                  <>
                    <h4>Try next</h4>
                    <ul>
                      {result.report.recommendations.map((r, i) => (
                        <li key={i}>
                          <span className="akind">{KIND_LABEL[r.kind]}</span> {r.text}{' '}
                          <span className="acite mono">{r.findingIds.join(', ')}</span>
                          {r.snippet && (
                            <div className="afsugg">
                              <code>{r.snippet}</code>
                              <button
                                className="fitbtn iconbtn"
                                title="Copy"
                                aria-label="Copy snippet"
                                onClick={() => copyText(r.snippet!, 'Snippet')}
                              >
                                <Icon name="copy" size={11} />
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="ameta">
                  {result.local ? '🔒' : '☁️'} {result.provider} · {result.model} · {(result.ms / 1000).toFixed(1)}s
                  {result.report.dropped > 0 && ` · ${result.report.dropped} uncited claim(s) removed`}
                </p>
              </div>
            ) : (
              <button className="abtn" disabled={busy || !picked} onClick={runExplain}>
                {busy ? 'Thinking…' : n ? 'Explain these findings' : 'Get a second opinion'}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
