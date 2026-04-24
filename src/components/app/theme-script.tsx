const themeScript = `
(() => {
  const storageKey = 'office-ledger-theme';
  const root = document.documentElement;

  function resolveTheme(preference) {
    if (preference === 'light' || preference === 'dark') return preference;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0a1418' : '#173a40');
  }

  try {
    applyTheme(resolveTheme(localStorage.getItem(storageKey) || 'system'));
  } catch {
    applyTheme(resolveTheme('system'));
  }
})();
`

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScript }} />
}
