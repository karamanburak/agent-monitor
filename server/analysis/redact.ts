// Mask secrets before anything is shown as evidence or sent to an LLM provider.
// Errs on the side of over-masking: a hidden path segment costs nothing, a leaked key does.
const PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[private-key]'],
  [/\b(sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,})\b/g, '[api-key]'],
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[github-token]'],
  [/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, '[aws-key]'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, '[slack-token]'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[jwt]'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi, '$1 [token]'],
  [/\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD)[A-Z0-9_]*)\s*[=:]\s*("[^"]*"|'[^']*'|\S+)/gi, '$1=[secret]'],
  [/:\/\/([^:/\s@]+):([^@\s/]+)@/g, '://$1:[secret]@'],
  [/(\bmysql\w*\b[^\n|;&]*?\s-p)(?!\s)\S+/g, '$1[secret]'],
  [/(--password[= ])\S+/gi, '$1[secret]'],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]'],
  [/\b[A-Fa-f0-9]{40,}\b/g, '[hex]'],
];

export function redact(text: string): string {
  let out = String(text ?? '');
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}

// Redact, collapse whitespace and clip — the standard treatment for evidence text.
export function clip(text: unknown, max = 160): string {
  const s = redact(String(text ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
