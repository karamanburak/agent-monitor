/** @type {import('tailwindcss').Config} */
export default {
  // Tailwind is available across the app for layout/utility work. The detailed
  // component look is preserved verbatim in src/legacy.css so the visual result
  // is byte-for-byte identical to the original dashboard.
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', ':root:not([data-theme="light"])'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        'panel-2': 'var(--panel-2)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        mut: 'var(--mut)',
        acc: 'var(--acc)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        err: 'var(--err)',
        sub: 'var(--sub)',
        prompt: 'var(--prompt)',
      },
    },
  },
  plugins: [],
};
