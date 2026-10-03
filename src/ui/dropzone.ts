import { $ } from '../lib/dom';

const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']);

const TITLES = {
  idle: 'Drop images here',
  ok: 'Release to launch',
  bad: 'Some of these files aren’t supported',
} as const;

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false;
}

/** Guesses from MIME types (names aren't readable until drop) whether the drag is usable. */
function verdict(event: DragEvent): 'ok' | 'bad' {
  const items = [...(event.dataTransfer?.items ?? [])].filter((i) => i.kind === 'file');
  const known = items.map((i) => i.type).filter(Boolean);
  return known.some((type) => !ACCEPTED_TYPES.has(type)) ? 'bad' : 'ok';
}

export function initDropzone(onFiles: (files: File[]) => void): void {
  const input = $<HTMLInputElement>('#file-input');
  const zone = $('.dropzone');
  const title = $('.dropzone-title', zone);
  let depth = 0;

  const setState = (state: keyof typeof TITLES) => {
    zone.classList.toggle('is-dragging', state !== 'idle');
    zone.dataset.verdict = state;
    title.textContent = TITLES[state];
  };

  input.addEventListener('change', () => {
    const files = [...(input.files ?? [])];
    input.value = '';
    onFiles(files);
  });

  window.addEventListener('dragenter', (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth++;
    setState(verdict(event));
  });

  window.addEventListener('dragover', (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });

  window.addEventListener('dragleave', (event) => {
    if (!carriesFiles(event)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) setState('idle');
  });

  window.addEventListener('drop', (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth = 0;
    setState('idle');
    onFiles([...(event.dataTransfer?.files ?? [])]);
  });

  window.addEventListener('paste', (event) => {
    const files = [...(event.clipboardData?.files ?? [])];
    if (files.length === 0) return;
    event.preventDefault();
    onFiles(files);
  });
}
