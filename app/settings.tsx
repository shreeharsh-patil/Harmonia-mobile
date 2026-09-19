import { useState } from 'react';
import { Image } from 'expo-image';
import {
  Alert,
  Linking,
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
import type { StreamQuality } from '@/src/lib/api';
import { checkForAppUpdate } from '@/src/lib/updates';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { useOffline } from '@/src/providers/OfflineProvider';
import { useListeningStats, usePlaybackHistory, usePlayer, type SleepTimerMode } from '@/src/providers/PlayerProvider';
import { usePreferences } from '@/src/providers/PreferencesProvider';
import { colors } from '@/src/theme';

const QUALITY_OPTIONS: { value: StreamQuality; label: string }[] = [
  { value: 'automatic', label: 'Auto' },
  { value: 'data-saver', label: 'Saver' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'maximum', label: 'Max' },
];

const RATE_OPTIONS = [0.75, 1, 1.25, 1.5, 2];
const TIMER_OPTIONS: { value: SleepTimerMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 45, label: '45m' },
  { value: 60, label: '60m' },
  { value: 'track', label: 'Track' },
];

function localDayKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1000) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

export default function SettingsScreen() {
  const { user, token, signOut, refreshUser } = useAuth();
  const { playlists, likedSongs, refreshing, refresh } = useLibrary();
  const {
    playbackRate,
    streamQuality,
    sleepTimer,
    setPlaybackRate,
    setStreamQuality,
    setSleepTimer,
  } = usePlayer();
  const { listeningStats } = useListeningStats();
  const { history, clearHistory } = usePlaybackHistory();
  const { downloads, totalBytes, clearDownloads } = useOffline();
  const {
    batterySaver,
    wifiOnlyDownloads,
    musicVideosEnabled,
    setBatterySaver,
    setWifiOnlyDownloads,
    setMusicVideosEnabled,
  } = usePreferences();
  const [checkingUpdate, setCheckingUpdate] = useState(false);

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
    Alert.alert('Sign out?', 'Are you sure you want to sign out of Harmonia?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            router.replace('/(tabs)');
          } catch {
            Alert.alert('Sign out incomplete', 'Could not remove saved session. Please try again.');
          }
        },
      },
    ]);
  };

  const confirmClearDownloads = () => {
    if (!downloads.length) return;
    Alert.alert(
      'Remove all downloads?',
      'Downloaded audio files will be removed from this phone. Your playlists and library will remain intact.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove all', style: 'destructive', onPress: () => void clearDownloads() },
      ]
    );
  };

  const confirmClearHistory = () => {
    if (!history.length) return;
    Alert.alert(
      'Clear listening history?',
      'This clears your local listening history on this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => void clearHistory() },
      ]
    );
  };

  const clearArtworkCache = async () => {
    try {
      await Promise.all([Image.clearMemoryCache(), Image.clearDiskCache()]);
      Alert.alert('Cache cleared', 'Artwork cache has been cleared. Images will reload as needed.');
    } catch {
      Alert.alert('Cache clear failed', 'Could not clear cached images.');
    }
  };

  const checkUpdates = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      const result = await checkForAppUpdate();
      if (result.updateAvailable && result.latestVersion) {
        Alert.alert(
          'Update available',
          `Harmonia ${result.latestVersion} is available. You are using ${result.currentVersion}.`,
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Open release', onPress: () => void Linking.openURL(result.releaseUrl) },
          ]
        );
      } else if (result.latestVersion) {
        Alert.alert('Harmonia is up to date', `Version ${result.currentVersion} is the latest release.`);
      } else {
        Alert.alert('Up to date', 'No new release is available.');
      }
    } catch {
      Alert.alert('Update check failed', 'Check your connection and try again.');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const initial = (user?.name || user?.email || 'H').trim().charAt(0).toUpperCase();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={23} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.title}>Profile & Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void doRefresh()} tintColor="#FFF" />}
        showsVerticalScrollIndicator={false}
      >
        {token && user ? (
          <View style={styles.identity}>
            {user.image ? (
              <Image source={{ uri: user.image }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.initial}>{initial}</Text>
              </View>
            )}
            <View style={styles.identityCopy}>
              <Text numberOfLines={1} style={styles.name}>{user.name || 'Harmonia User'}</Text>
              <Text numberOfLines={1} style={styles.email}>{user.email}</Text>
              <View style={styles.badgeRow}>
                <View style={styles.badge}>
                  <Ionicons name="checkmark-circle" size={12} color={colors.accent} />
                  <Text style={styles.badgeText}>Harmonia Account</Text>
                </View>
              </View>
            </View>
            <Pressable
              onPress={() => router.push('/edit-profile')}
              style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
              accessibilityLabel="Edit profile"
            >
              <Ionicons name="pencil" size={16} color={colors.textStrong} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.guestCard}>
            <Image source={require('../assets/harmonia-icon.png')} style={[styles.avatar, styles.avatarFallback]} contentFit="contain" />
            <View style={styles.guestCopy}>
              <Text style={styles.guestTitle}>Harmonia Guest</Text>
              <Text style={styles.guestSubtitle}>Sign in to sync your playlists & liked songs</Text>
            </View>
            <Pressable
              onPress={() => router.push('/login')}
              style={({ pressed }) => [styles.signInButton, pressed && styles.pressed]}
            >
              <Text style={styles.signInButtonText}>Sign In</Text>
            </Pressable>
          </View>
        )}

        {/* Stats Section */}
        <View style={styles.stats}>
          <Pressable onPress={() => router.push('/(tabs)/library')} style={styles.stat}>
            <Text style={styles.statValue}>{likedSongs.length}</Text>
            <Text style={styles.statLabel}>Liked songs</Text>
          </Pressable>
          <View style={styles.rule} />
          <Pressable onPress={() => router.push('/(tabs)/library')} style={styles.stat}>
            <Text style={styles.statValue}>{playlists.length}</Text>
            <Text style={styles.statLabel}>Playlists</Text>
          </Pressable>
          <View style={styles.rule} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{todayMinutes}</Text>
            <Text style={styles.statLabel}>Min today</Text>
          </View>
        </View>

        {/* Listening Overview */}
        <View style={styles.listeningSummary}>
          <View style={styles.listeningMetric}>
            <Text style={styles.listeningValue}>{weekMinutes}</Text>
            <Text style={styles.listeningLabel}>Min this week</Text>
          </View>
          <View style={styles.listeningMetric}>
            <Text style={styles.listeningValue}>{Math.round(listeningStats.totalSeconds / 60)}</Text>
            <Text style={styles.listeningLabel}>Total minutes</Text>
          </View>
          <View style={styles.listeningMetric}>
            <Text style={styles.listeningValue}>{listeningStats.playCount}</Text>
            <Text style={styles.listeningLabel}>Tracks played</Text>
          </View>
        </View>

        {/* Preferences & Settings */}
        <Section title="AUDIO & PLAYBACK">
          <SettingLabel title="Audio Quality" detail="Streaming resolution for playback" />
          <ChoiceRow>
            {QUALITY_OPTIONS.map((item) => (
              <Choice
                key={item.value}
                label={item.label}
                active={streamQuality === item.value}
                onPress={() => setStreamQuality(item.value)}
              />
            ))}
          </ChoiceRow>

          <SettingLabel title="Playback Speed" detail="Audio playback rate" />
          <ChoiceRow>
            {RATE_OPTIONS.map((rate) => (
              <Choice
                key={rate}
                label={`${rate}×`}
                active={playbackRate === rate}
                onPress={() => setPlaybackRate(rate)}
              />
            ))}
          </ChoiceRow>

          <ToggleRow
            icon="videocam-outline"
            iconBg="rgba(239,68,68,0.15)"
            iconColor="#F87171"
            title="Enable music videos"
            detail="Watch matching music videos in player"
            enabled={musicVideosEnabled}
            onPress={() => setMusicVideosEnabled(!musicVideosEnabled)}
          />

          <SettingLabel title="Sleep Timer" detail="Auto stop playback" />
          <ChoiceRow>
            {TIMER_OPTIONS.map((item) => (
              <Choice
                key={String(item.value)}
                label={item.label}
                active={sleepTimer === item.value}
                onPress={() => setSleepTimer(item.value)}
              />
            ))}
          </ChoiceRow>
        </Section>

        <Section title="DATA & BATTERY">
          <ToggleRow
            icon="download-outline"
            iconBg="rgba(168,85,247,0.15)"
            iconColor="#C084FC"
            title="Wi-Fi-only downloads"
            detail="Block downloads on cellular data"
            enabled={wifiOnlyDownloads}
            onPress={() => setWifiOnlyDownloads(!wifiOnlyDownloads)}
          />
          <ToggleRow
            icon="leaf-outline"
            iconBg="rgba(16,185,129,0.15)"
            iconColor="#34D399"
            title="Battery saver"
            detail="Reduces data & background motion"
            enabled={batterySaver}
            onPress={() => setBatterySaver(!batterySaver)}
          />
        </Section>

        <Section title="STORAGE & CACHE">
          <ActionRow
            icon="cloud-download-outline"
            iconBg="rgba(16,185,129,0.15)"
            iconColor="#34D399"
            title="Offline Downloads"
            detail={`${downloads.length} tracks · ${formatBytes(totalBytes)}`}
            destructive={downloads.length > 0}
            disabled={!downloads.length}
            onPress={confirmClearDownloads}
          />
          <ActionRow
            icon="images-outline"
            iconBg="rgba(236,72,153,0.15)"
            iconColor="#F472B6"
            title="Clear Artwork Cache"
            detail="Free image storage space"
            onPress={() => void clearArtworkCache()}
          />
          <ActionRow
            icon="time-outline"
            iconBg="rgba(168,85,247,0.15)"
            iconColor="#C084FC"
            title="Clear Listening History"
            detail={history.length ? `${history.length} history items` : 'No history yet'}
            disabled={!history.length}
            onPress={confirmClearHistory}
          />
        </Section>

        <Section title="APP & UPDATES">
          <ActionRow
            icon="sync-outline"
            iconBg="rgba(59,130,246,0.15)"
            iconColor="#60A5FA"
            title="Sync Library"
            detail="Refresh playlists & account data"
            onPress={() => void doRefresh()}
          />
          <ActionRow
            icon="cloud-upload-outline"
            iconBg="rgba(16,185,129,0.15)"
            iconColor="#34D399"
            title="Check for Updates"
            detail={checkingUpdate ? 'Checking…' : `Harmonia Mobile v${APP_VERSION}`}
            disabled={checkingUpdate}
            onPress={() => void checkUpdates()}
          />
        </Section>

        {token && user && (
          <Pressable
            onPress={() => void doSignOut()}
            style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
          >
            <Ionicons name="log-out-outline" size={17} color={colors.danger} />
            <Text style={styles.logoutText}>Sign out</Text>
          </Pressable>
        )}

        <Text style={styles.version}>HARMONIA MOBILE • v{APP_VERSION}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function SettingLabel({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.settingLabel}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowDetail}>{detail}</Text>
    </View>
  );
}

function ChoiceRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.choiceRow}>{children}</View>;
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        active && styles.choiceActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ToggleRow({
  icon,
  iconBg,
  iconColor,
  title,
  detail,
  enabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg?: string;
  iconColor?: string;
  title: string;
  detail: string;
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.icon, iconBg ? { backgroundColor: iconBg } : null]}>
        <Ionicons name={icon} size={18} color={iconColor || colors.accentBright} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <View style={[styles.toggleTrack, enabled && styles.toggleTrackOn]}>
        <View style={[styles.toggleThumb, enabled && styles.toggleThumbOn]} />
      </View>
    </Pressable>
  );
}

function ActionRow({
  icon,
  iconBg,
  iconColor,
  title,
  detail,
  destructive = false,
  disabled = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg?: string;
  iconColor?: string;
  title: string;
  detail: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <View style={[styles.icon, iconBg ? { backgroundColor: iconBg } : null]}>
        <Ionicons name={icon} size={18} color={destructive ? colors.danger : iconColor || colors.accentBright} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, destructive && styles.rowTitleDestructive]}>{title}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.textStrong, fontSize: 18, fontWeight: '800' },
  headerSpacer: { width: 38 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  avatar: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.surfaceHover },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  initial: { color: colors.accentBright, fontSize: 26, fontWeight: '900' },
  identityCopy: { flex: 1, minWidth: 0, marginLeft: 14 },
  name: { color: colors.textStrong, fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
  email: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  badgeRow: { flexDirection: 'row', marginTop: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: { color: colors.accentBright, fontSize: 11, fontWeight: '700' },
  editButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  guestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 14,
  },
  guestCopy: { flex: 1, minWidth: 0 },
  guestTitle: { color: colors.textStrong, fontSize: 17, fontWeight: '800' },
  guestSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  signInButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
  },
  signInButtonText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  stats: {
    height: 80,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginTop: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: colors.textStrong, fontSize: 20, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 3 },
  rule: { height: 34, width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  listeningSummary: { flexDirection: 'row', gap: 8, marginTop: 8 },
  listeningMetric: {
    flex: 1,
    minHeight: 60,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  listeningValue: { color: colors.textStrong, fontSize: 16, fontWeight: '800' },
  listeningLabel: { color: colors.textFaint, fontSize: 10, fontWeight: '600', textAlign: 'center', marginTop: 3 },
  section: { marginTop: 22 },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginLeft: 4,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.textStrong, fontSize: 14, fontWeight: '700' },
  rowTitleDestructive: { color: colors.danger },
  rowDetail: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  settingLabel: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  choice: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceActive: {
    backgroundColor: colors.accent,
  },
  choiceText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  choiceTextActive: { color: '#FFF' },
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.15)',
    padding: 2,
    justifyContent: 'center',
  },
  toggleTrackOn: { backgroundColor: colors.accent },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFF',
  },
  toggleThumbOn: { alignSelf: 'flex-end' },
  disabled: { opacity: 0.4 },
  logout: {
    height: 48,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239,68,68,0.25)',
    backgroundColor: 'rgba(239,68,68,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 22,
  },
  logoutText: { color: colors.danger, fontSize: 14, fontWeight: '800' },
  version: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 1.2,
    marginTop: 20,
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
