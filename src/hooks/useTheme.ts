import { useCallback, useState } from 'react';

function currentTheme(): 'light' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

// Initial theme is applied by the inline script in index.html before first paint.
export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(currentTheme);
  const toggle = useCallback(() => {
    const next = currentTheme() === 'light' ? 'dark' : 'light';
    if (next === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  }, []);
  return { theme, toggle };
}
