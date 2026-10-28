// Gentle, coordinated motion:
// - section reveals on scroll (staggered with data-delay),
// - editorial hero entrance (headline lines rise from a mask, photo unveils),
// - discreet parallax on images marked [data-parallax] (only while on screen).
// Content is hidden for animation only after this script confirms motion is allowed,
// so without JavaScript, or with "reduce motion" on, everything is simply visible.

const root = document.documentElement;
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const revealEls = [...document.querySelectorAll('[data-reveal]')];
const parallaxEls = [...document.querySelectorAll('[data-parallax]')];
const hero = document.querySelector('.hero');
const MAX_SHIFT = 28; // px, at the edges of the viewport

// Stagger delays come from data-delay (inline style attributes are blocked by the CSP).
revealEls.forEach((el) => {
  if (el.dataset.delay) el.style.setProperty('--d', `${Number(el.dataset.delay) || 0}ms`);
});

let revealObserver = null;
let parallaxObserver = null;
const visible = new Set();
let ticking = false;
let enabled = false;

function showAll() {
  revealEls.forEach((el) => el.classList.add('is-in'));
  hero?.classList.add('is-ready');
}

function startReveals() {
  hero?.classList.add('is-ready');
  if (!('IntersectionObserver' in window)) return showAll();
  revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.1 },
  );
  revealEls.forEach((el) => revealObserver.observe(el));
}

// Keyboard users never land on something still invisible.
document.addEventListener('focusin', (e) => {
  const el = e.target.closest('[data-reveal]:not(.is-in)');
  if (el) el.classList.add('is-in');
});

function updateParallax() {
  ticking = false;
  if (!enabled) return;
  const vh = window.innerHeight;
  for (const el of visible) {
    const r = el.getBoundingClientRect();
    // -1 when the image centre is at the bottom edge, +1 at the top edge.
    const progress = Math.max(-1, Math.min(1, (vh / 2 - (r.top + r.height / 2)) / (vh / 2 + r.height / 2)));
    el.style.setProperty('--py', `${(progress * MAX_SHIFT).toFixed(1)}px`);
  }
}
function requestParallax() {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(updateParallax);
  }
}

function startParallax() {
  if (!('IntersectionObserver' in window)) return;
  parallaxObserver = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target);
    requestParallax();
  });
  parallaxEls.forEach((el) => parallaxObserver.observe(el));
  window.addEventListener('scroll', requestParallax, { passive: true });
  window.addEventListener('resize', requestParallax, { passive: true });
}

function enableMotion() {
  enabled = true;
  root.classList.add('motion-ok');
  startParallax();
  // Let the hidden state paint once so the first elements animate in.
  requestAnimationFrame(() => requestAnimationFrame(startReveals));
}

function disableMotion() {
  enabled = false;
  root.classList.remove('motion-ok');
  window.removeEventListener('scroll', requestParallax);
  window.removeEventListener('resize', requestParallax);
  revealObserver?.disconnect();
  parallaxObserver?.disconnect();
  visible.clear();
  parallaxEls.forEach((el) => el.style.removeProperty('--py'));
  showAll();
}

if (reduceQuery.matches) disableMotion();
else enableMotion();

reduceQuery.addEventListener?.('change', (e) => (e.matches ? disableMotion() : enableMotion()));
