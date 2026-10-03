import { Controller, loadPrefs } from './app/controller';
import { RecentStore } from './app/recent';
import { Store } from './app/state';
import { DEFAULT_FORMATS, DEFAULT_ICO_SIZES } from './core/sizes';
import { $ } from './lib/dom';
import { defaultPoolSize, WorkerPool } from './lib/pool';
import { initShell } from './shell';
import { initDownload } from './ui/download';
import { initDropzone } from './ui/dropzone';
import { initFileList } from './ui/files';
import { initInstallButton, initPrivacyPanel } from './ui/header';
import { Messages } from './ui/messages';
import { initOutputs } from './ui/outputs';
import { initPreview } from './ui/preview';
import { initRecent } from './ui/recent';
import { initShape } from './ui/shape';

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function start(): void {
  initShell();
  initPrivacyPanel();
  initInstallButton();

  if (typeof OffscreenCanvas === 'undefined' || typeof Worker === 'undefined') {
    const messages = new Messages();
    messages.show(
      'input',
      'error',
      'This browser is too old for Pureico. Please update to a current version of Chrome, Edge, Firefox or Safari.',
    );
    $<HTMLInputElement>('#file-input').disabled = true;
    return;
  }

  const prefs = loadPrefs();
  const store = new Store({
    items: [],
    selectedId: null,
    icoSizes: prefs.icoSizes ?? [...DEFAULT_ICO_SIZES],
    formats: prefs.formats ?? { ...DEFAULT_FORMATS },
    downloads: [],
  });
  const messages = new Messages();
  const recents = new RecentStore(sessionStore());
  const refreshRecent = initRecent(recents);
  const controller = new Controller(
    store,
    new WorkerPool(defaultPoolSize()),
    recents,
    messages,
    refreshRecent,
  );

  initDropzone((files) => void controller.addFiles(files));
  initFileList(store, controller);
  initShape(store, controller);
  initPreview(store, messages);
  initOutputs(store, controller);
  initDownload(store, controller, messages);
}

start();
