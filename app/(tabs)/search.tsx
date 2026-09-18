import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlaylistCard } from '@/src/components/PlaylistCard';

import { CatalogSearchSkeleton } from '@/src/components/CatalogSearchSkeleton';
import { getTabContentBottomInset } from '@/src/components/MiniPlayer';
import { RECENT_SEARCHES_KEY } from '@/src/config';
import { SongActionsSheet } from '@/src/components/SongActionsSheet';
import { SongRow } from '@/src/components/SongRow';
import { searchMusic } from '@/src/lib/api';
import {
  BROWSE_CATALOGS,
  browseCatalogColor,
  browseCatalogCoverImages,
  fetchBrowseCatalogCoverImages,
  type BrowseCatalog,
} from '@/src/lib/browseCatalog';
import { albumTitle, artistTitle, entityImageUrl } from '@/src/lib/entities';
import { getStaticHomeSections } from '@/src/lib/staticCatalog';
import {
  SONG_LIST_BATCHING_PERIOD_MS,
  SONG_LIST_BATCH_SIZE,
  SONG_LIST_INITIAL_RENDER,
  SONG_LIST_WINDOW_SIZE,
} from '@/src/lib/listPerformance';
import { artistNames } from '@/src/lib/song';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';
import { colors } from '@/src/theme';
import type { HarmoniaAlbum, HarmoniaArtistEntity, Playlist, SearchPayload, Song } from '@/src/types';

type SearchTab = 'all' | 'songs' | 'albums' | 'artists' | 'playlists';

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { isLiked } = useLibrary();
  const { currentSong, isPlaying, playSong, togglePlayback } = usePlayer();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('all');
  const [results, setResults] = useState<SearchPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSong, setActionSong] = useState<Song | null>(null);
  const [retrySeq, setRetrySeq] = useState(0);
  const [catalogCovers, setCatalogCovers] = useState<Record<string, string>>(() =>
    browseCatalogCoverImages(getStaticHomeSections())
  );
  const trimmed = query.trim();

  useEffect(() => {
    // Purge data created by older builds. Current searches are never stored.
    void AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  }, []);

  useEffect(() => {
    if (trimmed) return;
    let active = true;

    // Keep Browse-all artwork in sync with the current catalog. This request
    // uses the shared Home cache and never blocks the Search screen.
    void fetchBrowseCatalogCoverImages()
      .then((covers) => {
        if (active) setCatalogCovers(covers);
      })
      .catch(() => {
        // The checked-in category covers remain available offline.
      });

    return () => {
      active = false;
    };
  }, [trimmed]);

  useEffect(() => {
    if (!trimmed) {
      setResults(null);
      setLoading(false);
      setError(null);
      setActiveTab('all');
      return;
    }

    const controller = new AbortController();
    let active = true;

    // Never show results from the previous query under a new search term.
    setResults(null);
    setError(null);

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const value = await searchMusic(trimmed, 30, controller.signal);
        if (active) setResults(value);
      } catch (cause: any) {
        if (active && cause?.name !== 'AbortError') {
          setError(cause?.message || 'Search failed');
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, retrySeq]);

  const songs = useMemo(() => results?.songs?.results || [], [results]);
  const albums = useMemo(() => results?.albums?.results || [], [results]);
  const artists = useMemo(() => results?.artists?.results || [], [results]);
  const playlists = useMemo(() => results?.playlists?.results || [], [results]);
  const topResult = useMemo(() => {
    if (results?.topQuery?.results?.[0]) return results.topQuery.results[0];
    if (results?.topQuery && !(results.topQuery as any).results) return results.topQuery;
    if (songs.length) return { ...songs[0], type: 'song' as const };
    return null;
  }, [results, songs]);

  const hasResults = songs.length || albums.length || artists.length || playlists.length;
  const contentBottomInset = getTabContentBottomInset(insets.bottom, Boolean(currentSong));

  const openPlaylist = (playlist: Playlist) => {
    const id = String(playlist.id || playlist._id || '');
    if (!id) return;
    Keyboard.dismiss();
    router.push({ pathname: '/playlist/[id]', params: { id } });
  };

  const openAlbum = (album: HarmoniaAlbum) => {
    const id = String(album.id || '');
    if (!id || id.startsWith('search-')) return;
    Keyboard.dismiss();
    router.push({ pathname: '/album/[id]', params: { id } });
  };

  const openArtist = (artist: HarmoniaArtistEntity) => {
    const id = String(artist.id || '');
    if (!id || id.startsWith('search-')) return;
    Keyboard.dismiss();
    router.push({ pathname: '/artist/[id]', params: { id } });
  };

  const openBrowseCategory = (category: BrowseCatalog) => {
    Keyboard.dismiss();
    router.push({ pathname: '/catalog/[id]', params: { id: category.id } });
  };

  const isTopItemActive = topResult && (topResult as any).id === currentSong?.id;

  const handleTopResultPlay = async () => {
    if (!topResult) return;
    if ((topResult as any).type === 'song' || !(topResult as any).type) {
      if (isTopItemActive) {
        await togglePlayback();
      } else {
        Keyboard.dismiss();
        await playSong(topResult as Song, songs.length ? songs : [topResult as Song]);
      }
    } else if ((topResult as any).type === 'album') {
      openAlbum(topResult as HarmoniaAlbum);
    } else if ((topResult as any).type === 'artist') {
      openArtist(topResult as HarmoniaArtistEntity);
    } else if ((topResult as any).type === 'playlist') {
      openPlaylist(topResult as Playlist);
    }
  };

  const topResultCover = topResult ? entityImageUrl(topResult, 180) : '';

  const topResultView = topResult && activeTab === 'all' ? (
    <View style={styles.topResultSection}>
      <Text style={styles.sectionTitle}>Top result</Text>
      <Pressable
        onPress={() => void handleTopResultPlay()}
        style={({ pressed }) => [styles.topResultCard, pressed && styles.topResultPressed]}
      >
        <View style={styles.topResultContent}>
          <View style={styles.topResultArtworkWrap}>
            {topResultCover ? (
              <Image
                source={{ uri: topResultCover }}
                style={[
                  styles.topResultArtwork,
                  (topResult as any).type === 'artist' && styles.topResultArtistArtwork,
                ]}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View
                style={[
                  styles.topResultArtwork,
                  styles.imageFallback,
                  (topResult as any).type === 'artist' && styles.topResultArtistArtwork,
                ]}
              >
                <Ionicons
                  name={(topResult as any).type === 'artist' ? 'person' : 'musical-note'}
                  size={32}
                  color="#666"
                />
              </View>
            )}
          </View>

          <View style={styles.topResultCopy}>
            <Text numberOfLines={1} style={styles.topResultTitle}>
              {(topResult as any).name || (topResult as any).title}
            </Text>
            <View style={styles.topResultBadgeRow}>
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>
                  {String((topResult as any).type || 'Song').toUpperCase()}
                </Text>
              </View>
              {!!artistNames(topResult as any) && (
                <>
                  <Text style={styles.metaDot}>•</Text>
                  <Text numberOfLines={1} style={styles.topResultArtist}>
                    {artistNames(topResult as any)}
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>

        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            void handleTopResultPlay();
          }}
          style={({ pressed }) => [styles.topResultPlayBtn, pressed && styles.pressed]}
          accessibilityLabel="Play top result"
        >
          <Ionicons
            name={isTopItemActive && isPlaying ? 'pause' : 'play'}
            size={22}
            color="#FFFFFF"
            style={isTopItemActive && isPlaying ? undefined : { marginLeft: 2 }}
          />
        </Pressable>
      </Pressable>
    </View>
  ) : null;

  const header = (
    <>
      {topResultView}

      {activeTab === 'all' && !!artists.length && (
        <SearchRail title="Artists">
          {artists.slice(0, 12).map((artist, index) => {
            const cover = entityImageUrl(artist, 112);
            const id = String(artist.id || '');
            const navigable = Boolean(id && !id.startsWith('search-'));
            return (
              <Pressable
                key={id || `artist-${index}`}
                disabled={!navigable}
                onPress={() => openArtist(artist)}
                style={styles.artistCard}
              >
                {cover ? (
                  <Image source={{ uri: cover }} style={styles.artistImage} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.artistImage, styles.imageFallback]}>
                    <Ionicons name="person-outline" size={30} color="#575757" />
                  </View>
                )}
                <Text numberOfLines={1} style={styles.entityTitle}>{artistTitle(artist)}</Text>
                <Text numberOfLines={1} style={styles.entityMeta}>{navigable ? 'Artist' : 'Artist result'}</Text>
              </Pressable>
            );
          })}
        </SearchRail>
      )}

      {activeTab === 'all' && !!albums.length && (
        <SearchRail title="Albums">
          {albums.slice(0, 12).map((album, index) => {
            const cover = entityImageUrl(album, 126);
            const id = String(album.id || '');
            const navigable = Boolean(id && !id.startsWith('search-'));
            return (
              <Pressable
                key={id || `album-${index}`}
                disabled={!navigable}
                onPress={() => openAlbum(album)}
                style={styles.albumCard}
              >
                {cover ? (
                  <Image source={{ uri: cover }} style={styles.albumImage} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.albumImage, styles.imageFallback]}>
                    <Ionicons name="disc-outline" size={30} color="#575757" />
                  </View>
                )}
                <Text numberOfLines={1} style={styles.entityTitle}>{albumTitle(album)}</Text>
                <Text numberOfLines={1} style={styles.entityMeta}>{album.primaryArtists || album.year || 'Album'}</Text>
              </Pressable>
            );
          })}
        </SearchRail>
      )}

      {activeTab === 'all' && !!playlists.length && (
        <SearchRail title="Playlists">
          {playlists.slice(0, 12).map((playlist, index) => (
            <PlaylistCard
              key={String(playlist.id || playlist._id || index)}
              playlist={playlist}
              size={126}
              onPress={() => openPlaylist(playlist)}
            />
          ))}
        </SearchRail>
      )}

      {(activeTab === 'all' || activeTab === 'songs') && !!songs.length && (
        <Text style={styles.sectionTitle}>Songs</Text>
      )}
    </>
  );

  const displayedSongs = useMemo(() => {
    if (activeTab === 'songs') return songs;
    if (activeTab === 'all') return songs;
    return [];
  }, [activeTab, songs]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Search</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={19} color="#777" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="What do you want to listen to?"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
            style={styles.input}
          />
          {loading && (
            <ActivityIndicator size="small" color={colors.accentBright} style={styles.spinner} />
          )}
          {!!query && !loading && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setQuery('')}
              style={styles.clear}
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={21} color="#7A7A7A" />
            </Pressable>
          )}
        </View>

        {/* Category Pills Bar (Mirrors Web App) */}
        {!!trimmed && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsRow}
            style={styles.tabsScroll}
          >
            {(['all', 'songs', 'albums', 'artists', 'playlists'] as SearchTab[]).map((tab) => {
              const active = activeTab === tab;
              const label = tab.charAt(0).toUpperCase() + tab.slice(1);
              return (
                <Pressable
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={[styles.tabChip, active && styles.tabChipActive]}
                >
                  <Text style={[styles.tabChipText, active && styles.tabChipTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {!trimmed ? (
        <ScrollView
          contentContainerStyle={[styles.idleContent, { paddingBottom: contentBottomInset }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.browseGrid}>
            {BROWSE_CATALOGS.map((category) => {
              const cover = catalogCovers[category.id] || category.coverImage;
              return (
                <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Browse ${category.name}`}
                  onPress={() => openBrowseCategory(category)}
                  style={({ pressed }) => [
                    styles.browseCard,
                    { backgroundColor: browseCatalogColor(category) },
                    pressed && styles.browseCardPressed,
                  ]}
                >
                  <View style={styles.browseCardCopy}>
                    <Text numberOfLines={2} style={styles.browseCardTitle}>{category.name}</Text>
                  </View>

                  <View style={styles.browseArtworkWrap}>
                    <Image
                      source={{ uri: cover }}
                      style={styles.browseArtwork}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : error && !results ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Search failed</Text>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={() => setRetrySeq((value) => value + 1)} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : activeTab === 'artists' ? (
        <ScrollView
          contentContainerStyle={[styles.resultsGridContent, { paddingBottom: contentBottomInset }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.artistsGrid}>
            {artists.map((artist, index) => {
              const cover = entityImageUrl(artist, 140);
              const id = String(artist.id || '');
              const navigable = Boolean(id && !id.startsWith('search-'));
              return (
                <Pressable
                  key={id || `artist-${index}`}
                  disabled={!navigable}
                  onPress={() => openArtist(artist)}
                  style={styles.artistGridCard}
                >
                  {cover ? (
                    <Image source={{ uri: cover }} style={styles.artistGridImage} contentFit="cover" cachePolicy="memory-disk" />
                  ) : (
                    <View style={[styles.artistGridImage, styles.imageFallback]}>
                      <Ionicons name="person-outline" size={36} color="#575757" />
                    </View>
                  )}
                  <Text numberOfLines={1} style={styles.gridCardTitle}>{artistTitle(artist)}</Text>
                  <Text numberOfLines={1} style={styles.gridCardSubtitle}>Artist</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : activeTab === 'albums' ? (
        <ScrollView
          contentContainerStyle={[styles.resultsGridContent, { paddingBottom: contentBottomInset }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.albumsGrid}>
            {albums.map((album, index) => {
              const cover = entityImageUrl(album, 160);
              const id = String(album.id || '');
              const navigable = Boolean(id && !id.startsWith('search-'));
              return (
                <Pressable
                  key={id || `album-${index}`}
                  disabled={!navigable}
                  onPress={() => openAlbum(album)}
                  style={styles.albumGridCard}
                >
                  {cover ? (
                    <Image source={{ uri: cover }} style={styles.albumGridImage} contentFit="cover" cachePolicy="memory-disk" />
                  ) : (
                    <View style={[styles.albumGridImage, styles.imageFallback]}>
                      <Ionicons name="disc-outline" size={36} color="#575757" />
                    </View>
                  )}
                  <Text numberOfLines={1} style={styles.gridCardTitle}>{albumTitle(album)}</Text>
                  <Text numberOfLines={1} style={styles.gridCardSubtitle}>
                    {album.primaryArtists || album.year || 'Album'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : activeTab === 'playlists' ? (
        <ScrollView
          contentContainerStyle={[styles.resultsGridContent, { paddingBottom: contentBottomInset }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.albumsGrid}>
            {playlists.map((playlist, index) => (
              <PlaylistCard
                key={String(playlist.id || playlist._id || index)}
                playlist={playlist}
                size={160}
                onPress={() => openPlaylist(playlist)}
              />
            ))}
          </View>
        </ScrollView>
      ) : (
        <FlatList<Song>
          data={displayedSongs}
          keyExtractor={(item, index) => item.id || String(index)}
          initialNumToRender={SONG_LIST_INITIAL_RENDER}
          maxToRenderPerBatch={SONG_LIST_BATCH_SIZE}
          updateCellsBatchingPeriod={SONG_LIST_BATCHING_PERIOD_MS}
          windowSize={SONG_LIST_WINDOW_SIZE}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          ListEmptyComponent={
            loading ? (
              <CatalogSearchSkeleton />
            ) : !hasResults ? (
              <Text style={styles.empty}>No results found for “{trimmed}”.</Text>
            ) : null
          }
          renderItem={({ item, index }) => (
            <SongRow
              song={item}
              index={index}
              showIndex={true}
              isPlaying={isPlaying && currentSong?.id === item.id}
              active={currentSong?.id === item.id}
              onMorePress={() => setActionSong(item)}
              onPress={() => {
                Keyboard.dismiss();
                void playSong(item, displayedSongs);
              }}
              trailing={isLiked(item.id) ? <Text style={styles.likedIndicator}>♥</Text> : null}
            />
          )}
          contentContainerStyle={[styles.results, { paddingBottom: contentBottomInset }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {!!error && !!results && (
        <Text
          numberOfLines={1}
          style={[styles.nonBlockingError, { bottom: Math.max(16, contentBottomInset - 12) }]}
        >
          {error}
        </Text>
      )}
      <SongActionsSheet song={actionSong} visible={actionSong != null} onClose={() => setActionSong(null)} />
    </SafeAreaView>
  );
}

function SearchRail({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.railSection}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: 'rgba(18,18,18,0.96)',
  },
  pageTitle: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginBottom: 12,
  },
  searchBox: {
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    color: colors.textStrong,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
  },
  spinner: { width: 28, height: 28 },
  clear: { width: 34, height: 36, alignItems: 'center', justifyContent: 'center' },
  tabsScroll: { marginTop: 10 },
  tabsRow: { gap: 8, paddingRight: 10 },
  // Web search filters: rounded-full pills on secondary bg, active pill
  // filled with the primary green
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(36,36,36,0.85)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tabChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  tabChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  tabChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  topResultSection: {
    marginBottom: 20,
  },
  // Web "Top result" panel: bg-card/40 translucent with hairline border
  topResultCard: {
    backgroundColor: colors.cardTranslucentStrong,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(41,41,41,0.5)',
    position: 'relative',
    overflow: 'hidden',
  },
  topResultPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  topResultContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 56,
  },
  topResultArtworkWrap: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  topResultArtwork: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  topResultArtistArtwork: {
    borderRadius: 40,
  },
  topResultCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 14,
    justifyContent: 'center',
  },
  topResultTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  topResultBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  typeBadge: {
    backgroundColor: 'rgba(16,185,129,0.16)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  metaDot: {
    color: '#555555',
    fontSize: 12,
  },
  topResultArtist: {
    color: '#A3A3A3',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  // Web quick-card play button: rounded-full bg-primary (emerald) with
  // soft green shadow
  topResultPlayBtn: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  results: { paddingHorizontal: 16, paddingTop: 14 },
  resultsGridContent: { paddingHorizontal: 16, paddingTop: 16 },
  artistsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 18,
  },
  artistGridCard: {
    width: '47%',
    alignItems: 'center',
  },
  artistGridImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.surface,
  },
  albumsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 18,
  },
  albumGridCard: {
    width: '47%',
  },
  albumGridImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
  },
  gridCardTitle: {
    color: colors.textStrong,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
  gridCardSubtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  railSection: { marginBottom: 24, paddingTop: 6 },
  rail: { gap: 12, paddingRight: 10 },
  sectionTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 12,
  },
  artistCard: { width: 118 },
  artistImage: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.surface },
  albumCard: { width: 126 },
  albumImage: { width: 126, height: 126, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },
  entityTitle: { color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 8 },
  entityMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  idleContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16 },
  browseGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  browseCard: {
    width: '48.4%',
    height: 112,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.13)',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  browseCardPressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  browseCardCopy: { paddingHorizontal: 14, paddingTop: 15, paddingRight: '30%' },
  browseCardTitle: {
    color: '#FFF',
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '800',
    letterSpacing: -0.25,
    textShadowColor: 'rgba(0,0,0,0.22)',
    textShadowRadius: 3,
  },
  browseArtworkWrap: {
    position: 'absolute',
    right: -13,
    bottom: -13,
    width: '49%',
    aspectRatio: 1,
    borderRadius: 7,
    overflow: 'hidden',
    transform: [{ rotate: '25deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 7,
    shadowOffset: { width: -3, height: 4 },
    elevation: 6,
  },
  browseArtwork: { width: '100%', height: '100%' },
  errorTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  error: { color: colors.muted, textAlign: 'center', marginTop: 7, lineHeight: 19 },
  retry: { marginTop: 17, height: 42, borderRadius: 999, backgroundColor: colors.textStrong, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: colors.background, fontWeight: '800', fontSize: 12 },
  empty: { color: colors.muted, textAlign: 'center', paddingVertical: 60 },
  nonBlockingError: { position: 'absolute', left: 20, right: 20, color: '#FCA5A5', fontSize: 11, backgroundColor: '#241414', borderRadius: 10, padding: 9 },
  likedIndicator: { color: '#FFF', fontSize: 17, marginLeft: 8 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
});
