import { $ } from '../lib/dom';

type Theme = 'dark' | 'light';
const THEME_KEY = 'pureico:theme';
const THEME_COLORS: Record<Theme, string> = { dark: '#111116', light: '#fbfaff' };

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

export function initThemeToggle(): void {
  const toggle = $<HTMLButtonElement>('.theme-toggle');
  const sync = () => toggle.setAttribute('aria-checked', String(currentTheme() === 'light'));
  applyTheme(currentTheme());
  sync();
  toggle.addEventListener('click', () => {
    const next: Theme = currentTheme() === 'light' ? 'dark' : 'light';
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* the choice just won't persist */
    }
    sync();
  });
}

export function initPrivacyPanel(): void {
  const badge = $<HTMLButtonElement>('.privacy-badge');
  const panel = $('#privacy-panel');
  const status = $('.offline-status', panel);
  const statusText = $('.status-text', status);

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    badge.setAttribute('aria-expanded', String(open));
  };
  badge.addEventListener('click', () => setOpen(!!panel.hidden));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      badge.focus();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Node;
    if (!panel.hidden && !panel.contains(target) && !badge.contains(target)) setOpen(false);
  });

  let offlineReady = false;
  const render = () => {
    if (!navigator.onLine) {
      status.dataset.state = 'offline';
      statusText.textContent = 'You’re offline, and Pureico still works.';
    } else if (offlineReady) {
      status.dataset.state = 'ready';
      statusText.textContent = 'Offline-ready: Pureico now works without internet.';
    } else if (!('serviceWorker' in navigator)) {
      status.dataset.state = 'pending';
      statusText.textContent = 'This browser can’t keep Pureico for offline use.';
    } else {
      status.dataset.state = 'pending';
      statusText.textContent = 'Preparing offline mode…';
    }
  };
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  render();

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    void navigator.serviceWorker.ready.then(() => {
      offlineReady = true;
      render();
    });
  } else if (!import.meta.env.PROD) {
    statusText.textContent = 'Offline mode is enabled in production builds.';
  }
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function initInstallButton(): void {
  const button = $<HTMLButtonElement>('.install-button');
  let deferred: InstallPromptEvent | null = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    button.hidden = false;
  });
  button.addEventListener('click', async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    button.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    button.hidden = true;
  });
}
