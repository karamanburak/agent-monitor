#!/usr/bin/env node
import http from 'node:http';
import { PORT } from './config';
import { pruneOldEvents } from './models/db';
import { route } from './routes';

// Last-resort guard: a single unexpected throw must never take down this long-lived daemon.
process.on('uncaughtException', (err) => {
  console.error('claude-agent-monitor: uncaught exception (continuing):', err);
});
process.on('unhandledRejection', (err) => {
  console.error('claude-agent-monitor: unhandled rejection (continuing):', err);
});

pruneOldEvents();
setInterval(pruneOldEvents, 24 * 60 * 60 * 1000);

const server = http.createServer(route);

// Surface the common port-in-use failure with a fix instead of a raw stack trace.
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `claude-agent-monitor: port ${PORT} is already in use.\n` +
        `  Stop the process holding it, then retry:  lsof -ti :${PORT} | xargs kill\n` +
        `  Or run on another port:                   PORT=4000 bun run dev`,
    );
  } else {
    console.error(`claude-agent-monitor: failed to start — ${err.message}`);
  }
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`claude-agent-monitor: http://127.0.0.1:${PORT}`);
});
