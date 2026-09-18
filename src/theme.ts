// Harmonia app palette mirrored from the web player's dark theme.
// Mirrors app/globals.css of the Harmonia web client: #121212 background,
// #171717 cards, emerald primary, saffron+emerald ambient glows.
export const colors = {
  // Base surfaces (web `--background`, `--card`, `--secondary`, `--accent`)
  background: '#121212',
  surface: '#171717',
  surfaceRaised: '#242424',
  surfaceHover: '#313131',
  // Web cards render as translucent panels over the ambient glows
  // (bg-card/40 hover:bg-card/75) with hairline borders (border-border/20).
  cardTranslucent: 'rgba(23,23,23,0.55)',
  cardTranslucentStrong: 'rgba(23,23,23,0.85)',
  border: '#292929',
  borderStrong: '#323232',
  borderFaint: 'rgba(41,41,41,0.35)',

  text: '#E2E8F0',
  textStrong: '#FAFAFA',
  textMuted: '#A2A2A2',
  textFaint: '#707070',
  muted: '#A2A2A2',
  mutedDim: '#707070',

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
