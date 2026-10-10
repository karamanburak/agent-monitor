import { useCallback, useEffect, useState } from 'react';
import { useAppSelector } from '../store/hooks';
import { displayStatus } from '../lib/constants';
import { getTerminalInfo, terminalAction, type TermAction, type TermApp } from '../lib/terminal';
import { useToast } from '../components/Toast';
import type { Session } from '../lib/types';

type Info = { supported: boolean; apps: TermApp[] };

// fetched once per page load — which terminal apps are installed doesn't change mid-session
let infoP: Promise<Info> | null = null;
let infoCache: Info = { supported: false, apps: [] };

const REASON: Record<string, string> = {
  'no-term': "This session's terminal wasn't recorded (it started before the hook update) — try Open terminal here",
  gone: 'That terminal has closed — Resume continues the session in a new one',
  detached: 'Its tmux session is not attached to any terminal window right now',
  'no-folder': "The session's project folder no longer exists",
  unsupported: 'Terminal jumping is only available on macOS',
  failed: "Couldn't control the terminal app — allow it under System Settings › Privacy & Security › Automation",
};

// "Go to terminal" / "Open terminal here" / "Resume" for a session (macOS only; the server does the work)
export function useTerminal() {
  const [info, setInfo] = useState<Info>(infoCache);
  const app = useAppSelector((s) => s.ui.termApp);
  const { toast, copyText } = useToast();

  useEffect(() => {
    if (!infoP)
      infoP = getTerminalInfo()
        .then((i) => (infoCache = { supported: !!i.supported, apps: i.apps || [] }))
        .catch(() => infoCache);
    let live = true;
    infoP.then((i) => live && setInfo(i));
    return () => {
      live = false;
    };
  }, []);

  const run = useCallback(
    async (s: Session, action: TermAction) => {
      try {
        const r = await terminalAction(s.id, action, app);
        if (!r.ok) {
          toast(REASON[r.reason || 'failed'] || REASON.failed, 'err');
          return;
        }
        if (r.clipboard) await copyText(r.clipboard, `Opened ${r.app} — resume command`);
        else if (r.how === 'app') toast(`Brought ${r.app} forward — it can't select a specific tab`);
      } catch {
        toast('Monitor server not reachable', 'err');
      }
    },
    [app, toast, copyText],
  );

  // the one-key / one-click default: live sessions jump, finished ones open a terminal in their folder
  const primary = useCallback(
    (s: Session) => run(s, displayStatus(s) === 'ended' ? 'open' : 'focus'),
    [run],
  );

  return { supported: info.supported, apps: info.apps, app, run, primary };
}
