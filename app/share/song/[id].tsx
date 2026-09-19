import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchSongs } from '@/src/lib/api';
import { usePlayer } from '@/src/providers/PlayerProvider';
import type { Song } from '@/src/types';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Opens custom `harmonia://share/song/...` links without ever exposing a backend URL. */
export default function SharedSongScreen() {
  const params = useLocalSearchParams<{ id?: string; title?: string; artist?: string; mode?: string }>();
  const { playSong } = usePlayer();
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false);
  const id = String(first(params.id) || '').trim();
  const title = String(first(params.title) || '').trim();
  const artist = String(first(params.artist) || '').trim();
  const lyrics = first(params.mode) === 'lyrics';

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;
    let active = true;

    const open = async () => {
      try {
        const [resolved] = id && id !== 'unknown' ? await fetchSongs([id]) : [];
        const fallback: Song = {
          id,
          name: title || 'Shared song',
          title: title || 'Shared song',
          primaryArtists: artist || undefined,
        };
        const song = resolved || fallback;
        if (!song.id) throw new Error('Missing shared song');
        await playSong(song, [song]);
        if (active) {
          router.replace({ pathname: '/player', params: { from: 'Shared with you', ...(lyrics ? { panel: 'lyrics' } : {}) } });
        }
      } catch {
        if (active) setError('This shared song is no longer available.');
      }
    };

    void open();
    return () => { active = false; };
  }, [artist, id, lyrics, playSong, title]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        {error ? (
          <>
            <Text style={styles.title}>Can’t open this song</Text>
            <Text style={styles.body}>{error}</Text>
            <Pressable onPress={() => router.replace('/(tabs)')} style={styles.button}>
              <Text style={styles.buttonText}>Go to Home</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator color="#1ED760" size="large" />
            <Text style={styles.title}>Opening in Harmonia</Text>
            <Text numberOfLines={2} style={styles.body}>{title || 'Shared song'}</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707', justifyContent: 'center', padding: 24 },
  card: { alignItems: 'center', borderRadius: 24, padding: 28, backgroundColor: '#151515' },
  title: { color: '#FFF', fontSize: 20, fontWeight: '800', marginTop: 18, textAlign: 'center' },
  body: { color: '#A3A3A3', fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  button: { marginTop: 22, minWidth: 150, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 18, backgroundColor: '#1ED760', alignItems: 'center' },
  buttonText: { color: '#071208', fontSize: 14, fontWeight: '800' },
});
