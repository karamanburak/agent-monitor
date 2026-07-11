// Past-session browse & replay. Aggregation is cached, invalidated by a cheap row signature.
import { eventsForSession, eventsForSessions, eventsSig, recentSessionIds } from './db';
import type { Event } from '../types';

const HISTORY_SESSIONS = 300;

let historyCache: { sig: string; sessions: any[] } = { sig: '', sessions: [] };

export function buildHistory() {
  const sig = eventsSig();
  if (sig === historyCache.sig) return historyCache.sessions;
  const map = new Map<string, any>();
  const ids = recentSessionIds(HISTORY_SESSIONS);
  for (const e of eventsForSessions(ids)) {
    const sid = e.session_id;
    if (!sid) continue;
    const nl = String(e.hook_event_name || '').toLowerCase();
    let s = map.get(sid);
    if (!s) {
      s = {
        id: sid,
        cwd: e.cwd || '',
        firstSeen: e.received_at || 0,
        lastSeen: e.received_at || 0,
        events: 0,
        tools: 0,
        fails: 0,
        prompts: 0,
        subs: 0,
        firstPrompt: '',
        lastPrompt: '',
        ended: false,
        result: '',
      };
      map.set(sid, s);
    }
    if (e.cwd) s.cwd = e.cwd;
    if (e.received_at) {
      if (!s.firstSeen || e.received_at < s.firstSeen) s.firstSeen = e.received_at;
      if (e.received_at > s.lastSeen) s.lastSeen = e.received_at;
    }
    s.events++;
    if (nl.includes('pretooluse')) s.tools++;
    if (nl.includes('posttooluse') && (nl.endsWith('failure') || e.tool_response?.is_error)) s.fails++;
    if (nl === 'userpromptsubmit' || nl === 'beforesubmitprompt') {
      s.prompts++;
      const p = String(e.prompt || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
      if (!s.firstPrompt) s.firstPrompt = p;
      if (p) s.lastPrompt = p;
    }
    if (nl.includes('subagentstart')) s.subs++;
    if (nl.includes('sessionend')) s.ended = true;
    if ((nl === 'stop' || nl.includes('subagentstop')) && e.last_assistant_message)
      s.result = String(e.last_assistant_message).replace(/\s+/g, ' ').trim().slice(0, 300);
  }
  const sessions = [...map.values()].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, HISTORY_SESSIONS);
  historyCache = { sig, sessions };
  return sessions;
}

export function sessionEvents(id: string): Event[] {
  return eventsForSession(id).slice(-8000); // bound the payload for a very long session
}
