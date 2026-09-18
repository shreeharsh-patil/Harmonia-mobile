import { Image } from 'expo-image';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTabContentBottomInset } from '@/src/components/MiniPlayer';
import { ProfileSkeleton } from '@/src/components/ProfileSkeleton';
import { APP_VERSION } from '@/src/config';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { useListeningStats, usePlayer } from '@/src/providers/PlayerProvider';
import { colors } from '@/src/theme';

function localDayKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, token, loading, signOut, refreshUser } = useAuth();
  const { playlists, likedSongs, likedAlbums, likedArtists, refreshing, refresh } = useLibrary();
  const { currentSong } = usePlayer();
  const { listeningStats } = useListeningStats();
  const contentBottomInset = getTabContentBottomInset(insets.bottom, Boolean(currentSong));

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ProfileSkeleton />
      </SafeAreaView>
    );
  }

  if (!token || !user) {
    return <Redirect href="/(tabs)/preferences" />;
  }

  const initial = (user.name || user.email || 'H').trim().charAt(0).toUpperCase();
  const dailyEntries = Object.entries(listeningStats.dailySeconds || {});
  const today = localDayKey();
  const weekKeys = new Set(Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    return localDayKey(date);
  }));
  const todayMinutes = Math.round((listeningStats.dailySeconds?.[today] || 0) / 60);
  const weekMinutes = Math.round(
    dailyEntries.reduce((sum, [key, seconds]) => sum + (weekKeys.has(key) ? Number(seconds || 0) : 0), 0) / 60
  );

  const doRefresh = async () => {
    await Promise.all([refreshUser().catch(() => {}), refresh()]);
  };

  const doSignOut = async () => {
    try {
      await signOut();
      router.replace('/(tabs)');
    } catch {
      Alert.alert(
        'Sign out incomplete',
        'Harmonia could not remove the saved session from this phone. Please try again.'
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: contentBottomInset }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void doRefresh()} tintColor="#FFF" />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Profile</Text>
          <Pressable
            onPress={() => router.push('/(tabs)/preferences')}
            style={styles.settingsButton}
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={21} color={colors.textStrong} />
          </Pressable>
        </View>

        <View style={styles.identity}>
          {user.image ? (
            <Image source={{ uri: user.image }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <Image source={require('../../assets/harmonia-icon.png')} style={[styles.avatar, styles.avatarFallback]} contentFit="contain" />
          )}
          <View style={styles.identityCopy}>
            <Text numberOfLines={1} style={styles.name}>{user.name}</Text>
            <Text numberOfLines={1} style={styles.email}>{user.email}</Text>
          </View>
          <Pressable
            onPress={() => router.push('/edit-profile')}
            style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
            accessibilityLabel="Edit profile"
          >
            <Ionicons name="pencil-outline" size={17} color={colors.textStrong} />
          </Pressable>
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{likedSongs.length}</Text>
            <Text style={styles.statLabel}>Liked songs</Text>
          </View>
          <View style={styles.rule} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{playlists.length}</Text>
            <Text style={styles.statLabel}>Playlists</Text>
          </View>
          <View style={styles.rule} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{todayMinutes}</Text>
            <Text style={styles.statLabel}>Min today</Text>
          </View>
        </View>

        <View style={styles.listeningSummary}>
          <View style={styles.listeningMetric}>
            <Text style={styles.listeningValue}>{weekMinutes}</Text>
            <Text style={styles.listeningLabel}>Minutes this week</Text>
          </View>
          <View style={styles.listeningMetric}>
            <Text style={styles.listeningValue}>{Math.round(listeningStats.totalSeconds / 60)}</Text>
            <Text style={styles.listeningLabel}>Total minutes</Text>
          </View>
          <View style={styles.listeningMetric}>
            <Text style={styles.listeningValue}>{listeningStats.playCount}</Text>
            <Text style={styles.listeningLabel}>Tracks started</Text>
          </View>
        </View>

        <View style={styles.librarySummary}>
          <Text style={styles.librarySummaryText}>{likedAlbums.length} saved albums</Text>
          <View style={styles.dot} />
          <Text style={styles.librarySummaryText}>{likedArtists.length} followed artists</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardKicker}>SYNC</Text>
          <Text style={styles.cardTitle}>Connected to Harmonia</Text>
          <Text style={styles.cardBody}>Your liked songs, albums, artists and playlists are safely synced across your Harmonia devices.</Text>
          <Pressable
            onPress={() => void doRefresh()}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          >
            <Ionicons name="sync-outline" size={15} color={colors.textStrong} />
            <Text style={styles.secondaryText}>Sync now</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => void doSignOut()}
          style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
        >
          <Ionicons name="log-out-outline" size={17} color={colors.danger} />
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>

        <Text style={styles.version}>HARMONIA MOBILE • {APP_VERSION}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingTop: 0 },
  pageHeader: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: -16,
    marginBottom: 20,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: 'rgba(7,7,7,0.96)',
  },
  pageTitle: { color: colors.textStrong, fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: -0.8 },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.surface },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  initial: { color: colors.accentBright, fontSize: 30, fontWeight: '900' },
  identityCopy: { flex: 1, minWidth: 0, marginLeft: 16 },
  editButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  name: { color: colors.textStrong, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  email: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  stats: {
    height: 88,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginTop: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: colors.textStrong, fontSize: 22, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 4 },
  rule: { height: 38, width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  listeningSummary: { flexDirection: 'row', gap: 8, marginTop: 12 },
  listeningMetric: {
    flex: 1,
    minHeight: 66,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  listeningValue: { color: colors.textStrong, fontSize: 17, fontWeight: '800' },
  listeningLabel: { color: colors.textFaint, fontSize: 10, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  librarySummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  librarySummaryText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textFaint },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 18,
    marginTop: 16,
  },
  cardKicker: { color: colors.accentBright, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  cardTitle: { color: colors.textStrong, fontSize: 18, fontWeight: '800', marginTop: 6 },
  cardBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  secondary: {
    alignSelf: 'flex-start',
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  secondaryText: { color: colors.textStrong, fontSize: 12, fontWeight: '700' },
  logout: {
    height: 50,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239,68,68,0.25)',
    backgroundColor: 'rgba(239,68,68,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
  logoutText: { color: colors.danger, fontSize: 14, fontWeight: '800' },
  version: { color: colors.textFaint, fontSize: 10, fontWeight: '700', textAlign: 'center', letterSpacing: 1.2, marginTop: 24 },
  guest: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  kicker: { color: colors.accentBright, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  guestTitle: { color: colors.textStrong, fontSize: 30, lineHeight: 35, fontWeight: '900', letterSpacing: -0.9, marginTop: 8 },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginTop: 10 },
  primary: {
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.accentBright,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  primaryText: { color: '#061108', fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
