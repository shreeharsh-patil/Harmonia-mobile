// Harmonia's playback-first dark palette. It deliberately follows the familiar
// contrast and hierarchy of modern music apps while keeping Harmonia's own
// emerald and red-heart identity.
export const colors = {
  // Deeper base layers make artwork and the active playback state the focus.
  background: '#000000',
  surface: '#121212',
  surfaceRaised: '#1F1F1F',
  surfaceHover: '#2A2A2A',
  // Web cards render as translucent panels over the ambient glows
  // (bg-card/40 hover:bg-card/75) with hairline borders (border-border/20).
  cardTranslucent: 'rgba(31,31,31,0.84)',
  cardTranslucentStrong: 'rgba(31,31,31,0.96)',
  border: '#282828',
  borderStrong: '#383838',
  borderFaint: 'rgba(255,255,255,0.08)',

  text: '#FFFFFF',
  textStrong: '#FFFFFF',
  textMuted: '#B3B3B3',
  textFaint: '#777777',
  muted: '#B3B3B3',
  mutedDim: '#777777',

  // Web `--primary` family. Emerald accents carry active states everywhere
  // (ring #4ade80, quick-card play buttons bg-primary, active titles
  // text-primary). The deeper #006239 is used for filled pill surfaces.
  accent: '#10B981',
  accentBright: '#1ED760',
  accentDark: '#006239',
  accentDeep: '#064E3B',
  danger: '#F3727F',

  // Ambient glow colors from the web music layout (saffron + emerald mesh).
  glowSaffron: 'rgba(249,115,22,0.10)',
  glowEmerald: 'rgba(16,185,129,0.08)',
  glowSaffronStrong: 'rgba(249,115,22,0.16)',
  glowEmeraldStrong: 'rgba(16,185,129,0.13)',
} as const;

export const radii = {
  small: 8,
  // Web cards/inputs use rounded-lg (8px) scaled up for touch targets
  medium: 12,
  large: 16,
  // Quick-access and chart rows are rounded-2xl on the web
  xl: 20,
  player: 18,
  pill: 999,
} as const;
