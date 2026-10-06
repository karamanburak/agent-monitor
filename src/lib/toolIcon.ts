// one glyph per tool family so a scan down the list reads as "shell, read, edit…" at a glance
export function toolIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.startsWith('mcp__')) return 'plug';
  if (n === 'bash' || n.includes('shell') || n === 'powershell' || n === 'bashoutput' || n === 'killshell')
    return 'terminal';
  if (n === 'read' || n === 'notebookread') return 'file';
  if (n === 'edit' || n === 'write' || n === 'multiedit' || n === 'notebookedit') return 'pencil';
  if (n === 'grep' || n === 'glob' || n === 'ls' || n === 'toolsearch') return 'search';
  if (n === 'webfetch' || n === 'websearch') return 'globe';
  if (n === 'task' || n === 'agent') return 'bot';
  if (n === 'todowrite') return 'list';
  return 'activity';
}
