import { sprite } from '../art/sprites';
import type { Notifier } from '../app/controller';
import { $, h } from '../lib/dom';

/** Inline, dismissible notices rendered into `.messages[data-region]` containers. */
export class Messages implements Notifier {
  private region(name: string): HTMLElement {
    return $(`.messages[data-region="${name}"]`);
  }

  show(region: string, kind: 'error' | 'warning', text: string, key?: string): void {
    const container = this.region(region);
    if (key) container.querySelector(`[data-key="${key}"]`)?.remove();
    const icon = h('span', { class: 'msg-icon' }, sprite('warn'));
    const dismiss = h('button', {
      class: 'msg-dismiss',
      text: '×',
      attrs: { type: 'button', 'aria-label': 'Dismiss message' },
    });
    const message = h(
      'div',
      {
        class: `msg msg-${kind}`,
        attrs: { role: kind === 'error' ? 'alert' : 'status' },
        dataset: key ? { key } : {},
      },
      icon,
      h('p', { class: 'msg-text', text }),
      dismiss,
    );
    dismiss.addEventListener('click', () => message.remove());
    container.append(message);
  }

  clear(region: string, key?: string): void {
    const container = this.region(region);
    if (key) container.querySelector(`[data-key="${key}"]`)?.remove();
    else container.replaceChildren();
  }

  /** Replaces a region's notices with a computed list, keeping unchanged ones in place. */
  sync(region: string, notices: { kind: 'error' | 'warning'; text: string; key: string }[]): void {
    const container = this.region(region);
    const wanted = new Map(notices.map((n) => [n.key, n]));
    container.querySelectorAll<HTMLElement>('.msg').forEach((el) => {
      const notice = wanted.get(el.dataset.key ?? '');
      const text = el.querySelector('.msg-text')?.textContent;
      if (!notice || notice.text !== text) el.remove();
      else wanted.delete(notice.key);
    });
    for (const notice of wanted.values()) this.show(region, notice.kind, notice.text, notice.key);
  }
}
