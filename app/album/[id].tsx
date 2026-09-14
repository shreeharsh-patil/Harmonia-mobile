import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
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
import { fetchAlbum } from '@/src/lib/api';
import { albumTitle, imageUrl } from '@/src/lib/entities';
import { shareAlbum } from '@/src/lib/share';
import { artistNames, normalizeSong } from '@/src/lib/song';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';
import type { HarmoniaAlbum, Song } from '@/src/types';

export default function AlbumScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { token } = useAuth();
  const { isAlbumLiked, toggleAlbumLike } = useLibrary();
  const { currentSong, playSong } = usePlayer();
  const [album, setAlbum] = useState<HarmoniaAlbum | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSong, setActionSong] = useState<Song | null>(null);
  const loadGenerationRef = useRef(0);

  const songs = useMemo(
    () => (Array.isArray(album?.songs) ? album.songs : []).map((song) => normalizeSong(song as any)),
    [album]
  );

  const load = async () => {
    const generation = ++loadGenerationRef.current;
    if (!id) {
      setAlbum(null);
      setLoading(false);
      setError('Album ID is missing');
      return;
    }

    setLoading(true);
    setError(null);
    setAlbum(null);
    try {
      const nextAlbum = await fetchAlbum(id);
      if (generation !== loadGenerationRef.current) return;
      setAlbum(nextAlbum);
    } catch (cause: any) {
      if (generation === loadGenerationRef.current) {
        setError(cause?.message || 'Unable to load this album');
      }
    } finally {
      if (generation === loadGenerationRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    setAlbum(null);
    setActionSong(null);
    void load();
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [id]);

  const playFrom = async (startIndex = 0, shuffle = false) => {
    if (!songs.length || playing) return;
    setPlaying(true);
    try {
      let queue = songs;
      let selected = songs[Math.max(0, Math.min(startIndex, songs.length - 1))];
      if (shuffle && songs.length > 1) {
        queue = [...songs];
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

  if (loading && !album) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color="#FFF" /></View></SafeAreaView>;
  }

  if (!album) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}><BackButton /></View>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Album unavailable</Text>
          <Text style={styles.errorBody}>{error || 'This album could not be loaded.'}</Text>
          <Pressable onPress={() => void load()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const cover = imageUrl(album.image as any, 224);
  const subtitle =
    album.primaryArtists ||
    (songs[0] ? artistNames(songs[0]) : '') ||
    String((album as any).artist || 'Various artists');
  const release = album.releaseDate || album.year;
  const meta = [release ? String(release) : '', songs.length ? `${songs.length} songs` : ''].filter(Boolean).join(' · ');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <FlatList
        data={songs}
        keyExtractor={(item, index) => item.id || String(index)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.top}>
              <BackButton />
              <View style={styles.headerActions}>
                <Pressable onPress={() => void shareAlbum(album)} style={styles.headerAction} accessibilityLabel="Share album">
                  <Ionicons name="share-outline" size={20} color="#E8E8E8" />
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (!token) {
                      router.push('/login');
                      return;
                    }
                    void toggleAlbumLike(album);
                  }}
                  style={styles.headerAction}
                  accessibilityLabel={isAlbumLiked(String(album.id || id || '')) ? 'Remove album from library' : 'Save album'}
                >
                  <Ionicons name={isAlbumLiked(String(album.id || id || '')) ? 'heart' : 'heart-outline'} size={20} color="#E8E8E8" />
                </Pressable>
              </View>
            </View>
            <View style={styles.hero}>
              {cover ? (
                <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <View style={[styles.cover, styles.coverFallback]}><Ionicons name="disc-outline" size={58} color="#5D5D5D" /></View>
              )}
              <Text style={styles.kicker}>ALBUM</Text>
              <Text style={styles.title}>{albumTitle(album)}</Text>
              {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
              {!!meta && <Text style={styles.meta}>{meta}</Text>}
              <View style={styles.actions}>
                <Pressable disabled={!songs.length || playing} onPress={() => void playFrom(0)} style={styles.primary}>
                  {playing ? <ActivityIndicator color="#080808" /> : <Ionicons name="play" size={20} color="#080808" />}
                  <Text style={styles.primaryText}>Play</Text>
                </Pressable>
                <Pressable disabled={!songs.length || playing} onPress={() => void playFrom(0, true)} style={styles.secondary}>
                  <Ionicons name="shuffle" size={18} color="#EDEDED" />
                  <Text style={styles.secondaryText}>Shuffle</Text>
                </Pressable>
              </View>
            </View>
            {!!error && <Text style={styles.inlineError}>{error}</Text>}
            <Text style={styles.sectionTitle}>Tracks</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No playable tracks</Text>
            <Text style={styles.emptyBody}>Harmonia did not return tracks for this album.</Text>
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
  list: { paddingHorizontal: 18, paddingBottom: 32 },
  top: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerAction: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', paddingTop: 8, paddingBottom: 28 },
  cover: { width: 224, height: 224, borderRadius: 18, backgroundColor: '#111' },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  kicker: { color: '#626262', fontSize: 9, fontWeight: '800', letterSpacing: 1.7, marginTop: 20 },
  title: { color: '#F4F4F4', fontSize: 29, lineHeight: 34, fontWeight: '800', textAlign: 'center', letterSpacing: -0.8, marginTop: 7 },
  subtitle: { color: '#AAA', fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 7 },
  meta: { color: '#666', fontSize: 12, textAlign: 'center', marginTop: 5 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  primary: { minWidth: 116, height: 46, borderRadius: 15, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 18 },
  primaryText: { color: '#080808', fontSize: 13, fontWeight: '800' },
  secondary: { minWidth: 116, height: 46, borderRadius: 15, backgroundColor: '#141414', borderWidth: StyleSheet.hairlineWidth, borderColor: '#292929', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 18 },
  secondaryText: { color: '#EDEDED', fontSize: 13, fontWeight: '800' },
  sectionTitle: { color: '#EDEDED', fontSize: 18, fontWeight: '800', marginBottom: 8 },
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
