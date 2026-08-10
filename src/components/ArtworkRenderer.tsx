import { useEffect, useState } from 'react';
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
  style?: StyleProp<ViewStyle>;
};

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

export function ArtworkRenderer({ song, size, radius = 20, enableMotion = true, style }: Props) {
  const { batterySaver } = usePreferences();
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
    const controller = new AbortController();
    setCanvasUrl(null);

    if (enableMotion && !batterySaver && !reduceMotion && foreground) {
      fetchCanvasMedia(song, controller.signal)
        .then((media) => setCanvasUrl(media?.url || null))
        .catch(() => setCanvasUrl(null));
    }

    return () => controller.abort();
  }, [batterySaver, canvasLookupKey, enableMotion, foreground, reduceMotion, song]);

  return (
    <View style={[{ width: size, height: size, borderRadius: radius }, styles.shell, style]}>
      <TrackArtwork song={song} size={size} radius={radius} style={styles.artwork} />
      {!!canvasUrl && foreground && !batterySaver && !reduceMotion && <MotionCanvas url={canvasUrl} active={foreground} />}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { overflow: 'hidden', backgroundColor: '#101010' },
  artwork: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
