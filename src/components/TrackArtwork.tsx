import { Image } from 'expo-image';
import {
  ImageStyle,
  StyleProp,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { artworkUrl } from '@/src/lib/song';
import type { Song } from '@/src/types';

type Props = {
  song?: Song | null;
  size: number;
  radius?: number;
  style?: StyleProp<ImageStyle>;
};

export function TrackArtwork({ song, size, radius = 12, style }: Props) {
  const url = artworkUrl(song);

  if (!url) {
    return (
      <View style={[styles.fallback, { width: size, height: size, borderRadius: radius }, style]}>
        <Text style={[styles.note, { fontSize: Math.max(20, size * 0.28) }]}>♪</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      style={[{ width: size, height: size, borderRadius: radius, backgroundColor: '#151515' }, style]}
      contentFit="cover"
      transition={120}
      cachePolicy="memory-disk"
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: '#181818',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#292929',
  },
  note: { color: '#777', fontWeight: '700' },
});
