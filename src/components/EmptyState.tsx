import { useAppSelector } from '../store/hooks';
import { useToast } from './Toast';

// Hooks block for ~/.claude/settings.json — keep in sync with README.md; path is a placeholder
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
const HOOK_CONFIG = JSON.stringify(
  {
    hooks: Object.fromEntries(
      HOOK_EVENTS.map((name) => [
        name,
        [{ hooks: [{ type: 'command', command: '/ABSOLUTE/PATH/TO/claude-agent-monitor/hook-forward.sh' }] }],
      ]),
    ),
  },
  null,
  2,
);

function SetupHelp({ connected }: { connected: boolean }) {
  const { copyText } = useToast();
  return (
    <div className="setup">
      <div className="setup-glyph" aria-hidden="true">
        🔌
      </div>
      <h2 className="setup-h">No events yet — connect the hook</h2>
      <p className="setup-sub">
        The dashboard is running, but no Claude Code session has reported in. Wire up the forwarder hook and every
        session (in any project) will stream here live.
      </p>

      {!connected && (
        <div className="setup-warn" role="status">
          ⚠️ Can't reach the monitor server either. Start it with <code>bun&nbsp;run&nbsp;dev</code> in the project
          folder, then reload.
        </div>
      )}

      <ol className="setup-steps">
        <li>
          Make the forwarder executable:
          <div className="setup-code-row">
            <code>chmod +x /ABSOLUTE/PATH/TO/claude-agent-monitor/hook-forward.sh</code>
            <button
              className="setup-copy"
              onClick={() => copyText('chmod +x /ABSOLUTE/PATH/TO/claude-agent-monitor/hook-forward.sh', 'Command')}
            >
              ⧉ copy
            </button>
          </div>
        </li>
        <li>
          Merge this into your user-level <code>~/.claude/settings.json</code> (replace the path with this folder's
          real path):
          <div className="setup-code-row">
            <button className="setup-copy block" onClick={() => copyText(HOOK_CONFIG, 'Hook config')}>
              ⧉ Copy hook config
            </button>
          </div>
        </li>
        <li>Start a new Claude Code session — events appear here within a second or two.</li>
      </ol>

      <div className="setup-foot">
        Full instructions live in <code>README.md</code>. The forwarder fails silently when the server is down, so it
        never blocks or slows Claude Code.
      </div>
    </div>
  );
}

export default function EmptyState() {
  const total = useAppSelector((s) => Object.keys(s.sessions.sessions).length);
  const connected = useAppSelector((s) => s.ui.connected);

  if (total === 0) return <SetupHelp connected={connected} />;

  return (
    <div className="dempty">
      <div className="in">
        <div className="glyph">📡</div>
        <div className="t1">No live agents right now</div>
        <div>Start a Claude Code session in any directory and it will appear here in real time.</div>
        <div className="dempty-hint">Earlier sessions are under “Finished” in the sidebar and in 🕓 History.</div>
      </div>
    </div>
  );
}
