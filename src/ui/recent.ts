import type { RecentStore } from '../app/recent';
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

/** Renders Recent conversions; returns a function that refreshes the list. */
export function initRecent(recents: RecentStore): () => void {
  const section = $('.recent');
  const list = $<HTMLUListElement>('.recent-list', section);

  const render = () => {
    const entries = recents.list();
    section.hidden = entries.length === 0;
    list.replaceChildren(
      ...entries.map((entry) => {
        const button = h('button', {
          class: 'chip recent-download',
          text: 'Download again',
          attrs: { type: 'button', 'aria-label': `Download ${entry.fileName} again` },
        });
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
            h('span', { class: 'recent-name', text: entry.fileName }),
            h('span', {
              class: 'recent-info',
              text: `${entry.formats.join(' · ')} · ${formatBytes(entry.size)} · ${timeAgo(entry.createdAt)}`,
            }),
          ),
          button,
        );
      }),
    );
  };

  $('.recent-clear', section).addEventListener('click', () => {
    recents.clear();
    render();
  });

  render();
  setInterval(render, 60_000);
  return render;
}
