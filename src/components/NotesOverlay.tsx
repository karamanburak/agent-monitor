import { useEffect, useRef, useState } from 'react';
import { addNote, deleteNote, loadNotes } from '../lib/notes';
import { stamp } from '../lib/format';
import type { PinnedNote } from '../lib/types';
import Overlay from './Overlay';
import Icon from './Icon';

export default function NotesOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [notes, setNotes] = useState<PinnedNote[]>([]);
  const [draft, setDraft] = useState('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setNotes(loadNotes());
  }, [open]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    const note = addNote(text);
    setNotes((ns) => [note, ...ns]);
    setDraft('');
    taRef.current?.focus();
  };

  const remove = (id: number) => {
    setNotes((ns) => ns.filter((n) => n.id !== id));
    deleteNote(id);
  };

  return (
    <Overlay open={open} onClose={onClose} label="Notes">
      <div className="ovbox notesbox">
        <h2>
          <Icon name="list" size={16} /> Notes
          <button className="ovclose" aria-label="Close" onClick={onClose}>
            ✕ Close
          </button>
        </h2>
        <div className="ovsub">
          A project-wide scratchpad, saved locally (<b>this Mac only</b>) — survives restarts.
        </div>
        <div className="notesadd">
          <textarea
            ref={taRef}
            placeholder="Jot something down… (⌘/Ctrl + Enter to save)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button className="tbtn" disabled={!draft.trim()} onClick={submit}>
            Add note
          </button>
        </div>
        <div className="ovscroll noteslist">
          {notes.length ? (
            notes.map((n) => (
              <div className="noterow" key={n.id}>
                <div className="notetext">{n.text}</div>
                <div className="notemeta">
                  <span>{stamp(n.created_at)}</span>
                  <button
                    className="notedel"
                    aria-label="Delete note"
                    title="Delete note"
                    onClick={() => remove(n.id)}
                  >
                    <Icon name="x-circle" size={13} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="tr-empty" style={{ color: 'var(--mut)' }}>
              No notes yet — add the first one above.
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}
