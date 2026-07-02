// Hand-authored SVG assets for the tabletop UI. No external image files —
// everything here is generated code so it stays crisp at any size and can
// share the CSS color tokens.

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

const AVATAR_PALETTES = [
  ['#4a7fb5', '#2f5580'],
  ['#9c3b34', '#6e2621'],
  ['#c9a227', '#8a6f22'],
  ['#5c8a6a', '#375743'],
  ['#7a5c9c', '#4f3a68'],
  ['#b56b3a', '#7d4a26'],
  ['#3a8a8f', '#245b5f'],
  ['#a04f8a', '#6b2f5b'],
];

/** Deterministic geometric placeholder avatar — initials over a name-derived gradient. */
export function avatarSVG(name, size = 44) {
  const initials = (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || '?';
  const h = hashString(name || 'x');
  const [c1, c2] = AVATAR_PALETTES[h % AVATAR_PALETTES.length];
  const rotation = h % 360;
  const gid = `av${h}`;
  return `
  <svg viewBox="0 0 44 44" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeAttr(name)}">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(${rotation} 0.5 0.5)">
        <stop offset="0" stop-color="${c1}" />
        <stop offset="1" stop-color="${c2}" />
      </linearGradient>
    </defs>
    <circle cx="22" cy="22" r="22" fill="url(#${gid})" />
    <circle cx="22" cy="22" r="21" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="1" />
    <text x="22" y="28" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="16" fill="#f1ead9">${escapeText(initials)}</text>
  </svg>`;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
function escapeText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

/** Card back — a sealed dossier emblem (compass/eye) on a deep tone. */
export function cardBackSVG() {
  return `
  <svg viewBox="0 0 90 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%;display:block;">
    <defs>
      <linearGradient id="backGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1c3527" />
        <stop offset="1" stop-color="#0b2018" />
      </linearGradient>
    </defs>
    <rect width="90" height="120" rx="8" fill="url(#backGrad)" />
    <rect x="4" y="4" width="82" height="112" rx="5" fill="none" stroke="#c9a227" stroke-width="1" stroke-opacity="0.55" />
    <rect x="8" y="8" width="74" height="104" rx="4" fill="none" stroke="#c9a227" stroke-width="0.5" stroke-opacity="0.35" />
    <g transform="translate(45 60)" stroke="#c9a227" stroke-opacity="0.85" fill="none" stroke-width="1.2">
      <circle r="20" />
      <circle r="3.2" fill="#c9a227" fill-opacity="0.9" stroke="none" />
      <path d="M0 -20 L0 -26 M0 20 L0 26 M-20 0 L-26 0 M20 0 L26 0" />
      <path d="M-14.1 -14.1 L-18.4 -18.4 M14.1 -14.1 L18.4 -18.4 M-14.1 14.1 L-18.4 18.4 M14.1 14.1 L18.4 18.4" />
      <path d="M0 -20 L6 -6 L20 0 L6 6 L0 20 L-6 6 L-20 0 L-6 -6 Z" stroke-width="1" />
    </g>
  </svg>`;
}

/** Role card front for Resistance — shield & star, cold steel accent. */
export function resistanceCardSVG() {
  return `
  <svg viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
    <rect width="200" height="260" rx="12" fill="#ede0c8" />
    <rect x="6" y="6" width="188" height="248" rx="9" fill="none" stroke="#4a7fb5" stroke-width="2" />
    <g transform="translate(100 108)">
      <path d="M0 -62 L52 -42 C52 6 30 46 0 66 C-30 46 -52 6 -52 -42 Z" fill="#3a6ea5" stroke="#1c3a56" stroke-width="3" />
      <path d="M0 -46 L38 -31 C38 6 22 34 0 50 C-22 34 -38 6 -38 -31 Z" fill="#cfdbe8" opacity="0.9" />
      <path d="M0 -26 L8 -8 L28 -6 L13 8 L17 28 L0 17 L-17 28 L-13 8 L-28 -6 L-8 -8 Z" fill="#3a6ea5" />
    </g>
    <text x="100" y="216" text-anchor="middle" font-family="'Special Elite', monospace" font-size="20" fill="#241d12" letter-spacing="2">MOTSTÅND</text>
    <text x="100" y="236" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" fill="#4a3f2c">Lojal mot uppdraget</text>
  </svg>`;
}

/** Role card front for Spy — dagger crossing a mask, rust/red accent. */
export function spyCardSVG() {
  return `
  <svg viewBox="0 0 200 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
    <rect width="200" height="260" rx="12" fill="#ede0c8" />
    <rect x="6" y="6" width="188" height="248" rx="9" fill="none" stroke="#9c3b34" stroke-width="2" />
    <g transform="translate(100 100)">
      <path d="M-38 -30 C-38 -50 -18 -62 0 -62 C18 -62 38 -50 38 -30 C38 -6 24 14 0 26 C-24 14 -38 -6 -38 -30 Z" fill="#241d12" />
      <ellipse cx="-15" cy="-28" rx="7" ry="9" fill="#ede0c8" />
      <ellipse cx="15" cy="-28" rx="7" ry="9" fill="#ede0c8" />
      <path d="M-20 2 C-8 12 8 12 20 2" stroke="#ede0c8" stroke-width="3" fill="none" stroke-linecap="round" />
    </g>
    <g transform="translate(100 108) rotate(45)">
      <rect x="-4" y="-70" width="8" height="70" fill="#9c3b34" stroke="#5c211d" stroke-width="1" />
      <path d="M-12 -70 L0 -92 L12 -70 Z" fill="#c0533f" stroke="#5c211d" stroke-width="1" />
      <rect x="-10" y="0" width="20" height="10" fill="#5c211d" />
      <rect x="-3" y="10" width="6" height="24" fill="#241d12" />
    </g>
    <text x="100" y="216" text-anchor="middle" font-family="'Special Elite', monospace" font-size="20" fill="#241d12" letter-spacing="2">SPION</text>
    <text x="100" y="236" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" fill="#4a3f2c">Arbetar i det dolda</text>
  </svg>`;
}

/** Leader badge — glides between seats, a brass laurel star. */
export function leaderBadgeSVG() {
  return `
  <svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
    <defs>
      <radialGradient id="ldGrad" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#f3da8f" />
        <stop offset="1" stop-color="#c9a227" />
      </radialGradient>
    </defs>
    <circle cx="30" cy="30" r="27" fill="url(#ldGrad)" stroke="#7d631a" stroke-width="2" />
    <path d="M30 12 L34.5 24.5 L48 25 L37 32.5 L41 45.5 L30 37.5 L19 45.5 L23 32.5 L12 25 L25.5 24.5 Z" fill="#5b4712" opacity="0.85" />
  </svg>`;
}

export function approveIconSVG() {
  return `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l7 3v6c0 5-3.4 8.7-7 10-3.6-1.3-7-5-7-10V5l7-3z" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 12.2l2.4 2.4 4.6-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function rejectIconSVG() {
  return `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l7 3v6c0 5-3.4 8.7-7 10-3.6-1.3-7-5-7-10V5l7-3z" stroke="currentColor" stroke-width="1.6"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}

export function successIconSVG() {
  return `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.6"/><path d="M7.5 12.3l3 3 6-6.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function failIconSVG() {
  return `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}

export function shieldEmblemSVG() {
  return `
  <svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
    <path d="M30 4 L52 14 C52 34 42 50 30 56 C18 50 8 34 8 14 Z" fill="#12241c" stroke="#c9a227" stroke-width="2" />
    <g transform="translate(30 30)" stroke="#c9a227" fill="none" stroke-width="1.4">
      <circle r="12" />
      <path d="M0 -12 L3.6 3.6 L12 5 L5 9 L6.5 17 L0 12.5 L-6.5 17 L-5 9 L-12 5 L-3.6 3.6 Z" fill="#c9a227" stroke="none" />
    </g>
  </svg>`;
}
