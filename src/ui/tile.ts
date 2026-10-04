import type { Controller } from '../app/controller';
import type { Store } from '../app/state';
import { sameTile, type Corners, type TileStyle } from '../core/tile';
import { $, $$ } from '../lib/dom';

const NOTES: Record<Corners, string> = {
  square: 'Keeps the image’s own corners.',
  rounded: 'Rounds every corner. 50% makes a circle.',
  macos:
    'Apple’s app icon shape, margin and shadow for macOS 11 and later. Best for .icns: the margin makes favicons look small.',
};

const NOT_SQUARE =
  ' This image isn’t square, so the corners fall in the empty space around it. Crop it or turn on Background to see them.';

const ARROW_STEPS: Partial<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

interface Slider {
  row: HTMLElement;
  input: HTMLInputElement;
  readout: HTMLElement;
}

function slider(root: ParentNode, name: 'radius' | 'padding'): Slider {
  const row = $(`[data-slider="${name}"]`, root);
  return {
    row,
    input: $<HTMLInputElement>('input', row),
    readout: $('.tile-value', row),
  };
}

function showSlider({ row, input, readout }: Slider, visible: boolean, value: number): void {
  row.hidden = !visible;
  if (input.valueAsNumber !== value) input.value = String(value);
  readout.textContent = `${value}%`;
  input.setAttribute('aria-valuetext', `${value}%`);
  const min = Number(input.min);
  const max = Number(input.max);
  input.style.setProperty('--value', `${((value - min) / (max - min)) * 100}%`);
}

export function initTile(store: Store, controller: Controller): void {
  const section = $('.tile');
  const radios = $$<HTMLButtonElement>('[data-corners]', section);
  const note = $('.tile-note', section);
  const radius = slider(section, 'radius');
  const padding = slider(section, 'padding');
  const fill = $<HTMLInputElement>('.tile-fill-input', section);
  const color = $<HTMLInputElement>('.tile-color', section);
  const preview = $<HTMLImageElement>('.tile-image', section);
  const applyAll = $<HTMLButtonElement>('.tile-all', section);

  const choose = (corners: Corners) => controller.setTile({ corners }, true);
  radios.forEach((radio) =>
    radio.addEventListener('click', () => choose(radio.dataset.corners as Corners)),
  );
  $('[role="radiogroup"]', section).addEventListener('keydown', (event) => {
    const step = ARROW_STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    // Read the store, not the DOM, which only catches up on the next frame.
    const corners = store.selected()?.tile.corners;
    const current = radios.findIndex((r) => r.dataset.corners === corners);
    const next = radios[(current + step + radios.length) % radios.length];
    choose(next.dataset.corners as Corners);
    next.focus();
  });

  // Dragging renders shortly after the slider stops; letting go renders right away.
  const bind = ({ input }: Slider, key: 'radius' | 'padding') => {
    const update = (settle: boolean) => controller.setTile({ [key]: input.valueAsNumber }, settle);
    input.addEventListener('input', () => update(false));
    input.addEventListener('change', () => update(true));
  };
  bind(radius, 'radius');
  bind(padding, 'padding');

  fill.addEventListener('change', () => controller.setTile({ fill: fill.checked }, true));
  // Picking a color turns the background on.
  color.addEventListener('input', () =>
    controller.setTile({ fill: true, color: color.value }, false),
  );
  color.addEventListener('change', () =>
    controller.setTile({ fill: true, color: color.value }, true),
  );
  applyAll.addEventListener('click', () => controller.applyTileToAll());

  store.subscribe((state) => {
    const item = state.items.find((i) => i.id === state.selectedId);
    if (!item) return;
    const tile: TileStyle = item.tile;

    radios.forEach((radio) => {
      const checked = radio.dataset.corners === tile.corners;
      radio.setAttribute('aria-checked', String(checked));
      radio.tabIndex = checked ? 0 : -1;
    });
    // Fitting pads a non-square image with transparency, which is where the corners land.
    const padded = item.width !== item.height && item.mode === 'fit';
    const hint = padded && tile.corners !== 'square' && !tile.fill ? NOT_SQUARE : '';
    note.textContent = NOTES[tile.corners] + hint;
    showSlider(radius, tile.corners === 'rounded', tile.radius);
    showSlider(padding, tile.fill, tile.padding);
    fill.checked = tile.fill;
    if (color.value !== tile.color) color.value = tile.color;

    const url = item.result?.urls.get(256);
    if (!url) preview.removeAttribute('src');
    else if (preview.getAttribute('src') !== url) preview.src = url;

    applyAll.hidden = !state.items.some((other) => !sameTile(other.tile, tile));
    applyAll.textContent = `Apply to all ${state.items.length} images`;
  });
}
