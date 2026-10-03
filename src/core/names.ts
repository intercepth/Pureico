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
