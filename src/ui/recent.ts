import type { RecentEntry, RecentStore } from '../app/recent';
import { sprite } from '../art/sprites';
import { $, h } from '../lib/dom';
import { downloadBlob } from '../lib/download';
import { formatBytes } from '../lib/validate';

function timeAgo(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} h ago`;
}

/** The file name with its extension kept apart, so long names shorten in the middle. */
function fileNameParts(fileName: string): [stem: string, extension: string] {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? [fileName.slice(0, dot), fileName.slice(dot)] : [fileName, ''];
}

function card(entry: RecentEntry, recents: RecentStore): HTMLLIElement {
  const [stem, extension] = fileNameParts(entry.fileName);
  const button = h(
    'button',
    {
      class: 'chip recent-download',
      attrs: { type: 'button', 'aria-label': `Download ${entry.fileName} again` },
    },
    h('span', { class: 'recent-download-icon' }, sprite('download')),
    'Download again',
  );
  button.addEventListener('click', () => {
    const blob = recents.blob(entry.id);
    if (blob) downloadBlob(blob, entry.fileName);
  });
  const thumb = entry.thumb
    ? h('img', { class: 'recent-thumb', attrs: { src: entry.thumb, alt: '' } })
    : h('span', { class: 'recent-thumb' });

  return h(
    'li',
    { class: 'recent-item' },
    h('span', { class: 'recent-thumb-frame' }, thumb),
    h(
      'span',
      { class: 'recent-meta' },
      h(
        'span',
        { class: 'recent-name', attrs: { title: entry.fileName } },
        h('span', { class: 'recent-stem', text: stem }),
        h('span', { class: 'recent-ext', text: extension }),
      ),
      // Generic names such as icon.ico need the image they came from to tell them apart.
      !entry.fileName.startsWith(entry.name) &&
        h('span', { class: 'recent-source', text: `from ${entry.name}` }),
      h(
        'span',
        { class: 'recent-info' },
        ...entry.formats.map((format) => h('span', { class: 'recent-format', text: format })),
        h('span', {
          class: 'recent-detail',
          text: `${formatBytes(entry.size)} · ${timeAgo(entry.createdAt)}`,
        }),
      ),
    ),
    button,
  );
}

/** Renders Recent conversions; returns a function that refreshes the list. */
export function initRecent(recents: RecentStore): () => void {
  const section = $('.recent');
  const list = $<HTMLUListElement>('.recent-list', section);

  const render = () => {
    const entries = recents.list();
    section.hidden = entries.length === 0;
    list.replaceChildren(...entries.map((entry) => card(entry, recents)));
  };

  $('.recent-clear', section).addEventListener('click', () => {
    recents.clear();
    render();
  });

  render();
  setInterval(render, 60_000);
  return render;
}
