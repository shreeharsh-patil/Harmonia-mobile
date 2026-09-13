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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';

export default function ProfileScreen() {
  const { user, token, loading, signOut, refreshUser } = useAuth();
  const { playlists, likedSongs, refreshing, refresh } = useLibrary();

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

  const doRefresh = async () => {
    await Promise.all([refreshUser().catch(() => {}), refresh()]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void doRefresh()} tintColor="#FFF" />}
      >
        <Text style={styles.pageTitle}>Profile</Text>

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

        <Text style={styles.version}>HARMONIA MOBILE • 0.2.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 165 },
  pageTitle: { color: '#FFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginBottom: 25 },
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
