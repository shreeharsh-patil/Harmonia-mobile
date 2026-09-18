import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { fetchCanvasMedia, spotifyTrackId } from '@/src/lib/canvas';
import type { Song } from '@/src/types';
import { usePreferences } from '@/src/providers/PreferencesProvider';

type Props = {
  song: Song;
  size: number;
  radius?: number;
  enableMotion?: boolean;
  isPlaying?: boolean;
  fullScreen?: boolean;
  canvasOnly?: boolean;
  hideArtworkWhenCanvas?: boolean;
  renderMotion?: boolean;
  onCanvasAvailabilityChange?: (available: boolean) => void;
  style?: StyleProp<ViewStyle>;
};

const CANVAS_CACHE_LIMIT = 40;
const NEGATIVE_CANVAS_CACHE_MS = 5 * 60_000;
type CanvasCacheEntry = { url: string | null; expiresAt: number };
const canvasCache = new Map<string, CanvasCacheEntry>();

function cacheCanvas(key: string, url: string | null) {
  if (canvasCache.has(key)) canvasCache.delete(key);
  canvasCache.set(key, {
    url,
    expiresAt: url ? Number.POSITIVE_INFINITY : Date.now() + NEGATIVE_CANVAS_CACHE_MS,
  });
  while (canvasCache.size > CANVAS_CACHE_LIMIT) {
    const oldest = canvasCache.keys().next().value;
    if (!oldest) break;
    canvasCache.delete(oldest);
  }
}

function readCanvasCache(key: string) {
  const entry = canvasCache.get(key);
  if (!entry) return { hit: false, url: null as string | null };
  if (entry.expiresAt <= Date.now()) {
    canvasCache.delete(key);
    return { hit: false, url: null as string | null };
  }
  // Refresh insertion order for simple LRU behavior.
  canvasCache.delete(key);
  canvasCache.set(key, entry);
  return { hit: true, url: entry.url };
}

function MotionCanvas({ url, active }: { url: string; active: boolean }) {
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = true;
    instance.muted = true;
    if (active) instance.play();
  });

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

export function ArtworkRenderer({
  song,
  size,
  radius = 20,
  enableMotion = true,
  isPlaying = false,
  fullScreen = false,
  canvasOnly = false,
  hideArtworkWhenCanvas = false,
  renderMotion = true,
  onCanvasAvailabilityChange,
  style,
}: Props) {
  const { batterySaver } = usePreferences();
  const songRef = useRef(song);
  songRef.current = song;
  const [canvasUrl, setCanvasUrl] = useState<string | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [reduceMotion, setReduceMotion] = useState(false);
  const trackId = spotifyTrackId(song);
  const canvasLookupKey = [song.source, song.provider, song.songId, song.id, song.name, trackId].join(':');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduceMotion(value);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    onCanvasAvailabilityChange?.(Boolean(canvasUrl));
  }, [canvasUrl, onCanvasAvailabilityChange]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    if (!enableMotion || batterySaver || reduceMotion || !foreground) {
      return () => {
        active = false;
        controller.abort();
      };
    }

    const cached = readCanvasCache(canvasLookupKey);
    if (cached.hit) {
      setCanvasUrl(cached.url);
      return () => {
        active = false;
        controller.abort();
      };
    }

    // Never display the previous track's Canvas while a new lookup is pending.
    setCanvasUrl(null);

    fetchCanvasMedia(songRef.current, controller.signal)
      .then((media) => {
        if (!active) return;
        const nextUrl = media?.url || null;
        cacheCanvas(canvasLookupKey, nextUrl);
        setCanvasUrl(nextUrl);
      })
      .catch((cause: any) => {
        if (!active || cause?.name === 'AbortError') return;
        cacheCanvas(canvasLookupKey, null);
        setCanvasUrl(null);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [batterySaver, canvasLookupKey, enableMotion, foreground, reduceMotion]);

  return (
    <View style={[
      fullScreen ? styles.fullScreenShell : { width: size, height: size, borderRadius: radius },
      styles.shell,
      (canvasOnly || (hideArtworkWhenCanvas && canvasUrl)) && styles.transparentShell,
      style,
    ]}>
      {!canvasOnly && !(hideArtworkWhenCanvas && canvasUrl) && (
        <TrackArtwork song={song} size={size} radius={radius} style={styles.artwork} />
      )}
      {renderMotion && !!canvasUrl && enableMotion && foreground && !batterySaver && !reduceMotion && (
        <MotionCanvas url={canvasUrl} active={foreground} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { overflow: 'hidden', backgroundColor: '#101010' },
  fullScreenShell: StyleSheet.absoluteFill,
  transparentShell: { backgroundColor: 'transparent' },
  artwork: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
