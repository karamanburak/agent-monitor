import { displayStatus } from '../lib/constants';
import { useTerminal } from '../hooks/useTerminal';
import Icon from './Icon';
import type { Session } from '../lib/types';

// Header actions for a session's terminal (macOS only — renders nothing elsewhere).
// Live: jump to the exact tab/pane it runs in. Finished: resume it, or open a shell in its folder.
export default function TerminalActions({ s, ended }: { s: Session; ended?: boolean }) {
  const { supported, run } = useTerminal();
  if (!supported) return null;
  const isEnded = ended ?? displayStatus(s) === 'ended';
  const canResume = isEnded && (!s.source || s.source === 'claude' || s.source === 'claude-code');
  const where = s.termLabel || 'terminal';
  return (
    <span className="termacts">
      {!isEnded && (
        <button
          type="button"
          className="tact primary"
          title={`Jump to the ${where} tab this session runs in (T)`}
          onClick={() => run(s, 'focus')}
        >
          <Icon name="square-terminal" size={13} />
          <span className="lbl">Go to terminal</span>
        </button>
      )}
      {canResume && (
        <button
          type="button"
          className="tact primary"
          title="Continue this session in a new terminal (claude --resume)"
          onClick={() => run(s, 'resume')}
        >
          <Icon name="rotate-ccw" size={12} />
          <span className="lbl">Resume</span>
        </button>
      )}
      <button
        type="button"
        className="tact"
        title="Open a new terminal in this project folder"
        aria-label="Open a new terminal in this project folder"
        onClick={() => run(s, 'open')}
      >
        <Icon name="folder" size={12} />
        {isEnded && <span className="lbl">Open terminal here</span>}
      </button>
    </span>
  );
}
