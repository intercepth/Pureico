import type { Controller } from '../app/controller';
import { defaultCrop, type Crop, type Item, type Store } from '../app/state';
import { $, $$ } from '../lib/dom';

type Handle = 'nw' | 'ne' | 'sw' | 'se';

interface Drag {
  pointerId: number;
  handle: Handle | 'move';
  startX: number;
  startY: number;
  start: Crop;
  /** Source pixels per screen pixel. */
  scale: number;
}

function clampCrop(crop: Crop, item: Item): Crop {
  const minSize = Math.max(1, Math.min(16, item.width, item.height));
  const size = Math.min(Math.max(crop.size, minSize), item.width, item.height);
  return {
    size,
    x: Math.min(Math.max(crop.x, 0), item.width - size),
    y: Math.min(Math.max(crop.y, 0), item.height - size),
  };
}

/** Resizes from a corner while the opposite corner stays put. */
function resize(start: Crop, handle: Handle, dx: number, dy: number, item: Item): Crop {
  const right = start.x + start.size;
  const bottom = start.y + start.size;
  const growX = handle === 'ne' || handle === 'se' ? dx : -dx;
  const growY = handle === 'sw' || handle === 'se' ? dy : -dy;
  const minSize = Math.max(1, Math.min(16, item.width, item.height));
  const room =
    handle === 'se'
      ? Math.min(item.width - start.x, item.height - start.y)
      : handle === 'nw'
        ? Math.min(right, bottom)
        : handle === 'ne'
          ? Math.min(item.width - start.x, bottom)
          : Math.min(right, item.height - start.y);
  const size = Math.min(Math.max(start.size + Math.max(growX, growY), minSize), room);
  return {
    size,
    x: handle === 'nw' || handle === 'sw' ? right - size : start.x,
    y: handle === 'nw' || handle === 'ne' ? bottom - size : start.y,
  };
}

export function initShape(store: Store, controller: Controller): void {
  const section = $('.shape');
  const note = $('.shape-note', section);
  const stage = $('.crop-stage', section);
  const frame = $('.crop-frame', section);
  const image = $<HTMLImageElement>('.crop-image', section);
  const box = $('.crop-box', section);
  const reset = $<HTMLButtonElement>('.crop-reset', section);
  const radios = $$<HTMLButtonElement>('[data-mode]', section);
  let drag: Drag | null = null;

  const placeBox = (item: Item) => {
    const { x, y, size } = item.crop;
    box.style.left = `${(x / item.width) * 100}%`;
    box.style.top = `${(y / item.height) * 100}%`;
    box.style.width = `${(size / item.width) * 100}%`;
    box.style.height = `${(size / item.height) * 100}%`;
  };

  const commit = (crop: Crop, settle: boolean) => {
    const item = store.selected();
    if (!item) return;
    controller.setCrop(clampCrop(crop, item), settle);
    placeBox(item);
  };

  radios.forEach((radio) =>
    radio.addEventListener('click', () => controller.setMode(radio.dataset.mode as 'fit' | 'crop')),
  );
  section.querySelector('.segmented')?.addEventListener('keydown', (event) => {
    const e = event as KeyboardEvent;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const item = store.selected();
    const next = item?.mode === 'fit' ? 'crop' : 'fit';
    controller.setMode(next);
    radios.find((r) => r.dataset.mode === next)?.focus();
  });

  reset.addEventListener('click', () => {
    const item = store.selected();
    if (item) commit(defaultCrop(item.width, item.height), true);
  });

  box.addEventListener('pointerdown', (event) => {
    const item = store.selected();
    if (!item || event.button !== 0) return;
    event.preventDefault();
    const target = event.target as HTMLElement;
    const handle = (target.dataset.handle as Handle | undefined) ?? 'move';
    box.setPointerCapture(event.pointerId);
    drag = {
      pointerId: event.pointerId,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      start: { ...item.crop },
      scale: item.width / frame.getBoundingClientRect().width,
    };
    box.classList.add('is-dragging');
  });

  box.addEventListener('pointermove', (event) => {
    const item = store.selected();
    if (!drag || !item || event.pointerId !== drag.pointerId) return;
    const dx = (event.clientX - drag.startX) * drag.scale;
    const dy = (event.clientY - drag.startY) * drag.scale;
    const next =
      drag.handle === 'move'
        ? { ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy }
        : resize(drag.start, drag.handle, dx, dy, item);
    commit(next, false);
  });

  const endDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    box.classList.remove('is-dragging');
    const item = store.selected();
    if (item) commit(item.crop, true);
  };
  box.addEventListener('pointerup', endDrag);
  box.addEventListener('pointercancel', endDrag);
  box.addEventListener('dblclick', () => reset.click());

  box.addEventListener('keydown', (event) => {
    const item = store.selected();
    if (!item) return;
    const unit = Math.max(1, Math.round(Math.min(item.width, item.height) * 0.01));
    const step = event.shiftKey ? unit * 10 : unit;
    const crop = { ...item.crop };
    switch (event.key) {
      case 'ArrowLeft':
        crop.x -= step;
        break;
      case 'ArrowRight':
        crop.x += step;
        break;
      case 'ArrowUp':
        crop.y -= step;
        break;
      case 'ArrowDown':
        crop.y += step;
        break;
      case '+':
      case '=':
        crop.x -= step * 2.5;
        crop.y -= step * 2.5;
        crop.size += step * 5;
        break;
      case '-':
      case '_':
        crop.x += step * 2.5;
        crop.y += step * 2.5;
        crop.size -= step * 5;
        break;
      case 'Home':
        commit(defaultCrop(item.width, item.height), true);
        event.preventDefault();
        return;
      default:
        return;
    }
    event.preventDefault();
    commit(crop, false);
  });

  let shownId: string | null = null;
  store.subscribe((state) => {
    const item = state.items.find((i) => i.id === state.selectedId);
    section.hidden = !item;
    if (!item) {
      shownId = null;
      return;
    }

    if (shownId !== item.id) {
      shownId = item.id;
      image.src = item.previewUrl;
      const landscape = item.width >= item.height;
      frame.style.width = landscape ? '100%' : `${(item.width / item.height) * 100}%`;
      frame.style.height = landscape ? `${(item.height / item.width) * 100}%` : '100%';
    }

    const square = item.width === item.height;
    const cropping = item.mode === 'crop' && !square;
    section.dataset.mode = cropping ? 'crop' : 'fit';
    radios.forEach((radio) => {
      const checked = radio.dataset.mode === item.mode;
      radio.setAttribute('aria-checked', String(checked));
      radio.tabIndex = checked ? 0 : -1;
      radio.disabled = square;
    });
    box.hidden = !cropping;
    reset.hidden = !cropping;
    if (cropping && !drag) placeBox(item);

    note.textContent = square
      ? 'Already square, so there’s nothing to adjust.'
      : cropping
        ? 'Drag the square to choose what to keep. Drag a corner to resize.'
        : 'Centered on a transparent square, so nothing gets stretched.';
    stage.classList.toggle('is-square', square);
  });
}
