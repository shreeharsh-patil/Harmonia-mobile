import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlaylistArtwork } from '@/src/components/PlaylistArtwork';
import { SongActionsSheet } from '@/src/components/SongActionsSheet';
import { SongRow } from '@/src/components/SongRow';
import { fetchRecommendedMixes, fetchSongs } from '@/src/lib/api';
import {
  SONG_LIST_BATCHING_PERIOD_MS,
  SONG_LIST_BATCH_SIZE,
  SONG_LIST_INITIAL_RENDER,
  SONG_LIST_WINDOW_SIZE,
} from '@/src/lib/listPerformance';
import { useAuth } from '@/src/providers/AuthProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';
import type { RecommendedMix, Song } from '@/src/types';

export default function MixScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { token } = useAuth();
  const { currentSong, playSong } = usePlayer();
  const [mix, setMix] = useState<RecommendedMix | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSong, setActionSong] = useState<Song | null>(null);
  const loadGenerationRef = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    if (!token || !id) {
      setMix(null);
      setSongs([]);
      setLoading(false);
      if (token && !id) setError('This mix link is incomplete.');
      return;
    }

    setLoading(true);
    setError(null);
    setMix(null);
    setSongs([]);
    try {
      const mixes = await fetchRecommendedMixes(token);
      const found = mixes.find((item) => String(item._mixId || item.id || '') === id) || null;
      if (!found) throw new Error('This mix is no longer available');
      const nextSongs = await fetchSongs((found.songIds || []).slice(0, 100));
      if (generation !== loadGenerationRef.current) return;

      setMix(found);
      setSongs(nextSongs);
    } catch (cause: any) {
      if (generation === loadGenerationRef.current) {
        setError(cause?.message || 'Unable to load this mix');
      }
    } finally {
      if (generation === loadGenerationRef.current) setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    setMix(null);
    setSongs([]);
    setActionSong(null);
    void load();
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [load]);

  const playFrom = async (startIndex = 0, shuffle = false) => {
    if (!songs.length || playing) return;
    setPlaying(true);
    try {
      let queue = [...songs];
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

  const subtitle = useMemo(() => {
    if (!mix) return '';
    if (mix.sourceType === 'liked_songs') return 'Based on your Liked Songs';
    return 'Based on your recent listening';
  }, [mix]);

  if (!token) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}><BackButton /></View>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Sign in for your mixes</Text>
          <Text style={styles.errorBody}>Made for You mixes use your Harmonia listening history.</Text>
          <Pressable onPress={() => router.push('/login')} style={styles.primarySingle}><Text style={styles.primaryText}>Sign in</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && !mix) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color="#FFF" /></View></SafeAreaView>;
  }

  if (!mix) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}><BackButton /></View>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Mix unavailable</Text>
          <Text style={styles.errorBody}>{error || 'Harmonia could not load this recommendation.'}</Text>
          <Pressable onPress={() => void load()} style={styles.primarySingle}><Text style={styles.primaryText}>Try again</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <FlatList
        data={songs}
        keyExtractor={(item, index) => item.id || String(index)}
        initialNumToRender={SONG_LIST_INITIAL_RENDER}
        maxToRenderPerBatch={SONG_LIST_BATCH_SIZE}
        updateCellsBatchingPeriod={SONG_LIST_BATCHING_PERIOD_MS}
        windowSize={SONG_LIST_WINDOW_SIZE}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.top}><BackButton /></View>
            <View style={styles.hero}>
              <PlaylistArtwork playlist={mix} size={224} radius={18} />
              <Text style={styles.kicker}>MADE FOR YOU</Text>
              <Text style={styles.title}>{mix.name}</Text>
              <Text style={styles.meta}>
                {subtitle}{songs.length ? ` · ${songs.length} ${songs.length === 1 ? 'song' : 'songs'}` : ''}
              </Text>
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
            <Text style={styles.emptyTitle}>This mix is empty</Text>
            <Text style={styles.emptyBody}>Like and play more songs, then refresh your recommendations later.</Text>
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
  top: { height: 54, justifyContent: 'center', paddingHorizontal: 18 },
  back: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', paddingTop: 8, paddingBottom: 28 },
  kicker: { color: '#626262', fontSize: 9, fontWeight: '800', letterSpacing: 1.7, marginTop: 20 },
  title: { color: '#F4F4F4', fontSize: 29, lineHeight: 34, fontWeight: '800', textAlign: 'center', letterSpacing: -0.8, marginTop: 7 },
  meta: { color: '#6D6D6D', fontSize: 12, textAlign: 'center', marginTop: 7 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  primary: { minWidth: 116, height: 46, borderRadius: 15, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 18 },
  primarySingle: { marginTop: 18, height: 44, borderRadius: 14, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primaryText: { color: '#080808', fontSize: 13, fontWeight: '800' },
  secondary: { minWidth: 116, height: 46, borderRadius: 15, backgroundColor: '#141414', borderWidth: StyleSheet.hairlineWidth, borderColor: '#292929', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 18 },
  secondaryText: { color: '#EDEDED', fontSize: 13, fontWeight: '800' },
  sectionTitle: { color: '#EDEDED', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  errorTitle: { color: '#F0F0F0', fontSize: 20, fontWeight: '800' },
  errorBody: { color: '#777', textAlign: 'center', marginTop: 7, lineHeight: 20 },
  inlineError: { color: '#E58A8A', fontSize: 12, marginBottom: 12 },
  empty: { paddingVertical: 52, alignItems: 'center' },
  emptyTitle: { color: '#DDD', fontSize: 16, fontWeight: '800' },
  emptyBody: { color: '#6D6D6D', fontSize: 13, marginTop: 5, textAlign: 'center' },
});
