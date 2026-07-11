import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.join(dir, '..');

export const PORT = Number(process.env.PORT) || 3456;
export const HISTORY_LIMIT = 1000;

export const DB_FILE = path.join(ROOT, 'events.db');

// 0 = keep everything (never delete history unasked); set >0 to prune older events on boot + daily.
export const RETENTION_DAYS = Number(process.env.RETENTION_DAYS) || 0;

export const MAX_FIELD_CHARS = Number(process.env.MAX_FIELD_CHARS) || 20000;

export const SCAN_EVERY_MS = 60000;

export const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
