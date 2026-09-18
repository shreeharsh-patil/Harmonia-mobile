import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { extractArtworkPalette, type ArtworkPalette } from '@/src/lib/palette';

/**
 * Dominant-color wash behind detail-screen heroes, mirroring the web's
 * album/playlist/artist pages: the artwork's tuned dominant color fills the
 * top of the screen and fades into the base #121212 background.
 *
 * Renders nothing until extraction resolves, so screens stay on the flat
 * background when there is no artwork (or in battery-saver mode).
 */
export function ArtworkColorHeader({
  artworkUrl,
  enabled = true,
  height = 320,
}: {
  artworkUrl?: string | null;
  enabled?: boolean;
  height?: number;
}) {
  const [palette, setPalette] = useState<ArtworkPalette | null>(null);

  useEffect(() => {
    let active = true;
    if (!enabled || !artworkUrl) {
      setPalette(null);
      return;
    }
    // Show the new artwork's color only — the previous palette would
    // otherwise linger behind the new hero until extraction resolves.
    setPalette(null);
    void extractArtworkPalette(artworkUrl).then((value) => {
      if (active) setPalette(value);
    });
    return () => {
      active = false;
    };
  }, [enabled, artworkUrl]);

  if (!palette) return null;

  const [r, g, b] = palette.dominantRgb;
  const [sr, sg, sb] = palette.secondaryRgb;

  return (
    <View pointerEvents="none" style={[styles.fill, { height }]}>
      <LinearGradient
        style={StyleSheet.absoluteFill}
        colors={[
          `rgb(${r}, ${g}, ${b})`,
          `rgba(${r}, ${g}, ${b}, 0.72)`,
          `rgba(${sr}, ${sg}, ${sb}, 0.4)`,
          'rgba(18,18,18,0.55)',
          '#121212',
        ]}
        locations={[0, 0.35, 0.6, 0.85, 1]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
