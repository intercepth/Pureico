import { $ } from '../lib/dom';

/** Registers the service worker and offers a reload when a new version is waiting. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  const toast = $('.toast');
  const action = $<HTMLButtonElement>('.toast-action', toast);
  let waiting: ServiceWorker | null = null;
  let reloading = false;

  const offer = (worker: ServiceWorker) => {
    waiting = worker;
    toast.hidden = false;
  };

  action.addEventListener('click', () => {
    action.disabled = true;
    waiting?.postMessage({ type: 'SKIP_WAITING' });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !waiting) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      if (registration.waiting && navigator.serviceWorker.controller) offer(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            offer(installing);
          }
        });
      });
    } catch {
      /* offline support is a bonus; the app works without it */
    }
  });
}
