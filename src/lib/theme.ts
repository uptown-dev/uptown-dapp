// Light and dark themes. The first visit follows the system setting; a choice made with the
// switch is remembered in localStorage. Every storage call is wrapped, so a blocked storage
// still leaves a working switch for the current visit. `public/theme-init.js` applies a stored
// choice before the page paints, so there is no flash of the wrong theme.

export type Theme = 'light' | 'dark';

export const THEME_KEY = 'uptown-theme';

export function storedTheme(): Theme | null {
  try {
    const t = window.localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** The theme in effect: the stored choice, else the system's. */
export function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return storedTheme() ?? systemTheme();
}

/** Applies a theme and remembers it. */
export function chooseTheme(t: Theme): void {
  document.documentElement.setAttribute('data-theme', t);
  try {
    window.localStorage.setItem(THEME_KEY, t);
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
}
