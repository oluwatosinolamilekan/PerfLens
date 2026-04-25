const FRAMEWORK_ACCENT_MAP: Record<string, { label: string; bg: string; fg: string }> = {
  'Next.js': { label: 'N', bg: '#111827', fg: '#FFFFFF' },
  Nuxt: { label: 'N', bg: '#00DC82', fg: '#052E16' },
  Gatsby: { label: 'G', bg: '#663399', fg: '#FFFFFF' },
  Remix: { label: 'R', bg: '#121212', fg: '#E5E7EB' },
  Astro: { label: 'A', bg: '#FF5D01', fg: '#1F2937' },
  Qwik: { label: 'Q', bg: '#18B6F6', fg: '#082F49' },
  Solid: { label: 'S', bg: '#2C4F7C', fg: '#DBEAFE' },
  React: { label: 'R', bg: '#61DAFB', fg: '#082F49' },
  Vue: { label: 'V', bg: '#42B883', fg: '#052E16' },
  Angular: { label: 'A', bg: '#DD0031', fg: '#FFFFFF' },
  Svelte: { label: 'S', bg: '#FF3E00', fg: '#1F2937' },
  Preact: { label: 'P', bg: '#673AB8', fg: '#FFFFFF' },
  Ember: { label: 'E', bg: '#E04E39', fg: '#FFFFFF' },
  Backbone: { label: 'B', bg: '#2B6CB0', fg: '#FFFFFF' },
  jQuery: { label: 'J', bg: '#0769AD', fg: '#FFFFFF' },
  Vanilla: { label: 'V', bg: '#F7DF1E', fg: '#1F2937' },
  Unknown: { label: '?', bg: '#475569', fg: '#FFFFFF' },
};

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function getFrameworkLogo(name: string): string {
  const brand = FRAMEWORK_ACCENT_MAP[name] ?? FRAMEWORK_ACCENT_MAP.Unknown;
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${name}">
  <rect x="0" y="0" width="64" height="64" rx="16" fill="${brand.bg}" />
  <text
    x="32"
    y="32"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="Inter, Arial, sans-serif"
    font-size="28"
    font-weight="700"
    fill="${brand.fg}"
  >${brand.label}</text>
</svg>`;

  return svgToDataUri(svg);
}
