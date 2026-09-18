import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TrackArtwork } from '@/src/components/TrackArtwork';
import { artistNames } from '@/src/lib/song';
import { colors } from '@/src/theme';
import type { Song } from '@/src/types';

function formatDuration(seconds?: number | string | null): string {
  if (seconds == null || seconds === '') return '';
  const num = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
  if (!Number.isFinite(num) || num <= 0) return '';
  const mins = Math.floor(num / 60);
  const secs = Math.floor(num % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function SongRow({
  song,
  onPress,
  active = false,
  trailing,
  onMorePress,
  index,
  showIndex = false,
  isPlaying = false,
}: {
  song: Song;
  onPress: () => void;
  active?: boolean;
  trailing?: React.ReactNode;
  onMorePress?: () => void;
  index?: number;
  showIndex?: boolean;
  isPlaying?: boolean;
}) {
  const durationText = formatDuration(song.duration);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${song.name || song.title || 'song'}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        active && styles.activeRow,
        pressed && styles.pressed,
      ]}
    >
      {showIndex && index != null && (
        <View style={styles.indexCol}>
          {active ? (
            <Ionicons
              name={isPlaying ? 'volume-high' : 'play'}
              size={15}
              color={colors.accentBright}
            />
          ) : (
            <Text style={styles.indexText}>{index + 1}</Text>
          )}
        </View>
      )}

      <View style={styles.artworkWrap}>
        <TrackArtwork song={song} size={48} radius={12} />
        {active && (
          <View style={styles.activeArtworkOverlay}>
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={14}
              color="#FFFFFF"
            />
          </View>
        )}
      </View>

      <View style={styles.copy}>
        <Text
          numberOfLines={1}
          style={[styles.title, active && styles.activeTitle]}
        >
          {song.name || song.title}
        </Text>
        <Text numberOfLines={1} style={styles.artist}>
          {artistNames(song)}
        </Text>
      </View>

      {!!durationText && (
        <Text style={styles.duration}>{durationText}</Text>
      )}

      {trailing}

      {onMorePress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More actions for ${song.name || song.title}`}
          onPress={(event) => {
            event.stopPropagation();
            onMorePress();
          }}
          hitSlop={8}
          style={styles.more}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color="#8A8A8A" />
        </Pressable>
      ) : trailing == null ? (
        <Ionicons name="chevron-forward" size={18} color="#555555" style={styles.play} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 14,
  },
  activeRow: {
    backgroundColor: colors.cardTranslucent,
  },
  indexCol: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  indexText: {
    color: '#737373',
    fontSize: 13,
    fontWeight: '600',
  },
  artworkWrap: {
    position: 'relative',
  },
  activeArtworkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 11,
    justifyContent: 'center',
  },
  title: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  activeTitle: {
    color: colors.accent,
    fontWeight: '700',
  },
  artist: {
    color: '#A2A2A2',
    fontSize: 13,
    marginTop: 3,
  },
  duration: {
    color: '#6B7280',
    fontSize: 12,
    fontFamily: 'monospace',
    marginLeft: 8,
    marginRight: 2,
  },
  play: {
    marginHorizontal: 8,
  },
  more: {
    width: 38,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  pressed: {
    opacity: 0.7,
  },
});
