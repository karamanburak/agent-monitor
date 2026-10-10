import type http from 'node:http';

export function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Buffer raw chunks and decode once at the end so a multibyte UTF-8 sequence split
// across chunk boundaries is not corrupted; destroy the socket if it exceeds `limit` bytes.
export function readBody(req: http.IncomingMessage, limit: number, cb: (body: string) => void): void {
  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (c: Buffer) => {
    size += c.length;
    if (size > limit) {
      req.destroy();
      return;
    }
    chunks.push(c);
  });
  req.on('end', () => cb(Buffer.concat(chunks).toString('utf8')));
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// For endpoints with side effects: a browser tab on any other site can still reach 127.0.0.1,
// but its Origin gives it away, and requiring a JSON body forces a CORS preflight this server
// never answers.
export function fromDashboard(req: http.IncomingMessage): boolean {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return LOCAL_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}
