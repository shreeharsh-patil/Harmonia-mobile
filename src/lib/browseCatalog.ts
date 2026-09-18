import { fetchHomeSections, searchMusic } from '@/src/lib/api';
import { entityImageUrl } from '@/src/lib/entities';
import type { HarmoniaAlbum, MusicSection, Playlist } from '@/src/types';

export type BrowseCatalog = {
  id: string;
  name: string;
  query: string;
  color: string;
  coverImage: string;
};

// Offline covers are synced from the current bundled Spotify catalog rather
// than old provider editorial URLs. Live catalog covers still override these
// on Search whenever the database feed has a newer image.
export const BROWSE_CATALOGS: BrowseCatalog[] = [
  { id: 'hindi', name: 'Hindi', query: 'Hindi Hits', color: '#A47C34', coverImage: 'https://i.scdn.co/image/ab67706f00000002cdb9f3aa5daf93253b072a55' },
  { id: 'english', name: 'English', query: 'English Hits', color: '#687880', coverImage: 'https://i.scdn.co/image/ab67706f00000002810d3464499e998c3faf8b9e' },
  { id: 'new-releases', name: 'New Releases', query: 'New Releases', color: '#3C4044', coverImage: 'https://i.scdn.co/image/ab67706f000000021daa1cb6a1355f17cc4c4a9a' },
  { id: 'summer', name: 'Summer', query: 'Summer Hits', color: '#9C9470', coverImage: 'https://i.scdn.co/image/ab67706f00000002a104a479668573d87cae38cb' },
  { id: 'pop', name: 'Pop', query: 'Pop Hits', color: '#148A08', coverImage: 'https://i.scdn.co/image/ab67706f00000002bcd0d3a4cb45a9671ef1a29a' },
  { id: 'charts', name: 'Charts', query: 'Top Songs Global', color: '#8D67AB', coverImage: 'https://i.scdn.co/image/ab67706f00000002810d3464499e998c3faf8b9e' },
  { id: 'punjabi', name: 'Punjabi', query: 'Punjabi Hits', color: '#B89047', coverImage: 'https://i.scdn.co/image/ab67706f00000002f6a520f5643f4782a4591da9' },
  { id: 'telugu', name: 'Telugu', query: 'Telugu Hits', color: '#8C503C', coverImage: 'https://i.scdn.co/image/ab67706f00000002ac26fc864e4065cb23adfa50' },
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
];

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

  for (const catalog of BROWSE_CATALOGS) {
    const matches = sectionsMatchingCatalog(catalog, sections);
    for (const section of matches) {
      for (const playlist of section.playlists || []) {
        const cover = entityImageUrl(playlist, 320);
        if (!cover) continue;
        covers[catalog.id] = cover;
        break;
      }
      if (covers[catalog.id]) break;
    }
  }

  return covers;
}

export async function fetchBrowseCatalogCoverImages() {
  const sections = await fetchHomeSections();
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
