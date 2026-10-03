import type { Controller } from '../app/controller';
import type { Store } from '../app/state';
import { ICO_PRESETS, ICO_SIZES, type IcoPreset, type OutputFormats } from '../core/sizes';
import { $, $$, h } from '../lib/dom';

interface SizeCard {
  input: HTMLInputElement;
  img: HTMLImageElement;
}

export function initOutputs(store: Store, controller: Controller): void {
  const formatInputs = $$<HTMLInputElement>('input[name="format"]');
  const sizesFieldset = $<HTMLFieldSetElement>('.sizes');
  const grid = $('.size-grid', sizesFieldset);
  const presets = $$<HTMLButtonElement>('[data-preset]', sizesFieldset);
  const cards = new Map<number, SizeCard>();

  for (const size of ICO_SIZES) {
    const input = h('input', {
      attrs: { type: 'checkbox', role: 'switch', name: 'ico-size', value: String(size) },
    });
    const img = h('img', {
      class: 'size-image',
      attrs: { alt: '', width: String(Math.min(size, 64)), height: String(Math.min(size, 64)) },
    });
    const card = h(
      'label',
      { class: 'size-card', dataset: { size: String(size) } },
      input,
      h('span', { class: 'size-preview' }, img),
      h('span', { class: 'size-label', text: `${size}` }, h('small', { text: ' px' })),
      h(
        'span',
        { class: 'switch', attrs: { 'aria-hidden': 'true' } },
        h('span', { class: 'switch-knob' }),
      ),
    );
    input.addEventListener('change', () => {
      const selected = [...cards].filter(([, c]) => c.input.checked).map(([s]) => s);
      controller.setIcoSizes(selected);
    });
    grid.append(card);
    cards.set(size, { input, img });
  }

  formatInputs.forEach((input) =>
    input.addEventListener('change', () => {
      const formats = Object.fromEntries(formatInputs.map((i) => [i.value, i.checked]));
      controller.setFormats(formats as unknown as OutputFormats);
    }),
  );

  presets.forEach((button) =>
    button.addEventListener('click', () => {
      controller.setIcoSizes([...ICO_PRESETS[button.dataset.preset as IcoPreset]]);
    }),
  );

  store.subscribe((state) => {
    formatInputs.forEach((input) => {
      input.checked = state.formats[input.value as keyof OutputFormats];
    });
    sizesFieldset.disabled = !state.formats.ico;
    const selected = store.selected();
    for (const [size, card] of cards) {
      card.input.checked = state.icoSizes.includes(size);
      // With nothing loaded yet, show Pureico's own planet so the sizes read as previews.
      const url = selected ? selected.result?.urls.get(size) : '/favicon.svg';
      if (url) {
        if (card.img.getAttribute('src') !== url) card.img.src = url;
      } else {
        card.img.removeAttribute('src');
      }
    }
    const current = state.icoSizes.join(',');
    presets.forEach((button) => {
      const preset = ICO_PRESETS[button.dataset.preset as IcoPreset].join(',');
      button.setAttribute('aria-pressed', String(preset === current));
    });
  });
}
