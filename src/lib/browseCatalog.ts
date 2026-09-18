import { fetchHomeSections, searchMusic } from '@/src/lib/api';
import type { HarmoniaAlbum, MusicSection, Playlist } from '@/src/types';

export type BrowseCatalog = {
  id: string;
  name: string;
  query: string;
  color: string;
  coverImage: string;
};

export const BROWSE_CATALOGS: BrowseCatalog[] = [
  { id: 'hindi', name: 'Hindi', query: 'Hindi Hits', color: '#A47C34', coverImage: 'https://c.saavncdn.com/editorial/charts_Hindi1990s_136920_20240408061858_500x500.jpg' },
  { id: 'english', name: 'English', query: 'English Hits', color: '#687880', coverImage: 'https://c.saavncdn.com/editorial/EnglishNurseryRhymes_20240902092448_500x500.jpg' },
  { id: 'new-releases', name: 'New Releases', query: 'New Releases', color: '#3C4044', coverImage: 'https://c.saavncdn.com/editorial/TaazaTunes_20260626100440_500x500.jpg' },
  { id: 'summer', name: 'Summer', query: 'Summer Hits', color: '#9C9470', coverImage: 'https://c.saavncdn.com/editorial/RetroChill_20250626045906_500x500.jpg' },
  { id: 'pop', name: 'Pop', query: 'Pop Hits', color: '#148A08', coverImage: 'https://c.saavncdn.com/editorial/BestOfIndipopHindi_20260504065326_500x500.jpg' },
  { id: 'charts', name: 'Charts', query: 'Top Songs Global', color: '#8D67AB', coverImage: 'https://c.saavncdn.com/editorial/GlobalPop_20260608125844_500x500.jpg' },
  { id: 'punjabi', name: 'Punjabi', query: 'Punjabi Hits', color: '#B89047', coverImage: 'https://c.saavncdn.com/editorial/PunjabiHitSongs_20260409070056_500x500.jpg' },
  { id: 'telugu', name: 'Telugu', query: 'Telugu Hits', color: '#8C503C', coverImage: 'https://c.saavncdn.com/editorial/charts_Telugu1990s_157621_20240408063237_500x500.jpg' },
  { id: 'malayalam', name: 'Malayalam', query: 'Malayalam Hits', color: '#508C78', coverImage: 'https://c.saavncdn.com/editorial/charts_Malayalam2000s_160867_20240408063713_500x500.jpg' },
  { id: 'haryanvi', name: 'Haryanvi', query: 'Haryanvi Hits', color: '#B8A05C', coverImage: 'https://c.saavncdn.com/editorial/Haryanvi-IndiaSuperhitsTop50_20260409070056_500x500.jpg' },
  { id: 'bhojpuri', name: 'Bhojpuri', query: 'Bhojpuri Viral Hits', color: '#5C78A0', coverImage: 'https://c.saavncdn.com/editorial/BhojpuriViralHits_20260610102957_500x500.jpg' },
  { id: 'ghazal', name: 'Ghazal', query: 'Ghazals', color: '#7C7C64', coverImage: 'https://c.saavncdn.com/editorial/BestOfGhazalsHindi_20260325065302_500x500.jpg' },
  { id: 'indie', name: 'Indie', query: 'Indian Indie', color: '#5C9078', coverImage: 'https://c.saavncdn.com/editorial/BestIndianLoFiHits_20241121053632_500x500.jpg' },
  { id: 'love', name: 'Love', query: 'Love Songs', color: '#E61E32', coverImage: 'https://c.saavncdn.com/editorial/MostStreamedLoveSongs-Hindi_20260629041408_500x500.jpg' },
  { id: 'trending', name: 'Trending', query: 'Trending', color: '#506080', coverImage: 'https://c.saavncdn.com/editorial/NowTrending_20260423085344_500x500.jpg' },
  { id: 'mood', name: 'Mood', query: 'Mood Booster', color: '#E1118C', coverImage: 'https://c.saavncdn.com/editorial/MidDayMoodBoosters_20250428092413_500x500.jpg' },
  { id: 'party', name: 'Party', query: 'Party Hits', color: '#AF2896', coverImage: 'https://c.saavncdn.com/editorial/BestOfDanceHindi_20251003074023_500x500.jpg' },
  { id: 'devotional', name: 'Devotional', query: 'Devotional Songs', color: '#3C647C', coverImage: 'https://c.saavncdn.com/editorial/Hanuman_20260401062920_500x500.jpg' },
  { id: 'decades', name: 'Decades', query: '90s Hits', color: '#BA5D07', coverImage: 'https://c.saavncdn.com/editorial/90sEvergreenHits_20241128053307_500x500.jpg' },
  { id: 'hip-hop', name: 'Hip-Hop', query: 'Hip Hop Hits', color: '#BC5900', coverImage: 'https://c.saavncdn.com/editorial/Let_sPlayEmiwayBantai_20240517065551_500x500.jpg' },
  { id: 'dance-electronic', name: 'Dance/Electronic', query: 'EDM Hits', color: '#D84000', coverImage: 'https://c.saavncdn.com/editorial/BestOfEDMHindi_20251003074023_500x500.jpg' },
  { id: 'student', name: 'Student', query: 'Student Study', color: '#7A5C54', coverImage: 'https://c.saavncdn.com/editorial/logo/StudyModeOn_99978252_20170706_500x500.jpg' },
  { id: 'chill', name: 'Chill', query: 'Chill Hits', color: '#477D95', coverImage: 'https://c.saavncdn.com/editorial/FILTRDilKaSukoon_20250515094823_500x500.jpg' },
  { id: 'gaming', name: 'Gaming', query: 'Gaming Beats', color: '#8C5CBA', coverImage: 'https://c.saavncdn.com/editorial/logo/MonstercatGaming_20190604084018_500x500.jpg' },
  { id: 'k-pop', name: 'K-pop', query: 'K-Pop Hits', color: '#148A08', coverImage: 'https://c.saavncdn.com/editorial/KKLoveSongsHindi_20240730105418_500x500.jpg' },
  { id: 'workout', name: 'Workout', query: 'Workout Beats', color: '#776850', coverImage: 'https://c.saavncdn.com/editorial/BollywoodRockWorkoutMix_20240229050234_500x500.jpg' },
  { id: 'radar', name: 'RADAR', query: 'Radar India', color: '#7C7C9C', coverImage: 'https://c.saavncdn.com/editorial/UnderTheRadarPop_20260605113945_500x500.jpg' },
  { id: 'equal', name: 'EQUAL', query: 'Equal India', color: '#006450', coverImage: 'https://c.saavncdn.com/editorial/WomenInPop_20260506065144_500x500.jpg' },
  { id: 'fresh', name: 'Fresh', query: 'Fresh Finds', color: '#507C8C', coverImage: 'https://c.saavncdn.com/editorial/FreshTunes_20260703111718_500x500.jpg' },
  { id: 'rock', name: 'Rock', query: 'Rock Hits', color: '#7C787C', coverImage: 'https://c.saavncdn.com/editorial/BestOfRockHindi_20260325065230_500x500.jpg' },
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

export function getBrowseCatalog(id?: string | null) {
  const normalizedId = String(id || '').trim().toLowerCase();
  return BROWSE_CATALOGS.find((catalog) => catalog.id === normalizedId) || null;
}

function normalizeText(value: unknown) {
  return String(value || '').trim().toLowerCase();
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
  const matchers: Record<string, string[]> = {
    hindi: ['hindi', 'new & trending', 'bollywood', 'bollywood romance', 'chill & sad', 'devotional'],
    english: ['english'],
    pop: ['pop essentials'],
    party: ['party', 'dance hits'],
    'dance-electronic': ['dance hits', 'party'],
    'new-releases': ['new & trending', 'new releases'],
    love: ['bollywood romance', 'romance', 'love'],
    chill: ['chill & sad', 'chill'],
    mood: ['mood', 'chill & sad', 'romance'],
  };
  const terms = matchers[catalog.id] || [];
  if (!terms.length) return [];

  return sections
    .filter((section) => {
      const title = normalizeText(section.name);
      return terms.some((term) => title.includes(term));
    })
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
