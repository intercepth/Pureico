import { moonLoader } from '../art/moon';
import { sprite } from '../art/sprites';
import type { Controller } from '../app/controller';
import type { Item, State, Store } from '../app/state';
import { $, h } from '../lib/dom';

interface Row {
  li: HTMLLIElement;
  select: HTMLButtonElement;
  thumb: HTMLImageElement;
  info: HTMLSpanElement;
  status: HTMLSpanElement;
  statusKey: string;
}

export function initFileList(store: Store, controller: Controller): void {
  const section = $('.files');
  const list = $<HTMLUListElement>('.file-list', section);
  const rows = new Map<string, Row>();

  $('.files-clear', section).addEventListener('click', () => controller.clearAll());

  const createRow = (item: Item): Row => {
    const thumb = h('img', { class: 'file-thumb', attrs: { alt: '', src: item.previewUrl } });
    const info = h('span', { class: 'file-info' });
    const status = h('span', { class: 'file-status' });
    const select = h(
      'button',
      { class: 'file-select', attrs: { type: 'button' } },
      h('span', { class: 'file-thumb-frame' }, thumb),
      h('span', { class: 'file-meta' }, h('span', { class: 'file-name', text: item.name }), info),
      status,
    );
    const remove = h('button', {
      class: 'file-remove',
      text: '×',
      attrs: { type: 'button', 'aria-label': `Remove ${item.name}` },
    });
    select.addEventListener('click', () => controller.select(item.id));
    remove.addEventListener('click', () => controller.remove(item.id));
    const li = h('li', { class: 'file', dataset: { id: item.id } }, select, remove);
    return { li, select, thumb, info, status, statusKey: '' };
  };

  const promises = $('.promises');

  const render = (state: State) => {
    section.hidden = state.items.length === 0;
    promises.hidden = state.items.length > 0;
    const seen = new Set<string>();
    state.items.forEach((item, index) => {
      seen.add(item.id);
      let row = rows.get(item.id);
      if (!row) {
        row = createRow(item);
        rows.set(item.id, row);
      }
      if (list.children[index] !== row.li) list.insertBefore(row.li, list.children[index] ?? null);

      const selected = item.id === state.selectedId;
      row.li.classList.toggle('is-selected', selected);
      row.select.setAttribute('aria-pressed', String(selected));
      row.li.dataset.status = item.status;
      row.info.textContent =
        item.status === 'error' ? 'Couldn’t convert' : controller.describe(item);

      if (row.statusKey !== item.status) {
        row.statusKey = item.status;
        const label =
          item.status === 'processing' ? 'Processing' : item.status === 'ready' ? 'Ready' : 'Error';
        const icon =
          item.status === 'processing'
            ? moonLoader()
            : sprite(item.status === 'ready' ? 'check' : 'warn');
        row.status.replaceChildren(icon, h('span', { class: 'visually-hidden', text: label }));
      }
    });
    for (const [id, row] of rows) {
      if (!seen.has(id)) {
        row.li.remove();
        rows.delete(id);
      }
    }
    $('.files-clear', section).hidden = state.items.length < 2;
  };

  store.subscribe(render);
}
