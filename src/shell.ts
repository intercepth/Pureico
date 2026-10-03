import '@fontsource-variable/pixelify-sans';
import '@fontsource-variable/space-grotesk';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/motion.css';

import { renderSeason, renderStarfield } from './art/sky';
import { hydrateSprites } from './art/sprites';
import { $ } from './lib/dom';
import { registerServiceWorker } from './pwa/register';
import { initThemeToggle } from './ui/header';

/** Setup shared by every page: art, sky, theme switch and offline support. */
export function initShell(): void {
  hydrateSprites();
  renderStarfield($('.sky'));
  renderSeason();
  initThemeToggle();
  registerServiceWorker();
}
