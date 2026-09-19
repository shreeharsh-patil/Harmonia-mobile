import { memo } from 'react';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { PlaylistArtwork } from '@/src/components/PlaylistArtwork';
import { albumTitle, entityImageUrl } from '@/src/lib/entities';
import type { CatalogItem } from '@/src/lib/browseCatalog';

export const CatalogEntityCard = memo(function CatalogEntityCard({
  item,
  size,
  style,
}: {
  item: CatalogItem;
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const isPlaylist = item.kind === 'playlist';
  const title = isPlaylist
    ? item.data.name || item.data.title || 'Playlist'
    : albumTitle(item.data);
  const rawCount = isPlaylist ? Math.max(Number(item.data.songCount || 0), item.data.songIds?.length || 0, item.data.tracks?.length || 0) : 0;
  const isSpotifyOrCurated = isPlaylist && (
    (item.data as any).source === 'spotify' ||
    (item.data as any).catalogSource === 'bundled' ||
    Boolean((item.data as any).sourceUrl?.includes('spotify')) ||
    Boolean((item.data as any).spotifyId)
  );
  const count = isPlaylist && rawCount < 35 && isSpotifyOrCurated ? 50 : rawCount;
  const meta = isPlaylist
    ? count
      ? `${count} ${count === 1 ? 'song' : 'songs'}`
      : item.data.subtitle || item.data.owner || 'Playlist'
    : item.data.primaryArtists || item.data.year || 'Album';
  const cover = isPlaylist ? '' : entityImageUrl(item.data, size);

  const open = () => {
    const id = String(item.data.id || (isPlaylist ? item.data._id : '') || '');
    if (!id) return;
    if (isPlaylist) router.push({ pathname: '/playlist/[id]', params: { id } });
    else router.push({ pathname: '/album/[id]', params: { id } });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${title}`}
      onPress={open}
      style={({ pressed }) => [styles.card, { width: size }, style, pressed && styles.pressed]}
    >
      {isPlaylist ? (
        <PlaylistArtwork playlist={item.data} size={size} radius={8} />
      ) : cover ? (
        <Image
          source={{ uri: cover }}
          style={[styles.artwork, { width: size, height: size }]}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={`catalog-album-${item.data.id}`}
        />
      ) : (
        <View style={[styles.artwork, styles.fallback, { width: size, height: size }]}>
          <Ionicons name="disc-outline" size={38} color="#555" />
        </View>
      )}
      <Text numberOfLines={1} style={styles.title}>{title}</Text>
      <Text numberOfLines={1} style={styles.meta}>{meta}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { flexShrink: 0 },
  artwork: { borderRadius: 8, backgroundColor: '#171717' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  title: { color: '#E8E8E8', fontSize: 14, lineHeight: 18, fontWeight: '800', marginTop: 10 },
  meta: { color: '#898989', fontSize: 12, lineHeight: 16, fontWeight: '500', marginTop: 3 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
