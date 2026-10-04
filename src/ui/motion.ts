import { $$ } from '../lib/dom';

/** True when the visitor has asked their system for less movement. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const STAGGER_MS = 80;
const MAX_STAGGER_STEPS = 4;
// Reveal a little before a section is noticed (so targets must be taller than 80px). The huge top
// margin makes everything already scrolled past count as "intersecting": an observer only reports
// changes, so without it a section skipped by a jump (End key, restored scroll) would stay hidden.
const REVEAL_MARGIN = '10000px 0px -80px 0px';

/**
 * Fades `[data-reveal]` sections in as they scroll into view.
 *
 * Sections already on screen animate in through CSS alone when the page loads, so nothing waits
 * for this script and nothing flashes. Only sections below the fold are held back, and only after
 * this has run: if it never does, they simply stay visible.
 */
export function initReveal(): void {
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) return;

  const waiting = $$('[data-reveal]').filter(
    (el) => el.getBoundingClientRect().top >= window.innerHeight,
  );
  if (waiting.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      const arriving = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      // Only sections that are actually on screen are staggered; the rest settle unseen.
      let order = 0;
      for (const entry of arriving) {
        reveal(entry.target, entry.boundingClientRect.top < 0 ? 0 : order++);
      }
    },
    { rootMargin: REVEAL_MARGIN },
  );

  const reveal = (el: Element, order: number) => {
    const step = Math.min(order, MAX_STAGGER_STEPS);
    (el as HTMLElement).style.setProperty('--reveal-delay', `${step * STAGGER_MS}ms`);
    el.classList.remove('is-waiting');
    observer.unobserve(el);
  };

  for (const el of waiting) {
    el.classList.add('is-waiting');
    observer.observe(el);
  }
}

/**
 * Makes the hero art lean toward the pointer. It publishes the pointer's position as `--px` and
 * `--py` (-1 at the left or top edge, 1 at the right or bottom); motion.css turns them into
 * movement. Skipped for touch screens, which have no hovering pointer, and for reduced motion.
 */
export function initParallax(): void {
  const art = document.querySelector<HTMLElement>('.hero-art');
  if (!art || prefersReducedMotion()) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  let x = 0;
  let y = 0;
  let frame = 0;
  let onScreen = true;

  const publish = () => {
    frame = 0;
    art.style.setProperty('--px', x.toFixed(3));
    art.style.setProperty('--py', y.toFixed(3));
  };
  const schedule = () => {
    if (!frame && onScreen) frame = window.requestAnimationFrame(publish);
  };

  window.addEventListener(
    'pointermove',
    (event) => {
      x = (event.clientX / window.innerWidth - 0.5) * 2;
      y = (event.clientY / window.innerHeight - 0.5) * 2;
      schedule();
    },
    { passive: true },
  );
  // The pointer left the page: settle back to the middle.
  document.documentElement.addEventListener('pointerleave', () => {
    x = 0;
    y = 0;
    schedule();
  });
  // No point updating while the hero is scrolled out of sight.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      if (onScreen) schedule();
    }).observe(art);
  }
}

/** Plays an element's leaving animation (`.is-leaving`), then hides it. Instant without motion. */
export function hideAnimated(el: HTMLElement): void {
  if (el.hidden || el.classList.contains('is-leaving')) return;
  if (prefersReducedMotion()) {
    el.hidden = true;
    return;
  }
  const onEnd = (event: AnimationEvent) => {
    if (event.target === el) finish();
  };
  const finish = () => {
    el.removeEventListener('animationend', onEnd);
    // Opened again in the meantime: leave it alone.
    if (!el.classList.contains('is-leaving')) return;
    el.classList.remove('is-leaving');
    el.hidden = true;
  };
  el.classList.add('is-leaving');
  el.addEventListener('animationend', onEnd);
  // If the animation never runs (styles blocked, tab hidden), don't leave the element stuck open.
  window.setTimeout(finish, 400);
}

/** Cancels a pending `hideAnimated`, for an element that is being opened again. */
export function cancelHide(el: HTMLElement): void {
  el.classList.remove('is-leaving');
}
