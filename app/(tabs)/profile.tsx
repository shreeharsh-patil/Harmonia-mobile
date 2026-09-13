import { Image } from 'expo-image';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_VERSION } from '@/src/config';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';

function localDayKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function ProfileScreen() {
  const { user, token, loading, signOut, refreshUser } = useAuth();
  const { playlists, likedSongs, likedAlbums, likedArtists, refreshing, refresh } = useLibrary();
  const { listeningStats } = usePlayer();

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color="#FFF" /></View></SafeAreaView>;
  }

  if (!token || !user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.guest}>
          <Text style={styles.kicker}>HARMONIA ACCOUNT</Text>
          <Text style={styles.guestTitle}>Keep your music in sync.</Text>
          <Text style={styles.body}>One account for your web player, phone library, liked songs and playlists.</Text>
          <Pressable onPress={() => router.push('/login')} style={styles.primary}>
            <Text style={styles.primaryText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void doRefresh()} tintColor="#FFF" />}
      >
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Profile</Text>
          <Pressable onPress={() => router.push('/settings')} style={styles.settingsButton} accessibilityLabel="Settings">
            <Ionicons name="settings-outline" size={20} color="#DADADA" />
          </Pressable>
        </View>

        <View style={styles.identity}>
          {user.image ? (
            <Image source={{ uri: user.image }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.initial}>{initial}</Text></View>
          )}
          <View style={styles.identityCopy}>
            <Text numberOfLines={1} style={styles.name}>{user.name}</Text>
            <Text numberOfLines={1} style={styles.email}>{user.email}</Text>
          </View>
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
            <Text style={styles.statLabel}>Today min</Text>
          </View>
        </View>

        <View style={styles.listeningSummary}>
          <View style={styles.listeningMetric}>
            <Text style={styles.listeningValue}>{weekMinutes}</Text>
            <Text style={styles.listeningLabel}>Minutes this week</Text>
          </View>
          <View style={styles.listeningMetric}>
            <Text style={styles.listeningValue}>{Math.round(listeningStats.totalSeconds / 60)}</Text>
            <Text style={styles.listeningLabel}>Minutes overall</Text>
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
          <Text style={styles.cardBody}>Changes to your liked songs and playlists are stored on your account and shared with the web player.</Text>
          <Pressable onPress={() => void doRefresh()} style={styles.secondary}>
            <Text style={styles.secondaryText}>Sync now</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={async () => {
            await signOut();
            router.replace('/(tabs)');
          }}
          style={styles.logout}
        >
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>

        <Text style={styles.version}>HARMONIA MOBILE • {APP_VERSION}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 165 },
  pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 25 },
  pageTitle: { color: '#FFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  settingsButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' },
  identity: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 76, height: 76, borderRadius: 26, backgroundColor: '#151515' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECECEC' },
  initial: { color: '#080808', fontSize: 30, fontWeight: '900' },
  identityCopy: { flex: 1, minWidth: 0, marginLeft: 16 },
  name: { color: '#F4F4F4', fontSize: 23, fontWeight: '800', letterSpacing: -0.5 },
  email: { color: '#777', fontSize: 13, marginTop: 5 },
  stats: { height: 90, flexDirection: 'row', alignItems: 'center', backgroundColor: '#101010', borderRadius: 19, marginTop: 26, borderWidth: StyleSheet.hairlineWidth, borderColor: '#242424' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: '#F2F2F2', fontSize: 23, fontWeight: '800' },
  statLabel: { color: '#6D6D6D', fontSize: 11, fontWeight: '600', marginTop: 4 },
  rule: { height: 42, width: StyleSheet.hairlineWidth, backgroundColor: '#2A2A2A' },
  listeningSummary: { flexDirection: 'row', gap: 8, marginTop: 12 },
  listeningMetric: { flex: 1, minHeight: 66, borderRadius: 14, backgroundColor: '#0F0F0F', borderWidth: StyleSheet.hairlineWidth, borderColor: '#222', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  listeningValue: { color: '#E8E8E8', fontSize: 17, fontWeight: '800' },
  listeningLabel: { color: '#616161', fontSize: 9, fontWeight: '650' as any, textAlign: 'center', marginTop: 4 },
  librarySummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
  librarySummaryText: { color: '#686868', fontSize: 11, fontWeight: '600' },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#444' },
  card: { backgroundColor: '#101010', borderRadius: 19, borderWidth: StyleSheet.hairlineWidth, borderColor: '#242424', padding: 18, marginTop: 16 },
  cardKicker: { color: '#5F5F5F', fontSize: 9, fontWeight: '800', letterSpacing: 1.6 },
  cardTitle: { color: '#EDEDED', fontSize: 18, fontWeight: '800', marginTop: 7 },
  cardBody: { color: '#747474', fontSize: 13, lineHeight: 20, marginTop: 7 },
  secondary: { alignSelf: 'flex-start', height: 38, borderRadius: 12, backgroundColor: '#1C1C1C', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', marginTop: 15 },
  secondaryText: { color: '#D6D6D6', fontSize: 12, fontWeight: '700' },
  logout: { height: 50, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: '#352020', backgroundColor: '#130D0D', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  logoutText: { color: '#E78787', fontSize: 14, fontWeight: '750' as any },
  version: { color: '#3F3F3F', fontSize: 9, fontWeight: '700', textAlign: 'center', letterSpacing: 1.2, marginTop: 24 },
  guest: { flex: 1, justifyContent: 'center', paddingHorizontal: 30, paddingBottom: 90 },
  kicker: { color: '#555', fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  guestTitle: { color: '#F4F4F4', fontSize: 30, lineHeight: 35, fontWeight: '800', letterSpacing: -0.9, marginTop: 8 },
  body: { color: '#777', fontSize: 15, lineHeight: 22, marginTop: 10 },
  primary: { height: 52, borderRadius: 16, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center', marginTop: 25 },
  primaryText: { color: '#080808', fontSize: 15, fontWeight: '800' },
});
