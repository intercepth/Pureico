import type { Item, State, Store } from '../app/state';
import { ICNS_SIZES } from '../core/sizes';
import { $, $$ } from '../lib/dom';
import { quoted } from '../lib/validate';
import type { Messages } from './messages';

const PLACEHOLDER = '/favicon.svg';

/** The largest size the current settings will produce. */
function largestOutput(state: State): number {
  let largest = 0;
  if (state.formats.ico && state.icoSizes.length) largest = Math.max(...state.icoSizes);
  if (state.formats.icns) largest = Math.max(largest, ICNS_SIZES[ICNS_SIZES.length - 1]);
  if (state.formats.ext) largest = Math.max(largest, 128);
  return largest;
}

function itemNotices(item: Item, state: State) {
  const notices: { kind: 'error' | 'warning'; text: string; key: string }[] = [];
  if (item.status === 'error' && item.error) {
    notices.push({ kind: 'error', text: item.error, key: `error-${item.id}` });
  }
  item.notes.forEach((text, i) =>
    notices.push({ kind: 'warning', text, key: `note-${item.id}-${i}` }),
  );

  if (item.kind !== 'svg') {
    const side = Math.round(
      item.mode === 'crop' && item.width !== item.height
        ? item.crop.size
        : Math.max(item.width, item.height),
    );
    const largest = largestOutput(state);
    if (side < largest) {
      notices.push({
        kind: 'warning',
        key: `upscale-${item.id}`,
        text: `${quoted(item.file.name || item.name)} gives ${side} px to work with, so sizes up to ${largest} px are upscaled and may look soft. A ${largest} px image or an SVG stays sharp.`,
      });
    }
  }
  return notices;
}

export function initPreview(store: Store, messages: Messages): void {
  const favicons = $$<HTMLImageElement>('.mock-tab.is-active .mock-favicon');
  const zoom = $<HTMLImageElement>('.zoom-image');
  const tryButton = $<HTMLButtonElement>('.try-tab');
  const pageIcons = $$<HTMLLinkElement>('link[rel="icon"]');
  const originalIcons = pageIcons.map((link) => ({ link, href: link.href, type: link.type }));
  let trying = false;

  const restoreIcons = () => {
    originalIcons.forEach(({ link, href, type }) => {
      link.href = href;
      link.type = type;
    });
    trying = false;
    tryButton.textContent = 'Try it in this tab';
  };

  tryButton.addEventListener('click', () => {
    const item = store.selected();
    const url = item?.result?.urls.get(32) ?? item?.result?.urls.get(16);
    if (trying || !url) {
      restoreIcons();
      return;
    }
    pageIcons.forEach((link) => {
      link.href = url;
      link.type = 'image/png';
    });
    trying = true;
    tryButton.textContent = 'Restore Pureico’s icon';
  });

  let shown = '';
  store.subscribe((state) => {
    const item = state.items.find((i) => i.id === state.selectedId);
    const urls = item?.result?.urls;
    const small = urls?.get(16);
    const key = small ? `${small}|${urls?.get(32) ?? ''}` : PLACEHOLDER;

    if (key !== shown) {
      shown = key;
      favicons.forEach((img) => {
        img.src = small ?? PLACEHOLDER;
        if (small && urls?.get(32)) img.srcset = `${small} 1x, ${urls.get(32)} 2x`;
        else img.removeAttribute('srcset');
      });
      zoom.src = small ?? PLACEHOLDER;
    }

    tryButton.disabled = !small;
    if (!small && trying) restoreIcons();

    messages.sync('item', item ? itemNotices(item, state) : []);
  });
}
