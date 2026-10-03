import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

/** The page may only load its own files and may not send data anywhere. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** Response headers for Cloudflare Pages (`_headers`). */
const HEADERS = `/*
  Content-Security-Policy: frame-ancestors 'none'
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/sw.js
  Cache-Control: no-cache
`;

/** Files that are served but not needed offline. */
const SKIP_PRECACHE = new Set([
  'sw.js',
  '_headers',
  'robots.txt',
  'sitemap.xml',
  'og-image.png',
  '.well-known/security.txt',
]);

/** Adds the Content Security Policy to the built page. Dev keeps Vite's inline styles working. */
export function contentSecurityPolicy(): Plugin {
  return {
    name: 'pureico:csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
          injectTo: 'head-prepend',
        },
      ],
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: HEADERS });
    },
  };
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

/** Writes `sw.js` with the list of built files to precache and a content-based version. */
export function serviceWorker(template: string): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'pureico:service-worker',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      const outDir = config.build.outDir;
      const hash = createHash('sha256');
      const assets: string[] = [];
      for (const file of listFiles(outDir).sort()) {
        const path = relative(outDir, file).split(sep).join('/');
        if (SKIP_PRECACHE.has(path) || path.endsWith('.map')) continue;
        hash.update(path).update(readFileSync(file));
        // Pages are cached under their clean URL (`privacy/index.html` → `/privacy/`),
        // because hosts like Cloudflare Pages redirect the `index.html` form.
        assets.push(`/${path.replace(/(^|\/)index\.html$/, '$1')}`);
      }
      const source = readFileSync(template, 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__ASSETS__', JSON.stringify(assets, null, 2));
      if (source.includes('__VERSION__') || source.includes('__ASSETS__')) {
        throw new Error('Service worker template placeholders were not replaced.');
      }
      writeFileSync(join(outDir, 'sw.js'), source);
    },
  };
}
