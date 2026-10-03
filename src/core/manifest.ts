import { EXTENSION_SIZES } from './sizes';

export const EXTENSION_ICON_DIR = 'icons';

export function extensionIconPath(size: number): string {
  return `${EXTENSION_ICON_DIR}/icon-${size}.png`;
}

function iconMap(sizes: readonly number[]): Record<string, string> {
  return Object.fromEntries(sizes.map((size) => [String(size), extensionIconPath(size)]));
}

/** The Manifest V3 keys that reference the generated extension icons. */
export function manifestIcons() {
  return {
    icons: iconMap(EXTENSION_SIZES),
    action: { default_icon: iconMap(EXTENSION_SIZES.filter((size) => size <= 32)) },
  };
}

/** The same keys as a fragment ready to paste inside an existing manifest.json. */
export function manifestSnippet(): string {
  const json = JSON.stringify(manifestIcons(), null, 2);
  return json
    .slice(1, -1)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => line.slice(2))
    .join('\n');
}
