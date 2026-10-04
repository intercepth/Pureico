import { $ } from '../lib/dom';

/** Resolves once `worker` has finished installing, whether or not that succeeded. */
function installDone(worker: ServiceWorker | null): Promise<void> {
  if (!worker || worker.state !== 'installing') return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (worker.state === 'installing') return;
      worker.removeEventListener('statechange', check);
      resolve();
    };
    worker.addEventListener('statechange', check);
  });
}

/** Waits for `promise`, but never longer than `ms`. */
function atMost(promise: Promise<unknown>, ms: number): Promise<unknown> {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

/** Registers the service worker and offers a reload when a new version is ready. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  const toast = $('.toast');
  const action = $<HTMLButtonElement>('.toast-action', toast);
  let registration: ServiceWorkerRegistration | undefined;
  let controlled = navigator.serviceWorker.controller !== null;
  let reloading = false;

  const reload = () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  };

  // Offers the update once a new version has installed. A newer version can replace a
  // waiting one at any time, so the click looks up the current one rather than keeping it.
  const watch = (worker: ServiceWorker | null) => {
    if (!worker) return;
    const check = () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) toast.hidden = false;
    };
    check();
    worker.addEventListener('statechange', check);
  };

  // The first install takes control without a reload. After that, a new version taking
  // over (from this tab or another) means this page's files are out of date.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (controlled) reload();
    controlled = true;
  });

  action.addEventListener('click', async () => {
    action.disabled = true;
    action.textContent = 'Updating…';
    if (registration) {
      // Fetch anything published since the prompt appeared, so one click is always enough.
      const check = registration.update().catch(() => undefined);
      await atMost(check, 5000);
      await atMost(installDone(registration.installing), 10000);
    }
    const waiting = registration?.waiting;
    if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
    else reload();
    // Never leave a dead button: reload anyway if the new version doesn't take over.
    setTimeout(reload, 4000);
  });

  window.addEventListener('load', async () => {
    try {
      const current = await navigator.serviceWorker.register('/sw.js');
      registration = current;
      watch(current.waiting);
      watch(current.installing);
      current.addEventListener('updatefound', () => watch(current.installing));
    } catch {
      /* offline support is a bonus; the app works without it */
    }
  });
}
