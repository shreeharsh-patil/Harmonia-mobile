import { fetchHomeSections, searchMusic } from '@/src/lib/api';
import { entityImageUrl } from '@/src/lib/entities';
import type { HarmoniaAlbum, MusicSection, Playlist } from '@/src/types';

export type BrowseCatalog = {
  id: string;
  name: string;
  query: string;
  color: string;
  coverImage: string;
  coverPlaylistTerms?: string[];
};

// Offline covers are synced from the current bundled Spotify catalog. Live
// catalog covers can still override these whenever the feed has newer art.
export const BROWSE_CATALOGS: BrowseCatalog[] = [
  // Keep the opening grid aligned with the requested visual browse cards.
  // Covers are refreshed from the catalog at runtime; these are offline fallbacks.
  { id: 'hindi', name: 'Hindi', query: 'Hindi Hits', color: '#A47C34', coverImage: 'https://i.scdn.co/image/ab67706f00000002cdb9f3aa5daf93253b072a55', coverPlaylistTerms: ['hot hits hindi'] },
  { id: 'english', name: 'English', query: 'English Hits', color: '#687880', coverImage: 'https://i.scdn.co/image/ab67706f00000002810d3464499e998c3faf8b9e', coverPlaylistTerms: ["today's top hits", 'top hits'] },
  { id: 'new-releases', name: 'New Releases', query: 'New Releases', color: '#3C4044', coverImage: 'https://i.scdn.co/image/ab67706c0000d72c079c8abf972947da7ce5e6ad', coverPlaylistTerms: ['new releases hindi'] },
  { id: 'punjabi', name: 'Punjabi', query: 'Punjabi Hits', color: '#F5A300', coverImage: 'https://i.scdn.co/image/ab67706f00000002f6a520f5643f4782a4591da9' },
  { id: 'summer', name: 'Summer', query: 'Summer Hits', color: '#847C43', coverImage: 'https://i.scdn.co/image/ab67706f00000002a104a479668573d87cae38cb' },
  { id: 'english-sad', name: 'English Sad', query: 'English Sad Songs', color: '#3B5FA4', coverImage: 'https://i.scdn.co/image/ab67706f000000025cc67a4677aca69d98c52ecf', coverPlaylistTerms: ['sad covers'] },
  { id: 'pop', name: 'Pop', query: 'Pop Hits', color: '#353632', coverImage: 'https://i.scdn.co/image/ab67706f0000000272e446610f3c0c7609d18c95', coverPlaylistTerms: ['pop rising'] },
  { id: 'charts', name: 'Charts', query: 'Top Songs Global', color: '#834AA4', coverImage: 'https://charts-images.scdn.co/assets/locale_en/regional/daily/region_in_default.jpg' },
  { id: 'telugu', name: 'Telugu', query: 'Telugu Hits', color: '#66351F', coverImage: 'https://i.scdn.co/image/ab67706f00000002ac26fc864e4065cb23adfa50' },
  { id: 'malayalam', name: 'Malayalam', query: 'Malayalam Hits', color: '#508C78', coverImage: 'https://i.scdn.co/image/ab67706f0000000218cc8201ba1b0dc9aa008cf5' },
  { id: 'haryanvi', name: 'Haryanvi', query: 'Haryanvi Hits', color: '#B8A05C', coverImage: 'https://i.scdn.co/image/ab67706f00000002fa49c0b0d85e23e64f22aa9c' },
  { id: 'bhojpuri', name: 'Bhojpuri', query: 'Bhojpuri Viral Hits', color: '#5C78A0', coverImage: 'https://i.scdn.co/image/ab67706f00000002e0630185ab12f22a347d130e' },
  { id: 'ghazal', name: 'Ghazal', query: 'Ghazals', color: '#7C7C64', coverImage: 'https://i.scdn.co/image/ab67706f00000002864dc5d361e61dbcade81b03' },
  { id: 'indie', name: 'Indie', query: 'Indian Indie', color: '#5C9078', coverImage: 'https://i.scdn.co/image/ab67706f000000029c6ec1967ed78d900e71b2a3' },
  { id: 'love', name: 'Love', query: 'Love Songs', color: '#E61E32', coverImage: 'https://i.scdn.co/image/ab67706f00000002c0a22b20ce73e9b6a2a3750a' },
  { id: 'trending', name: 'Trending', query: 'Trending', color: '#506080', coverImage: 'https://i.scdn.co/image/ab67706f0000000268c27db89cd61331d56a0e2a' },
  { id: 'mood', name: 'Mood', query: 'Mood Booster', color: '#E1118C', coverImage: 'https://i.scdn.co/image/ab67706f0000000219356d03e8312d859a0c39eb' },
  { id: 'party', name: 'Party', query: 'Party Hits', color: '#AF2896', coverImage: 'https://i.scdn.co/image/ab67706f000000021c81ec961b4c8aa3b1461192' },
  { id: 'devotional', name: 'Devotional', query: 'Devotional Songs', color: '#3C647C', coverImage: 'https://i.scdn.co/image/ab67706f00000002236c60998a1aed4c477da29e' },
  { id: 'decades', name: 'Decades', query: '90s Hits', color: '#BA5D07', coverImage: 'https://i.scdn.co/image/ab67706f00000002c6ff6fea41e6df276829a044' },
  { id: 'hip-hop', name: 'Hip-Hop', query: 'Hip Hop Hits', color: '#BC5900', coverImage: 'https://i.scdn.co/image/ab67706f0000000283fb4b7528880e5d8c5dd32c' },
  { id: 'dance-electronic', name: 'Dance/Electronic', query: 'EDM Hits', color: '#D84000', coverImage: 'https://i.scdn.co/image/ab67706f00000002f13c6da464ce8d5953ace925' },
  { id: 'student', name: 'Student', query: 'Student Study', color: '#7A5C54', coverImage: 'https://i.scdn.co/image/ab67706f000000027948cb189274ae0f2a4ab961' },
  { id: 'chill', name: 'Chill', query: 'Chill Hits', color: '#477D95', coverImage: 'https://i.scdn.co/image/ab67706f00000002ff2c025d3d65fb247b909ef7' },
  { id: 'gaming', name: 'Gaming', query: 'Gaming Beats', color: '#8C5CBA', coverImage: 'https://i.scdn.co/image/ab67706f000000020f3f35c953902cabeddcd977' },
  { id: 'k-pop', name: 'K-pop', query: 'K-Pop Hits', color: '#148A08', coverImage: 'https://i.scdn.co/image/ab67706f000000021f858cef4cd2c5633615a2b7' },
  { id: 'workout', name: 'Workout', query: 'Workout Beats', color: '#776850', coverImage: 'https://i.scdn.co/image/ab67706f0000000293586f77d22c2c7901d2c715' },
  { id: 'radar', name: 'RADAR', query: 'Radar India', color: '#7C7C9C', coverImage: 'https://i.scdn.co/image/ab676d63000076a0030be759dbb40dc2dcf313ab' },
  { id: 'equal', name: 'EQUAL', query: 'Equal India', color: '#006450', coverImage: 'https://i.scdn.co/image/ab67706f00000002d17ce5eb20a4d1716def859a' },
  { id: 'fresh', name: 'Fresh', query: 'Fresh Finds', color: '#507C8C', coverImage: 'https://i.scdn.co/image/ab67706f000000023e92027625236657e16d3386' },
  { id: 'rock', name: 'Rock', query: 'Rock Hits', color: '#7C787C', coverImage: 'https://i.scdn.co/image/ab67706f00000002f5d2a31209dd56922fda5275' },
  { id: 'bollywood', name: 'Bollywood Romance', query: 'Bollywood Love Songs', color: '#B43D4C', coverImage: 'https://i.scdn.co/image/ab67706c0000da841556ee89addc54148fae5220', coverPlaylistTerms: ['bollywood love songs'] },
  { id: 'sleep', name: 'Sleep', query: 'Sleep Music', color: '#405685', coverImage: 'https://i.scdn.co/image/ab67706f00000002e8975ec275547eb9f6bcf9bc', coverPlaylistTerms: ['whale sounds'] },
  { id: 'meditation', name: 'Meditation', query: 'Meditation Music', color: '#4A8074', coverImage: 'https://i.scdn.co/image/ab67706f000000029e55e964547263ab09709ef8', coverPlaylistTerms: ['yoga & meditation'] },
  { id: 'rnb', name: 'R&B', query: 'R&B Hits', color: '#8C5A7C', coverImage: 'https://i.scdn.co/image/ab67706f00000002a019cd25c54d561479e171da', coverPlaylistTerms: ['jivva'] },
  { id: 'latin', name: 'Latin', query: 'Latin Pop', color: '#D66A27', coverImage: 'https://i.scdn.co/image/ab67706f0000000251a6f6c9bcb69d328f8897f4', coverPlaylistTerms: ['latin pop today'] },
  { id: 'jazz', name: 'Jazz', query: 'Jazz Pop', color: '#52768A', coverImage: 'https://i.scdn.co/image/ab67706f000000023a9e995d684596a60d7f5c97', coverPlaylistTerms: ['jazz pop'] },
  { id: 'country', name: 'Country', query: 'Country Hits', color: '#8A6A43', coverImage: 'https://i.scdn.co/image/ab67706f0000000283da3cfca32d00dc0b629db3', coverPlaylistTerms: ['nashville stripped'] },
  { id: 'soul', name: 'Soul', query: 'Soul Music', color: '#89554E', coverImage: 'https://i.scdn.co/image/ab67706f00000002fb59037a5655c6f9d763235e', coverPlaylistTerms: ["soul 'n' the city"] },
  { id: 'instrumental', name: 'Instrumental', query: 'Indian Instrumental', color: '#78865A', coverImage: 'https://i.scdn.co/image/ab67706f000000025383f591f65c07af03cfe014', coverPlaylistTerms: ['savasana'] },
  { id: 'anime', name: 'Anime', query: 'Anime Hits', color: '#7D649C', coverImage: 'https://i.scdn.co/image/ab67706f0000000269412b058e37a8d7756f229a', coverPlaylistTerms: ['free!'] },
  { id: 'classical', name: 'Classical', query: 'Classical Music', color: '#786B92', coverImage: 'https://i.scdn.co/image/ab67706f0000000229aef11910beb922293f848a', coverPlaylistTerms: ['classical romance'] },
];

// These are the tuned dominant colors of the current Spotify cover for every
// card. Keeping them bundled avoids palette extraction and extra image work on
// the Search screen while preserving the artwork-to-background pairing.
const BROWSE_CATALOG_COLORS: Record<string, string> = {
  hindi: '#6D0909', english: '#07075A', 'new-releases': '#3C4044', punjabi: '#0F8A7C',
  summer: '#194067', 'english-sad': '#262B36', pop: '#09316D', charts: '#075A4C',
  telugu: '#541C1C', malayalam: '#5A1111', haryanvi: '#842A57', bhojpuri: '#3E0868',
  ghazal: '#54381C', indie: '#84330B', love: '#604020', trending: '#434D60',
  mood: '#630826', party: '#712809', devotional: '#6C2919', decades: '#6B2614',
  'hip-hop': '#262B36', 'dance-electronic': '#162E8D', student: '#683808', chill: '#075A5A',
  gaming: '#630808', 'k-pop': '#262B36', workout: '#262B36', radar: '#602040',
  equal: '#15840B', fresh: '#8D165E', rock: '#54381C', bollywood: '#87500D',
  sleep: '#07305A', meditation: '#434D60', rnb: '#23234D', latin: '#262B36',
  jazz: '#075A5A', country: '#262B36', soul: '#095971', instrumental: '#5E3622',
  anime: '#0A6C7F', classical: '#840B0B',
};

function blendHexColors(primary: string, secondary: string, secondaryWeight = 0.18) {
  const parse = (value: string) => [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  const [primaryR, primaryG, primaryB] = parse(primary);
  const [secondaryR, secondaryG, secondaryB] = parse(secondary);
  const mix = (base: number, accent: number) => Math.round(base * (1 - secondaryWeight) + accent * secondaryWeight);
  return `#${[mix(primaryR, secondaryR), mix(primaryG, secondaryG), mix(primaryB, secondaryB)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

export function browseCatalogColor(catalog: BrowseCatalog) {
  const artworkColor = BROWSE_CATALOG_COLORS[catalog.id];
  // Retain the artwork hue, then gently blend it with the hand-tuned category
  // surface and a charcoal neutral so dense grids feel calmer and the white
  // labels stay readable without making the cards look washed out.
  return artworkColor
    ? blendHexColors(blendHexColors(artworkColor, catalog.color), '#252A33', 0.16)
    : catalog.color;
}

export type CatalogItem =
  | { kind: 'playlist'; data: Playlist }
  | { kind: 'album'; data: HarmoniaAlbum };

export type CatalogSection = {
  id: string;
  title: string;
  items: CatalogItem[];
};

type CatalogCacheEntry = {
  expiresAt: number;
  sections: CatalogSection[];
};

const CATALOG_TTL_MS = 10 * 60_000;
const catalogCache = new Map<string, CatalogCacheEntry>();
const catalogRequests = new Map<string, Promise<CatalogSection[]>>();

const CATALOG_SECTION_MATCHERS: Record<string, string[]> = {
  hindi: ['popular hindi', 'bollywood', 'hindi'],
  english: ['top hits', "today's hits", 'english'],
  'english-sad': ['chill & sad', 'saddest playlists', "what's your mood", 'all things pop'],
  'new-releases': ['best new releases', 'new & trending', 'new releases'],
  summer: ['summer'],
  pop: ['all things pop', 'pop hits', 'pop essentials'],
  charts: ['featured charts', 'daily song charts', 'weekly song charts', 'top hits'],
  punjabi: ['popular punjabi', 'punjabi'],
  telugu: ['popular telugu', "editor's pick telugu", 'telugu essentials'],
  malayalam: ['malayalam essentials', "editor's pick malayalam", 'malayalam'],
  haryanvi: ['popular haryanvi', "editor's pick haryanvi", 'haryanvi'],
  bhojpuri: ['popular bhojpuri', "editor's pick bhojpuri", 'bhojpuri'],
  ghazal: ['ghazal'],
  indie: ['new in indie', 'indie essentials', 'popular indie'],
  love: ['bollywood romance', 'popular romance', 'falling in love', 'love'],
  trending: ['popular trending', 'new & trending', 'today'],
  mood: ["what's your mood", 'mood'],
  party: ['popular party', 'dance party', 'party'],
  devotional: ['aartis & bhajans', 'devotional', 'bakthi'],
  decades: ['popular decades', 'dancing through the decades', 'decades'],
  'hip-hop': ['popular hip-hop', 'hip-hop'],
  'dance-electronic': ['popular dance/electronic', 'dance hits', 'electronic'],
  student: ['study mode', 'study', 'deep concentration'],
  chill: ['popular chill', 'chill & sad', 'chill'],
  gaming: ['popular gaming', 'made for gaming', 'gaming'],
  'k-pop': ['k-essentials', 'k-pop', 'k-music'],
  workout: ['popular workout', 'dance workout', 'running'],
  radar: ['radar'],
  equal: ['equal india', 'popular equal', 'equal'],
  fresh: ['fresh finds', 'new and emerging artists', 'new music by independent artists'],
  rock: ['pulse of rock', 'rock classics', 'rock'],
  bollywood: ['bollywood romance'],
  sleep: ['natural sleep', 'popular sleep', 'sleeping & napping', 'classical sleep'],
  meditation: ['popular meditation'],
  rnb: ['r&b around the world', 'k-hip hop/r&b'],
  latin: ['latin pop', 'latin party', 'latin rock'],
  jazz: ['featured jazz', 'chill jazz'],
  country: ['popular country'],
  soul: ['popular soul', 'best of soul'],
  instrumental: ['indian instrumental', 'instrumental electronic'],
  anime: ['popular anime'],
  classical: ['classical'],
};

export function getBrowseCatalog(id?: string | null) {
  const normalizedId = String(id || '').trim().toLowerCase();
  return BROWSE_CATALOGS.find((catalog) => catalog.id === normalizedId) || null;
}

function normalizeText(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'");
}

function sectionsMatchingCatalog(catalog: BrowseCatalog, sections: MusicSection[]) {
  const terms = CATALOG_SECTION_MATCHERS[catalog.id] || [];
  if (!terms.length) return [];

  return sections.filter((section) => {
    const title = normalizeText(section.name);
    return terms.some((term) => title.includes(term));
  });
}

/**
 * Resolve Browse-all covers from the current catalog response. The static URL
 * on each category remains an offline fallback, while a refreshed database
 * playlist can replace it without requiring an app release.
 */
export function browseCatalogCoverImages(sections: MusicSection[]) {
  const covers: Record<string, string> = {};
  const usedCovers = new Set<string>();

  for (const catalog of BROWSE_CATALOGS) {
    const matches = sectionsMatchingCatalog(catalog, sections);
    const candidates = matches.flatMap((section) => section.playlists || []);
    const preferredTerms = catalog.coverPlaylistTerms || [];
    const preferred = candidates.filter((playlist) =>
      preferredTerms.some((term) => normalizeText(playlist.name || playlist.title).includes(term))
    );

    for (const playlist of [...preferred, ...candidates]) {
      const cover = entityImageUrl(playlist, 320);
      // A category must retain its own Spotify cover. If catalog matching
      // overlaps (for example English and Charts), use the next artwork
      // instead of repeating the same thumbnail in two cards.
      if (!cover || usedCovers.has(cover)) continue;
      covers[catalog.id] = cover;
      usedCovers.add(cover);
      break;
    }
  }

  return covers;
}

export async function fetchBrowseCatalogCoverImages({ forceRefresh = false }: { forceRefresh?: boolean } = {}) {
  // Search is a discovery surface, so callers can request a fresh catalog
  // response and immediately pick up newly curated artwork. The bundled
  // Spotify artwork in BROWSE_CATALOGS remains the resilient offline fallback.
  const sections = await fetchHomeSections({ forceRefresh });
  return browseCatalogCoverImages(sections);
}

function catalogItemId(item: CatalogItem) {
  return `${item.kind}:${String(item.data.id || (item.kind === 'playlist' ? item.data._id : '') || item.data.name || item.data.title)}`;
}

function dedupeItems(items: CatalogItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = catalogItemId(item);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function curatedSectionsFor(catalog: BrowseCatalog, sections: MusicSection[]): CatalogSection[] {
  return sectionsMatchingCatalog(catalog, sections)
    .map((section, index) => ({
      id: String(section.id || section._id || `curated-${index}`),
      title: section.name,
      items: dedupeItems(
        (section.playlists || []).map((playlist) => ({ kind: 'playlist' as const, data: playlist }))
      ),
    }))
    .filter((section) => section.items.length > 0);
}

function searchSections(catalog: BrowseCatalog, playlists: Playlist[], albums: HarmoniaAlbum[]) {
  const items = dedupeItems([
    ...playlists.map((playlist) => ({ kind: 'playlist' as const, data: playlist })),
    ...albums.map((album) => ({ kind: 'album' as const, data: album })),
  ]);
  const titles = [
    `Popular ${catalog.name} Playlists`,
    'New & Trending',
    `${catalog.name} Essentials`,
  ];

  return titles
    .map((title, index) => ({
      id: `search-${index}`,
      title,
      items: items.slice(index * 10, index * 10 + 10),
    }))
    .filter((section) => section.items.length > 0);
}

async function loadCatalog(catalog: BrowseCatalog, forceRefresh: boolean) {
  const [homeResult, searchResult] = await Promise.allSettled([
    fetchHomeSections({ forceRefresh }),
    searchMusic(catalog.query, 30),
  ]);

  const curated = homeResult.status === 'fulfilled'
    ? curatedSectionsFor(catalog, homeResult.value)
    : [];
  const searched = searchResult.status === 'fulfilled'
    ? searchSections(
        catalog,
        searchResult.value.playlists?.results || [],
        searchResult.value.albums?.results || []
      )
    : [];

  if (curated.length >= 2) return curated;
  const curatedTitles = new Set(curated.map((section) => normalizeText(section.title)));
  return [
    ...curated,
    ...searched.filter((section) => !curatedTitles.has(normalizeText(section.title))),
  ];
}

export async function fetchBrowseCatalogSections(
  catalogId: string,
  { forceRefresh = false }: { forceRefresh?: boolean } = {}
) {
  const catalog = getBrowseCatalog(catalogId);
  if (!catalog) throw new Error('This catalog is unavailable.');

  const cached = catalogCache.get(catalog.id);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.sections;

  const pending = catalogRequests.get(catalog.id);
  if (pending) return pending;

  const request = loadCatalog(catalog, forceRefresh).then((sections) => {
    if (sections.length) {
      catalogCache.set(catalog.id, {
        expiresAt: Date.now() + CATALOG_TTL_MS,
        sections,
      });
    }
    return sections;
  });
  catalogRequests.set(catalog.id, request);

  try {
    return await request;
  } finally {
    if (catalogRequests.get(catalog.id) === request) catalogRequests.delete(catalog.id);
  }
}
