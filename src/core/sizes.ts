export const ICO_SIZES = [16, 32, 48, 64, 128, 256] as const;
export type IcoSize = (typeof ICO_SIZES)[number];

export const ICO_PRESETS = {
  favicon: [16, 32, 48],
  desktop: [16, 32, 48, 256],
} as const satisfies Record<string, readonly IcoSize[]>;
export type IcoPreset = keyof typeof ICO_PRESETS;

export const DEFAULT_ICO_SIZES: readonly IcoSize[] = ICO_PRESETS.desktop;

/** Every pixel size an Apple iconset needs (16 pt through 512 pt @2x). */
export const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024] as const;

/** Sizes recommended for Manifest V3 browser extensions. */
export const EXTENSION_SIZES = [16, 32, 48, 128] as const;

export interface OutputFormats {
  ico: boolean;
  icns: boolean;
  ext: boolean;
}

export const DEFAULT_FORMATS: OutputFormats = { ico: true, icns: false, ext: false };

/** All pixel sizes that have to be rendered for the given settings, ascending. */
export function requiredSizes(icoSizes: readonly number[], formats: OutputFormats): number[] {
  const sizes = new Set<number>();
  if (formats.ico) icoSizes.forEach((s) => sizes.add(s));
  if (formats.icns) ICNS_SIZES.forEach((s) => sizes.add(s));
  if (formats.ext) EXTENSION_SIZES.forEach((s) => sizes.add(s));
  return [...sizes].sort((a, b) => a - b);
}
