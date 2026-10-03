import { readFile } from 'node:fs/promises';
import { test as base, expect, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';

/** Every test fails on console errors (including CSP violations) or native dialogs. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('dialog', (dialog) => {
        errors.push(`Unexpected dialog: ${dialog.message()}`);
        void dialog.dismiss();
      });
      await use(errors);
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export interface FilePayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

export type Shape = 'wide-bar' | 'tall-bar' | 'square-star';

/** Draws a test image in the browser and returns it as a PNG file payload. */
export async function png(page: Page, name: string, width: number, height: number, shape: Shape) {
  const bytes = await page.evaluate(
    async ({ width, height, shape }) => {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#7c3aed';
      if (shape === 'square-star') {
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, width * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fcd34d';
        ctx.fillRect(width * 0.4, width * 0.4, width * 0.2, width * 0.2);
      } else {
        ctx.fillRect(0, 0, width, height);
      }
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return [...new Uint8Array(await blob.arrayBuffer())];
    },
    { width, height, shape },
  );
  return { name, mimeType: 'image/png', buffer: Buffer.from(bytes) } satisfies FilePayload;
}

export function svg(name: string, source: string): FilePayload {
  return { name, mimeType: 'image/svg+xml', buffer: Buffer.from(source) };
}

export function file(name: string, mimeType: string, buffer: Buffer): FilePayload {
  return { name, mimeType, buffer };
}

/** A PNG header that claims the given size, without any pixel data behind it. */
export function pngHeader(width: number, height: number): Buffer {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

export async function upload(page: Page, files: FilePayload[]) {
  await page.setInputFiles('#file-input', files);
}

/** Waits until every image is processed and the download buttons are in place. */
export async function waitForDownloads(page: Page) {
  await expect(page.locator('.download')).not.toHaveClass(/is-busy/);
  await expect(page.locator('.download-actions button').first()).toBeVisible();
}

export async function download(page: Page, label: string | RegExp) {
  const [event] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.download-actions button', { hasText: label }).click(),
  ]);
  const path = await event.path();
  return { name: event.suggestedFilename(), bytes: new Uint8Array(await readFile(path)) };
}

export function unzip(bytes: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(bytes);
}
