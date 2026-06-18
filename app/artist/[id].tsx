import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SongActionsSheet } from '@/src/components/SongActionsSheet';
import { SongRow } from '@/src/components/SongRow';
import { fetchArtist, fetchArtistAlbums, fetchArtistSongs } from '@/src/lib/api';
import { albumTitle, artistTitle, imageUrl } from '@/src/lib/entities';
import { shareArtist } from '@/src/lib/share';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';
import type { HarmoniaAlbum, HarmoniaArtistEntity, Song } from '@/src/types';

export default function ArtistScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { token } = useAuth();
  const { isArtistLiked, toggleArtistLike } = useLibrary();
  const { currentSong, playSong } = usePlayer();
  const [artist, setArtist] = useState<HarmoniaArtistEntity | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [albums, setAlbums] = useState<HarmoniaAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSong, setActionSong] = useState<Song | null>(null);
  const loadGenerationRef = useRef(0);

  const load = async () => {
    const generation = ++loadGenerationRef.current;
    if (!id) {
      setArtist(null);
      setSongs([]);
      setAlbums([]);
      setLoading(false);
      setError('Artist ID is missing');
      return;
    }

    setLoading(true);
    setError(null);
    const [artistResult, songsResult, albumsResult] = await Promise.allSettled([
      fetchArtist(id),
      fetchArtistSongs(id),
      fetchArtistAlbums(id),
    ]);

    if (generation !== loadGenerationRef.current) return;

    if (artistResult.status === 'fulfilled') setArtist(artistResult.value);
    if (songsResult.status === 'fulfilled') setSongs(songsResult.value);
    if (albumsResult.status === 'fulfilled') setAlbums(albumsResult.value);

    if (artistResult.status === 'rejected') {
      setError((artistResult.reason as any)?.message || 'Unable to load this artist');
    }
    setLoading(false);
  };

  useEffect(() => {
    setArtist(null);
    setSongs([]);
    setAlbums([]);
    setActionSong(null);
    void load();
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [id]);

  const visibleSongs = useMemo(() => {
    if (songs.length) return songs;
    if (Array.isArray(artist?.topSongs)) return artist.topSongs;
    if (Array.isArray(artist?.songs)) return artist.songs;
    return [];
  }, [artist, songs]);

  const playFrom = async (startIndex = 0, shuffle = false) => {
    if (!visibleSongs.length || playing) return;
    setPlaying(true);
    try {
      let queue = [...visibleSongs];
      let selected = queue[Math.max(0, Math.min(startIndex, queue.length - 1))];
      if (shuffle && queue.length > 1) {
        for (let index = queue.length - 1; index > 0; index -= 1) {
          const random = Math.floor(Math.random() * (index + 1));
          [queue[index], queue[random]] = [queue[random], queue[index]];
        }
        selected = queue[0];
      }
      await playSong(selected, queue);
    } finally {
      setPlaying(false);
    }
  };

  if (loading && !artist) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color="#FFF" /></View></SafeAreaView>;
  }

  if (!artist) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}><BackButton /></View>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Artist unavailable</Text>
          <Text style={styles.errorBody}>{error || 'This artist could not be loaded.'}</Text>
          <Pressable onPress={() => void load()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const cover = imageUrl(artist.image as any);
  const followerText = artist.followerCount ? `${Number(artist.followerCount).toLocaleString()} followers` : '';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={visibleSongs}
        keyExtractor={(item, index) => item.id || String(index)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.top}>
              <BackButton />
              <View style={styles.headerActions}>
                <Pressable onPress={() => void shareArtist(artist)} style={styles.headerAction} accessibilityLabel="Share artist">
                  <Ionicons name="share-outline" size={20} color="#E8E8E8" />
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (!token) {
                      router.push('/login');
                      return;
                    }
                    void toggleArtistLike(artist);
                  }}
                  style={styles.headerAction}
                  accessibilityLabel={isArtistLiked(String(artist.id || id || '')) ? 'Unfollow artist' : 'Follow artist'}
                >
                  <Ionicons name={isArtistLiked(String(artist.id || id || '')) ? 'heart' : 'heart-outline'} size={20} color="#E8E8E8" />
                </Pressable>
              </View>
            </View>
            <View style={styles.hero}>
              {cover ? (
                <Image source={{ uri: cover }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}><Ionicons name="person-outline" size={54} color="#606060" /></View>
              )}
              <Text style={styles.kicker}>ARTIST</Text>
              <Text style={styles.title}>{artistTitle(artist)}</Text>
              {!!followerText && <Text style={styles.meta}>{followerText}</Text>}
              <View style={styles.actions}>
                <Pressable disabled={!visibleSongs.length || playing} onPress={() => void playFrom(0)} style={styles.primary}>
                  {playing ? <ActivityIndicator color="#080808" /> : <Ionicons name="play" size={20} color="#080808" />}
                  <Text style={styles.primaryText}>Play</Text>
                </Pressable>
                <Pressable disabled={!visibleSongs.length || playing} onPress={() => void playFrom(0, true)} style={styles.secondary}>
                  <Ionicons name="shuffle" size={18} color="#EDEDED" />
                  <Text style={styles.secondaryText}>Shuffle</Text>
                </Pressable>
              </View>
            </View>

            {!!albums.length && (
              <View style={styles.albumSection}>
                <Text style={styles.sectionTitle}>Albums</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumRail}>
                  {albums.slice(0, 16).map((album, index) => {
                    const albumId = String(album.id || '');
                    const albumCover = imageUrl(album.image as any);
                    return (
                      <Pressable
                        key={albumId || `${albumTitle(album)}-${index}`}
                        disabled={!albumId}
                        onPress={() => router.push({ pathname: '/album/[id]', params: { id: albumId } })}
                        style={styles.albumCard}
                      >
                        {albumCover ? (
                          <Image source={{ uri: albumCover }} style={styles.albumCover} contentFit="cover" cachePolicy="memory-disk" />
                        ) : (
                          <View style={[styles.albumCover, styles.albumFallback]}><Ionicons name="disc-outline" size={32} color="#555" /></View>
                        )}
                        <Text numberOfLines={1} style={styles.albumName}>{albumTitle(album)}</Text>
                        <Text numberOfLines={1} style={styles.albumMeta}>{album.year || album.releaseDate || 'Album'}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {!!error && <Text style={styles.inlineError}>{error}</Text>}
            <Text style={styles.sectionTitle}>Popular tracks</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No playable tracks</Text>
            <Text style={styles.emptyBody}>Harmonia did not return songs for this artist.</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <SongRow
            song={item}
            active={currentSong?.id === item.id}
            onPress={() => void playFrom(index)}
            onMorePress={() => setActionSong(item)}
          />
        )}
      />
      <SongActionsSheet song={actionSong} visible={actionSong != null} onClose={() => setActionSong(null)} />
    </SafeAreaView>
  );
}

function BackButton() {
  return (
    <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
      <Ionicons name="chevron-back" size={23} color="#F2F2F2" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  list: { paddingHorizontal: 18, paddingBottom: 150 },
  top: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerAction: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', paddingTop: 8, paddingBottom: 28 },
  avatar: { width: 208, height: 208, borderRadius: 104, backgroundColor: '#111' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  kicker: { color: '#626262', fontSize: 9, fontWeight: '800', letterSpacing: 1.7, marginTop: 20 },
  title: { color: '#F4F4F4', fontSize: 31, lineHeight: 36, fontWeight: '800', textAlign: 'center', letterSpacing: -0.9, marginTop: 7 },
  meta: { color: '#777', fontSize: 12, marginTop: 7 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  primary: { minWidth: 116, height: 46, borderRadius: 15, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 18 },
  primaryText: { color: '#080808', fontSize: 13, fontWeight: '800' },
  secondary: { minWidth: 116, height: 46, borderRadius: 15, backgroundColor: '#141414', borderWidth: StyleSheet.hairlineWidth, borderColor: '#292929', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 18 },
  secondaryText: { color: '#EDEDED', fontSize: 13, fontWeight: '800' },
  sectionTitle: { color: '#EDEDED', fontSize: 18, fontWeight: '800', marginBottom: 10 },
  albumSection: { marginBottom: 28 },
  albumRail: { gap: 12, paddingRight: 10 },
  albumCard: { width: 132 },
  albumCover: { width: 132, height: 132, borderRadius: 14, backgroundColor: '#111' },
  albumFallback: { alignItems: 'center', justifyContent: 'center' },
  albumName: { color: '#E8E8E8', fontSize: 13, fontWeight: '700', marginTop: 8 },
  albumMeta: { color: '#666', fontSize: 11, marginTop: 3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  errorTitle: { color: '#F0F0F0', fontSize: 20, fontWeight: '800' },
  errorBody: { color: '#777', textAlign: 'center', marginTop: 7, lineHeight: 20 },
  retry: { marginTop: 18, height: 42, borderRadius: 13, backgroundColor: '#EEE', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#080808', fontWeight: '800' },
  inlineError: { color: '#E58A8A', fontSize: 12, marginBottom: 12 },
  empty: { paddingVertical: 52, alignItems: 'center' },
  emptyTitle: { color: '#DDD', fontSize: 16, fontWeight: '800' },
  emptyBody: { color: '#6D6D6D', fontSize: 13, marginTop: 5 },
});
