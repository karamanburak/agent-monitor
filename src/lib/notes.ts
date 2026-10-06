// Project-wide notes scratchpad, persisted in localStorage — survives server restarts
// since it never leaves the browser.
import type { PinnedNote } from './types';

const KEY = 'agentmon.notes';

export function loadNotes(): PinnedNote[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveNotes(notes: PinnedNote[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {}
}

export function addNote(text: string): PinnedNote {
  const note: PinnedNote = { id: Date.now(), created_at: Date.now(), text };
  saveNotes([note, ...loadNotes()]);
  return note;
}

export function deleteNote(id: number): void {
  saveNotes(loadNotes().filter((n) => n.id !== id));
}
