const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** Turns an uploaded file name into a safe base name for generated files. */
export function baseName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^./\\]+$/, '');
  let name = withoutExtension
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
    .slice(0, 64)
    .trim();
  if (!name) name = 'icon';
  if (WINDOWS_RESERVED.test(name)) name = `${name}-icon`;
  return name;
}

/**
 * The .ico file name: browsers look for favicon.ico, while Electron and Tauri apps look
 * for icon.ico. Only sizes up to 48 px make it a favicon.
 */
export function icoFileName(sizes: readonly number[]): string {
  return sizes.length > 0 && sizes.every((size) => size <= 48) ? 'favicon.ico' : 'icon.ico';
}

/** The name Electron and Tauri look for by default. */
export const ICNS_FILE_NAME = 'icon.icns';

/** De-duplicates names case-insensitively by appending -2, -3, … */
export function uniqueNames(names: readonly string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${name}-${n}`;
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}
