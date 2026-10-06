import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectSession } from '../store/uiSlice';
import { getSetup } from '../lib/api';
import { basename, fmtMoney, rel } from '../lib/format';
import type { SetupInfo } from '../lib/types';
import Icon from './Icon';
import { useToast } from './Toast';

// Hooks block for ~/.claude/settings.json — keep in sync with README.md.
const HOOK_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'Stop',
  'SubagentStop',
  'PreToolUse',
  'PostToolUse',
  'Notification',
];

function hookConfig(hookPath: string): string {
  return JSON.stringify(
    {
      hooks: Object.fromEntries(
        HOOK_EVENTS.map((name) => [name, [{ hooks: [{ type: 'command', command: hookPath }] }]]),
      ),
    },
    null,
    2,
  );
}

function Step({
  n,
  ok,
  current,
  title,
  children,
}: {
  n: number;
  ok: boolean;
  current: boolean;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={'wiz-step' + (ok ? ' ok' : current ? ' wait' : '')}>
      <span className="wiz-dot" aria-hidden="true">
        {ok ? <Icon name="check" size={12} /> : n}
      </span>
      <span className="wiz-title">
        {title}
        {!ok && current && ' …'}
      </span>
      {!ok && children && <div className="wiz-body">{children}</div>}
    </div>
  );
}

// Live first-run checklist. All checks are local and read-only: the server only
// looks at this folder and ~/.claude/settings.json — it never writes or sends anything.
function SetupHelp({ connected }: { connected: boolean }) {
  const { copyText } = useToast();
  const [setup, setSetup] = useState<SetupInfo | null>(null);

  // poll while visible so each finished step flips green without a reload
  useEffect(() => {
    let alive = true;
    const load = () =>
      getSetup()
        .then((j) => {
          if (alive) setSetup(j);
        })
        .catch(() => {
          if (alive) setSetup(null);
        });
    load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const hookPath = setup?.hookPath || '/ABSOLUTE/PATH/TO/claude-agent-monitor/hook-forward.sh';
  const serverOk = connected || !!setup;
  const execOk = !!setup?.hookExecutable;
  const regCount = setup?.registered.length ?? 0;
  const regOk = !!setup && setup.missing.length === 0 && regCount > 0;
  const eventsOk = (setup?.eventCount ?? 0) > 0;
  const allOk = serverOk && execOk && regOk && eventsOk;
  // the first unmet step gets the "you are here" treatment
  const current = !serverOk ? 1 : !execOk ? 2 : !regOk ? 3 : 4;

  return (
    <div className="setup">
      <div className="setup-glyph" aria-hidden="true">
        <Icon name={allOk ? 'radar' : 'plug'} size={40} />
      </div>
      <h2 className="setup-h">
        {allOk ? 'All wired up — waiting for a session' : 'Connect the hook — live checklist'}
      </h2>
      <p className="setup-sub">
        {allOk
          ? 'Everything is in place. Start a Claude Code session in any directory and it will appear here in real time.'
          : 'Four steps, checked live against this machine. Each one flips green as you complete it — no reload needed.'}
      </p>

      <div className="wiz-steps">
        <Step n={1} ok={serverOk} current={current === 1} title="Monitor server running">
          Can't reach the local server. Start it with <code>bun run dev</code> in the project folder, then this page
          reconnects on its own.
        </Step>
        <Step n={2} ok={execOk} current={current === 2} title="Forwarder script executable">
          <div className="setup-code-row">
            <code>chmod +x {hookPath}</code>
            <button className="setup-copy" onClick={() => copyText(`chmod +x ${hookPath}`, 'Command')}>
              <Icon name="copy" size={11} /> copy
            </button>
          </div>
        </Step>
        <Step
          n={3}
          ok={regOk}
          current={current === 3}
          title={
            'Hook registered in ~/.claude/settings.json' +
            (setup && regCount > 0 && !regOk ? ` — ${regCount}/${HOOK_EVENTS.length} events` : '')
          }
        >
          {setup && regCount > 0 && setup.missing.length > 0 && (
            <>
              Missing events: <code>{setup.missing.join(', ')}</code>.{' '}
            </>
          )}
          Merge this into the <code>"hooks"</code> object of your user-level <code>~/.claude/settings.json</code> (the
          path below is already this folder's real path):
          <div className="setup-code-row">
            <button className="setup-copy block" onClick={() => copyText(hookConfig(hookPath), 'Hook config')}>
              <Icon name="copy" size={11} /> Copy hook config
            </button>
          </div>
        </Step>
        <Step n={4} ok={eventsOk} current={current === 4} title="First event received">
          Start a <b>new</b> Claude Code session in any directory — its events appear here within a second or two.
        </Step>
      </div>

      {setup?.otherPath && (
        <div className="setup-warn" role="status">
          <Icon name="alert" size={12} /> The registered hook points at a <b>different</b> copy of{' '}
          <code>hook-forward.sh</code>. That's fine if it exists — otherwise re-copy the config above.
        </div>
      )}

      <div className="setup-foot">
        These checks are local and read-only: only this folder and <code>~/.claude/settings.json</code> are inspected —
        nothing is modified, and nothing ever leaves this machine. Full instructions live in <code>README.md</code>.
      </div>
    </div>
  );
}

export default function EmptyState({
  onOpenHistory,
  onOpenPalette,
}: {
  onOpenHistory?: () => void;
  onOpenPalette?: () => void;
}) {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector((s) => s.sessions.sessions);
  const connected = useAppSelector((s) => s.ui.connected);
  const todayCost = useAppSelector((s) => s.usage.data?.today?.cost ?? 0);

  const all = Object.values(sessions);
  if (all.length === 0) return <SetupHelp connected={connected} />;

  // quick recap so the idle screen answers "what happened today?" instead of dead-ending
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const today = all.filter((s) => s.lastSeen >= dayStart.getTime());
  const toolCalls = today.reduce((n, s) => n + s.toolCount, 0);
  const last = [...all].sort((a, b) => b.lastSeen - a.lastSeen)[0];
  const lastSub = (last.lastResult || last.prompt || '').replace(/\s+/g, ' ').trim();

  return (
    <div className="dempty">
      <div className="in">
        <div className="glyph">
          <Icon name="radar" size={40} />
        </div>
        <div className="t1">All quiet — no live agents</div>
        <div>Start a Claude Code session in any directory and it appears here instantly.</div>
        {today.length > 0 && (
          <div className="dstat">
            Today: <b>{today.length}</b> session{today.length === 1 ? '' : 's'} · <b>{toolCalls}</b> tool call
            {toolCalls === 1 ? '' : 's'}
            {todayCost > 0 && (
              <>
                {' '}
                · <b>{fmtMoney(todayCost)}</b>
              </>
            )}
          </div>
        )}
        <button
          className="dlast"
          title="Reopen the most recent session"
          onClick={() => dispatch(selectSession(last.id))}
        >
          <span className="dl-name">{basename(last.cwd)}</span>
          <span className="dl-when">{rel(last.lastSeen)}</span>
          <span className="dl-sub">{lastSub || 'Open the last session'}</span>
        </button>
        <div className="dactions">
          {onOpenPalette && (
            <button className="tbtn" onClick={onOpenPalette}>
              <Icon name="search" size={13} /> Search <kbd>{/Mac|iP/.test(navigator.platform) ? '⌘K' : 'Ctrl K'}</kbd>
            </button>
          )}
          {onOpenHistory && (
            <button className="tbtn" onClick={onOpenHistory}>
              <Icon name="history" /> History
            </button>
          )}
        </div>
        <div className="dempty-hint">
          Finished sessions live under “Finished” in the sidebar. Press <kbd>R</kbd> for some lofi while you wait.
        </div>
      </div>
    </div>
  );
}
