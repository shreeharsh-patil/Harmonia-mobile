import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchTrendingHomeContent } from '@/src/lib/api';
import { fetchCanvasMedia } from '@/src/lib/canvas';
import { artworkUrl, artistNames } from '@/src/lib/song';
import { usePlayer } from '@/src/providers/PlayerProvider';
import { usePreferences } from '@/src/providers/PreferencesProvider';
import type { Song } from '@/src/types';

function uniqueSongs(songs: Song[]) {
  const seen = new Set<string>();
  return songs.filter((song) => {
    const id = String(song?.id || song?.songId || '').trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function ClipVideo({ url, active }: { url: string; active: boolean }) {
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = true;
    instance.muted = true;
    if (active) instance.play();
  });

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

function ClipCard({ song, active, height }: { song: Song; active: boolean; height: number }) {
  const { batterySaver } = usePreferences();
  const [canvasUrl, setCanvasUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const cover = artworkUrl(song, 720);

  useEffect(() => {
    if (!active || batterySaver) return;
    const controller = new AbortController();
    const request = ++requestRef.current;
    setLoading(true);
    setCanvasUrl(null);

    void fetchCanvasMedia(song, controller.signal)
      .then((media) => {
        if (request === requestRef.current) setCanvasUrl(media?.url || null);
      })
      .catch(() => {
        if (request === requestRef.current) setCanvasUrl(null);
      })
      .finally(() => {
        if (request === requestRef.current) setLoading(false);
      });

    return () => {
      controller.abort();
      requestRef.current += 1;
    };
  }, [active, batterySaver, song]);

  return (
    <View style={[styles.clip, { height }]}>
      {!!cover && <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} blurRadius={18} contentFit="cover" />}
      <View style={styles.backdropShade} />
      {!!canvasUrl && <ClipVideo url={canvasUrl} active={active} />}
      <LinearGradient colors={['rgba(0,0,0,0.06)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.92)']} locations={[0, 0.42, 1]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.clipSafe} edges={['top', 'bottom']}>
        <View style={styles.clipHeader}>
          <Pressable onPress={() => router.back()} hitSlop={14} style={styles.iconButton} accessibilityLabel="Close Music Clips">
            <Ionicons name="chevron-back" size={27} color="#FFF" />
          </Pressable>
          <Text style={styles.clipTitle}>Music Clips</Text>
          <View style={styles.iconButton} />
        </View>

        <View style={styles.clipFooter}>
          {loading && <ActivityIndicator color="#FFF" size="small" style={styles.loading} />}
          <Text style={styles.kicker}>HARMONIA CLIP</Text>
          <Text numberOfLines={2} style={styles.songTitle}>{song.name || song.title || 'Untitled track'}</Text>
          <Text numberOfLines={1} style={styles.artist}>{artistNames(song)}</Text>
          <Text style={styles.hint}>Swipe for the next clip</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

export default function ClipsScreen() {
  const { height } = useWindowDimensions();
  const params = useLocalSearchParams<{ playlistId?: string }>();
  const playlistId = Array.isArray(params.playlistId) ? params.playlistId[0] : params.playlistId;
  const playlistMode = Boolean(playlistId);
  const { currentSong, queue, playSong } = usePlayer();
  const currentSongRef = useRef(currentSong);
  const playlistFeedIdRef = useRef<string | null>(null);
  const userSwipeRef = useRef(false);
  const [songs, setSongs] = useState<Song[]>(() => currentSong ? [currentSong] : []);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pageHeight, setPageHeight] = useState(height);

  useEffect(() => {
    setPageHeight(height);
  }, [height]);

  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

  useEffect(() => {
    if (playlistMode) {
      // Capture the playlist queue once. Audio resolution can replace queue
      // items with refreshed metadata; mirroring those updates into FlatList
      // makes Android reset its paging position and appear to auto-scroll.
      if (playlistFeedIdRef.current !== playlistId && queue.length) {
        playlistFeedIdRef.current = playlistId || null;
        setSongs(uniqueSongs(queue));
      }
      return;
    }

    let mounted = true;
    void fetchTrendingHomeContent()
      .then((content) => {
        if (!mounted) return;
        setSongs(uniqueSongs([...(currentSongRef.current ? [currentSongRef.current] : []), ...content.songs]));
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [playlistId, playlistMode, queue]);

  const activeSongId = currentSong?.id;
  const clips = useMemo(() => uniqueSongs(songs), [songs]);

  useEffect(() => {
    const activeSong = clips[activeIndex];
    if (!activeSong || String(activeSong.id) === String(currentSong?.id || '')) return;
    // Every full-screen swipe immediately advances audio to the matching clip.
    void playSong(activeSong, clips);
  }, [activeIndex, clips, currentSong?.id, playSong]);

  return (
    <View style={styles.root}>
      {clips.length ? (
        <FlatList
          data={clips}
          pagingEnabled
          disableIntervalMomentum
          decelerationRate="fast"
          snapToAlignment="start"
          bounces={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          windowSize={3}
          keyExtractor={(song) => String(song.id || song.songId)}
          onLayout={(event) => {
            const measuredHeight = Math.round(event.nativeEvent.layout.height);
            if (measuredHeight > 0 && Math.abs(measuredHeight - pageHeight) > 1) {
              setPageHeight(measuredHeight);
            }
          }}
          getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
          onScrollBeginDrag={() => {
            userSwipeRef.current = true;
          }}
          onMomentumScrollEnd={(event) => {
            // Layout/data updates can emit a momentum-end event on Android.
            // Only a real touch gesture is allowed to advance clips/playback.
            if (!userSwipeRef.current) return;
            userSwipeRef.current = false;
            const nextIndex = Math.round(event.nativeEvent.contentOffset.y / Math.max(1, pageHeight));
            setActiveIndex((current) => current === nextIndex ? current : nextIndex);
          }}
          renderItem={({ item, index }) => <ClipCard song={item} active={index === activeIndex} height={pageHeight} />}
        />
      ) : (
        <SafeAreaView style={styles.empty}>
          <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Close Music Clips">
            <Ionicons name="chevron-back" size={27} color="#FFF" />
          </Pressable>
          <Text style={styles.emptyTitle}>Music Clips are loading</Text>
          <Text style={styles.emptyBody}>Play a song or return in a moment to see short Canvas clips.</Text>
        </SafeAreaView>
      )}
      {!!activeSongId && <View pointerEvents="none" style={styles.activeMarker} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050505' },
  clip: { width: '100%', overflow: 'hidden', backgroundColor: '#090909' },
  backdropShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.58)' },
  clipSafe: { flex: 1, justifyContent: 'space-between' },
  clipHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  clipTitle: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  clipFooter: { paddingHorizontal: 22, paddingBottom: 18 },
  loading: { alignSelf: 'flex-start', marginBottom: 10 },
  kicker: { color: '#A7F3D0', fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  songTitle: { color: '#FFF', fontSize: 28, lineHeight: 33, fontWeight: '900', marginTop: 7 },
  artist: { color: 'rgba(255,255,255,0.84)', fontSize: 15, fontWeight: '600', marginTop: 4 },
  hint: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  emptyTitle: { color: '#FFF', fontSize: 21, fontWeight: '800', marginTop: 16 },
  emptyBody: { color: '#A2A2A2', fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 21 },
  activeMarker: { position: 'absolute', right: 10, top: '50%', width: 3, height: 44, borderRadius: 999, backgroundColor: '#1ED760' },
});
