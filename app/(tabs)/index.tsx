import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlaylistCard } from '@/src/components/PlaylistCard';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { fetchHomeSections, fetchPlaylistSongs } from '@/src/lib/api';
import { artistNames } from '@/src/lib/song';
import { usePlayer } from '@/src/providers/PlayerProvider';
import type { MusicSection, Playlist } from '@/src/types';

export default function HomeScreen() {
  const { currentSong, playSong, togglePlayback, isPlaying } = usePlayer();
  const [sections, setSections] = useState<MusicSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openingPlaylist, setOpeningPlaylist] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setSections(await fetchHomeSections());
    } catch (cause: any) {
      setError(cause?.message || 'Unable to load music');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openPlaylist = async (playlist: Playlist) => {
    const id = String(playlist.id || playlist._id || playlist.name);
    if (openingPlaylist) return;
    setOpeningPlaylist(id);
    try {
      const songs = await fetchPlaylistSongs(playlist);
      if (!songs.length) throw new Error('No playable songs found in this playlist');
      await playSong(songs[0], songs);
    } catch (cause: any) {
      setError(cause?.message || 'Unable to open playlist');
    } finally {
      setOpeningPlaylist(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#FFF" />}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>HARMONIA</Text>
            <Text style={styles.heading}>Listen to something good.</Text>
          </View>
          <View style={styles.avatar}><Text style={styles.avatarText}>H</Text></View>
        </View>

        {currentSong && (
          <Pressable onPress={() => void togglePlayback()} style={styles.resume}>
            <TrackArtwork song={currentSong} size={62} radius={12} />
            <View style={styles.resumeCopy}>
              <Text style={styles.resumeLabel}>CONTINUE LISTENING</Text>
              <Text numberOfLines={1} style={styles.resumeTitle}>{currentSong.name}</Text>
              <Text numberOfLines={1} style={styles.resumeArtist}>{artistNames(currentSong)}</Text>
            </View>
            <View style={styles.resumeButton}><Text style={styles.resumeButtonText}>{isPlaying ? 'Ⅱ' : '▶'}</Text></View>
          </Pressable>
        )}

        {!!error && (
          <Pressable onPress={() => void load()} style={styles.errorBox}>
            <Text style={styles.error}>{error}</Text>
            <Text style={styles.retry}>Tap to retry</Text>
          </Pressable>
        )}

        {loading && !sections.length ? (
          <View style={styles.loader}><ActivityIndicator color="#FFF" /></View>
        ) : (
          sections.map((section) => (
            <View key={String(section.id || section._id || section.name)} style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{section.name}</Text>
                <Text style={styles.sectionMeta}>{section.playlists?.length || 0}</Text>
              </View>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={section.playlists || []}
                keyExtractor={(item, index) => String(item.id || item._id || `${section.name}-${index}`)}
                renderItem={({ item }) => (
                  <View style={openingPlaylist === String(item.id || item._id || item.name) ? styles.loadingCard : null}>
                    <PlaylistCard playlist={item} onPress={() => void openPlaylist(item)} />
                  </View>
                )}
              />
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  content: { paddingHorizontal: 18, paddingBottom: 160 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, paddingBottom: 26 },
  eyebrow: { color: '#666', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  heading: { color: '#FFF', fontSize: 29, lineHeight: 33, fontWeight: '800', letterSpacing: -0.9, marginTop: 5, maxWidth: 290 },
  avatar: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#EDEDED', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#080808', fontSize: 18, fontWeight: '900' },
  resume: { height: 82, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: '#292929', backgroundColor: '#111', padding: 10, flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
  resumeCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  resumeLabel: { color: '#5F5F5F', fontSize: 8, fontWeight: '800', letterSpacing: 1.4 },
  resumeTitle: { color: '#F4F4F4', fontSize: 15, fontWeight: '800', marginTop: 4 },
  resumeArtist: { color: '#7C7C7C', fontSize: 12, marginTop: 2 },
  resumeButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center' },
  resumeButtonText: { color: '#080808', fontSize: 17, fontWeight: '900' },
  section: { marginBottom: 30 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 13 },
  sectionTitle: { color: '#F4F4F4', fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  sectionMeta: { color: '#555', fontSize: 11, fontWeight: '700' },
  loader: { height: 260, alignItems: 'center', justifyContent: 'center' },
  loadingCard: { opacity: 0.45 },
  errorBox: { borderRadius: 14, backgroundColor: '#171010', padding: 14, marginBottom: 22 },
  error: { color: '#EE8A8A', fontSize: 13, fontWeight: '600' },
  retry: { color: '#777', fontSize: 11, marginTop: 4 },
});
