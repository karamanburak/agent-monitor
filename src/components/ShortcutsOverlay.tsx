import Overlay from './Overlay';
import Icon from './Icon';
import { SHORTCUTS } from '../lib/shortcuts';

export default function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Overlay open={open} onClose={onClose} label="Keyboard shortcuts">
      <div className="ovbox shortbox">
        <h2>
          <Icon name="keyboard" size={16} /> Keyboard shortcuts
          <button className="ovclose" aria-label="Close" onClick={onClose}>
            ✕ Close
          </button>
        </h2>
        <div className="ovsub">Inert while typing in a text field — click out first.</div>
        <div className="shortlist">
          {SHORTCUTS.map((s) => (
            <div className="shortrow" key={s.id}>
              <span className="shortkeys">
                {s.keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </span>
              <span className="shortdesc">{s.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </Overlay>
  );
}
