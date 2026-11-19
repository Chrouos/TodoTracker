export function normalizeTheme(value) {
  return value === 'light' || value === 'dark' ? value : 'auto';
}

export function applyTheme(value, root = document.documentElement) {
  const theme = normalizeTheme(value);
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
}
