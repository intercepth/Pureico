import { moonLoader } from '../art/moon';
import type { Controller } from '../app/controller';
import type { DownloadOption, State, Store } from '../app/state';
import { manifestSnippet } from '../core/manifest';
import { $, h } from '../lib/dom';
import { downloadBlob } from '../lib/download';
import { formatBytes } from '../lib/validate';
import type { Messages } from './messages';

function statusText(state: State): { text: string; busy: boolean } {
  const { items, formats, icoSizes, downloads } = state;
  if (items.length === 0) return { text: 'Drop an image to begin.', busy: false };
  if (!formats.ico && !formats.icns && !formats.ext) {
    return { text: 'Pick at least one format above.', busy: false };
  }
  if (formats.ico && icoSizes.length === 0 && !formats.icns && !formats.ext) {
    return { text: 'Pick at least one ICO size above.', busy: false };
  }
  const processing = items.filter((i) => i.status === 'processing').length;
  if (processing > 0 || downloads === null) {
    const done = items.length - processing;
    const progress = items.length > 1 ? ` ${done} of ${items.length} done.` : '';
    return { text: `Charting your icons…${progress}`, busy: true };
  }
  const ready = items.filter((i) => i.status === 'ready').length;
  if (ready === 0)
    return { text: 'Nothing to download yet. Check the messages above.', busy: false };
  if (ready < items.length) {
    return {
      text: `${ready} of ${items.length} images are ready. The rest had problems.`,
      busy: false,
    };
  }
  return {
    text: ready > 1 ? `All ${ready} images are ready.` : 'Your icons are ready.',
    busy: false,
  };
}

export function initDownload(store: Store, controller: Controller, messages: Messages): void {
  const panel = $('.download');
  const text = $('.download-text', panel);
  const loaderSlot = $('.moon-loader', panel);
  const actions = $('.download-actions', panel);
  const thanks = $('.thanks', panel);
  const manifest = $('.manifest');
  const code = $('.manifest-code code', manifest);
  const copy = $<HTMLButtonElement>('.manifest-copy', manifest);

  loaderSlot.replaceWith(moonLoader());
  const loader = $('.moon-loader', panel);
  code.textContent = manifestSnippet();

  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(manifestSnippet());
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.execCommand('copy');
    }
    copy.textContent = 'Copied ✓';
    setTimeout(() => (copy.textContent = 'Copy'), 2000);
  });

  const onDownload = (option: DownloadOption) => {
    downloadBlob(option.blob, option.fileName);
    thanks.hidden = false;
    panel.classList.remove('just-downloaded');
    void panel.offsetWidth;
    panel.classList.add('just-downloaded');
    void controller.recordDownload(option);
  };

  let rendered: DownloadOption[] | null | undefined;
  store.subscribe((state) => {
    const status = statusText(state);
    text.textContent = status.text;
    loader.hidden = !status.busy;
    panel.classList.toggle('is-busy', status.busy);
    manifest.hidden = !state.formats.ext;

    const options = status.busy ? null : state.downloads;
    if (options === rendered) return;
    rendered = options;
    thanks.hidden = true;
    actions.replaceChildren(
      ...(options ?? []).map((option) => {
        const button = h(
          'button',
          {
            class: option.primary ? 'button button-primary' : 'button button-secondary',
            attrs: { type: 'button', 'data-file': option.fileName },
          },
          h('span', { class: 'button-label', text: option.label }),
          h('span', { class: 'button-detail', text: formatBytes(option.blob.size) }),
        );
        button.addEventListener('click', () => onDownload(option));
        return button;
      }),
    );
    panel.classList.toggle('is-ready', !!options?.length);
    if (state.items.length === 0) {
      thanks.hidden = true;
      messages.clear('output');
    }
  });
}
