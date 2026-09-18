import { useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ANDROID_BUILD_VERSION,
  APP_VERSION,
} from '@/src/config';
import type { StreamQuality } from '@/src/lib/api';
import { checkForAppUpdate } from '@/src/lib/updates';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLocalMusic } from '@/src/providers/LocalMusicProvider';
import { useOffline } from '@/src/providers/OfflineProvider';
import { usePlaybackHistory, usePlayer, type SleepTimerMode } from '@/src/providers/PlayerProvider';
import { usePreferences } from '@/src/providers/PreferencesProvider';
import { colors } from '@/src/theme';

const QUALITY_OPTIONS: { value: StreamQuality; label: string }[] = [
  { value: 'automatic', label: 'Auto' },
  { value: 'data-saver', label: 'Data Saver' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'maximum', label: 'Max' },
];

const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const TIMER_OPTIONS: { value: SleepTimerMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 45, label: '45m' },
  { value: 60, label: '60m' },
  { value: 'track', label: 'End of track' },
];

export default function SettingsScreen() {
  const { user, token, signOut } = useAuth();
  const {
    networkAwareQuality,
    wifiQuality,
    cellularQuality,
    batterySaver,
    wifiOnlyDownloads,
    networkType,
    setNetworkAwareQuality,
    setWifiQuality,
    setCellularQuality,
    setBatterySaver,
    setWifiOnlyDownloads,
  } = usePreferences();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const { downloads, totalBytes, clearDownloads } = useOffline();
  const { songs: localSongs, loading: localLoading, scan: scanLocalMusic } = useLocalMusic();
  const {
    currentSong,
    playbackRate,
    streamQuality,
    sleepTimer,
    radioEnabled,
    adaptivePipelineEnabled,
    adaptivePipelineStatus,
    setPlaybackRate,
    setStreamQuality,
    setSleepTimer,
    toggleRadio,
    toggleAdaptivePipeline,
  } = usePlayer();
  const { history, clearHistory } = usePlaybackHistory();

  const confirmClearDownloads = () => {
    if (!downloads.length) return;
    Alert.alert(
      'Remove all downloads?',
      'Downloaded audio will be deleted from this phone. Your Harmonia library will not be changed.',
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
      'This clears local listening history on this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => void clearHistory() },
      ]
    );
  };

  const clearArtworkCache = async () => {
    try {
      await Promise.all([
        Image.clearMemoryCache(),
        Image.clearDiskCache(),
      ]);
      Alert.alert('Artwork cache cleared', 'Cached artwork was removed. Images will reload as needed.');
    } catch {
      Alert.alert('Could not clear cache', 'Harmonia could not clear the image cache on this device.');
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
        Alert.alert('No published release yet', 'No GitHub release is available to compare with this build.');
      }
    } catch {
      Alert.alert('Update check failed', 'Check your connection and try again.');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const signOutNow = async () => {
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

  const initial = (user?.name || user?.email || 'H').trim().charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={23} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {token && user ? (
          <Pressable
            onPress={() => router.push('/(tabs)/profile')}
            style={({ pressed }) => [styles.profileHero, pressed && styles.pressed]}
          >
            {user.image ? (
              <Image source={{ uri: user.image }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.initialText}>{initial}</Text>
              </View>
            )}
            <View style={styles.profileHeroCopy}>
              <Text numberOfLines={1} style={styles.userName}>{user.name || 'Harmonia User'}</Text>
              <Text numberOfLines={1} style={styles.userEmail}>{user.email}</Text>
              <View style={styles.badgeRow}>
                <View style={styles.profileBadge}>
                  <Text style={styles.profileBadgeText}>Harmonia Account</Text>
                </View>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={19} color={colors.textFaint} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push('/login')}
            style={({ pressed }) => [styles.profileHero, pressed && styles.pressed]}
          >
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Ionicons name="person-outline" size={24} color={colors.textFaint} />
            </View>
            <View style={styles.profileHeroCopy}>
              <Text style={styles.userName}>Guest User</Text>
              <Text style={styles.userEmail}>Sign in to sync library and playlists</Text>
            </View>
            <View style={styles.signInPill}>
              <Text style={styles.signInPillText}>Sign in</Text>
            </View>
          </Pressable>
        )}

        <Section title="ACCOUNT">
          {token && user ? (
            <>
              <ActionRow
                icon="create-outline"
                iconBg="rgba(59,130,246,0.15)"
                iconColor="#60A5FA"
                title="Edit profile"
                detail="Update display name and avatar photo"
                onPress={() => router.push('/edit-profile')}
              />
              <ActionRow
                icon="musical-notes-outline"
                iconBg="rgba(16,185,129,0.15)"
                iconColor="#34D399"
                title="Import Spotify playlist"
                detail="Match a public Spotify playlist to Harmonia"
                onPress={() => router.push('/import-playlist')}
              />
              <ActionRow
                icon="log-out-outline"
                iconBg="rgba(239,68,68,0.15)"
                iconColor="#F87171"
                title="Sign out"
                detail="Remove this session from this device"
                destructive
                onPress={() => void signOutNow()}
              />
            </>
          ) : (
            <ActionRow
              icon="log-in-outline"
              iconBg="rgba(16,185,129,0.15)"
              iconColor="#34D399"
              title="Sign in"
              detail="Sync your Harmonia account"
              onPress={() => router.push('/login')}
            />
          )}
        </Section>

        <Section title="PLAYBACK & QUALITY">
          <SettingLabel title="Audio quality" detail="Used when Harmonia resolves the next playable stream." />
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

          <SettingLabel title="Playback speed" detail="Applies immediately to native player playback." />
          <ChoiceRow>
            {RATE_OPTIONS.map((rate) => (
              <Choice key={rate} label={`${rate}×`} active={playbackRate === rate} onPress={() => setPlaybackRate(rate)} />
            ))}
          </ChoiceRow>

          <ToggleRow
            icon="radio-outline"
            iconBg="rgba(16,185,129,0.15)"
            iconColor="#34D399"
            title="Harmonia Radio"
            detail="Continue with related songs when the queue ends"
            enabled={radioEnabled}
            onPress={toggleRadio}
          />
          <ToggleRow
            icon="flash-outline"
            iconBg="rgba(245,158,11,0.15)"
            iconColor="#FBBF24"
            title="Instant stream upgrade"
            detail={adaptivePipelineEnabled
              ? `Fast start → background quality promotion · ${adaptivePipelineStatus}`
              : 'Resolve only the final selected quality'}
            enabled={adaptivePipelineEnabled}
            onPress={toggleAdaptivePipeline}
          />
        </Section>

        <Section title="NETWORK & POWER">
          <ToggleRow
            icon="wifi-outline"
            iconBg="rgba(59,130,246,0.15)"
            iconColor="#60A5FA"
            title="Network-aware quality"
            detail={`Use separate quality profiles · current: ${String(networkType || 'unknown').toLowerCase()}`}
            enabled={networkAwareQuality}
            onPress={() => setNetworkAwareQuality(!networkAwareQuality)}
          />
          <SettingLabel title="Wi-Fi quality" detail="Used on Wi-Fi and Ethernet connections." />
          <ChoiceRow>
            {QUALITY_OPTIONS.map((item) => (
              <Choice
                key={`wifi-${item.value}`}
                label={item.label}
                active={wifiQuality === item.value}
                onPress={() => setWifiQuality(item.value)}
              />
            ))}
          </ChoiceRow>
          <SettingLabel title="Mobile data quality" detail="Keeps cellular streaming under control." />
          <ChoiceRow>
            {QUALITY_OPTIONS.map((item) => (
              <Choice
                key={`cell-${item.value}`}
                label={item.label}
                active={cellularQuality === item.value}
                onPress={() => setCellularQuality(item.value)}
              />
            ))}
          </ChoiceRow>
          <ToggleRow
            icon="download-outline"
            iconBg="rgba(168,85,247,0.15)"
            iconColor="#C084FC"
            title="Wi-Fi-only downloads"
            detail="Block offline downloads on cellular data"
            enabled={wifiOnlyDownloads}
            onPress={() => setWifiOnlyDownloads(!wifiOnlyDownloads)}
          />
          <ToggleRow
            icon="leaf-outline"
            iconBg="rgba(16,185,129,0.15)"
            iconColor="#34D399"
            title="Battery saver"
            detail="Caps streams to Data Saver, disables Canvas and skips next-track preloading"
            enabled={batterySaver}
            onPress={() => setBatterySaver(!batterySaver)}
          />
        </Section>

        <Section title="PLAYER">
          <SettingLabel title="Sleep timer" detail="Stops playback at selected duration or track completion." />
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
          {currentSong && (
            <ActionRow
              icon="analytics-outline"
              iconBg="rgba(99,102,241,0.15)"
              iconColor="#818CF8"
              title="Playback diagnostics"
              detail="Open Now Playing → Tools → Advanced"
              onPress={() => router.push({ pathname: '/player', params: { panel: 'tools' } })}
            />
          )}
        </Section>

        <Section title="DOWNLOADS">
          <StaticRow
            icon="cloud-download-outline"
            iconBg="rgba(16,185,129,0.15)"
            iconColor="#34D399"
            title="Downloaded music"
            detail={`${downloads.length} track${downloads.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)}`}
          />
          <ActionRow
            icon="trash-outline"
            iconBg="rgba(239,68,68,0.15)"
            iconColor="#F87171"
            title="Remove all downloads"
            detail={downloads.length ? 'Delete offline audio stored by Harmonia' : 'No downloaded tracks'}
            destructive
            disabled={!downloads.length}
            onPress={confirmClearDownloads}
          />
        </Section>

        <Section title="LOCAL MUSIC">
          <StaticRow
            icon="folder-outline"
            iconBg="rgba(245,158,11,0.15)"
            iconColor="#FBBF24"
            title="On-device library"
            detail={`${localSongs.length} track${localSongs.length === 1 ? '' : 's'} loaded`}
          />
          <ActionRow
            icon="scan-outline"
            iconBg="rgba(59,130,246,0.15)"
            iconColor="#60A5FA"
            title={localSongs.length ? 'Rescan music library' : 'Scan music library'}
            detail="Permission is requested only when you use this feature"
            disabled={localLoading}
            onPress={() => void scanLocalMusic()}
          />
        </Section>

        <Section title="DATA & STORAGE">
          <ActionRow
            icon="time-outline"
            iconBg="rgba(168,85,247,0.15)"
            iconColor="#C084FC"
            title="Clear listening history"
            detail={history.length ? `${history.length} local history entries` : 'No local listening history'}
            disabled={!history.length}
            onPress={confirmClearHistory}
          />
          <ActionRow
            icon="images-outline"
            iconBg="rgba(236,72,153,0.15)"
            iconColor="#F472B6"
            title="Clear artwork cache"
            detail="Free cached image storage without touching downloads"
            onPress={() => void clearArtworkCache()}
          />
        </Section>

        <Section title="ABOUT HARMONIA">
          <StaticRow
            icon="information-circle-outline"
            iconBg="rgba(16,185,129,0.15)"
            iconColor="#34D399"
            title="Harmonia Mobile"
            detail={`Version ${APP_VERSION} · Android build ${ANDROID_BUILD_VERSION}`}
          />
          <ActionRow
            icon="cloud-download-outline"
            iconBg="rgba(59,130,246,0.15)"
            iconColor="#60A5FA"
            title="Check for updates"
            detail={checkingUpdate ? 'Checking for updates…' : 'Compare this build with latest published release'}
            disabled={checkingUpdate}
            onPress={() => void checkUpdates()}
          />
          <ActionRow
            icon="logo-github"
            iconBg="rgba(255,255,255,0.08)"
            iconColor="#E4E4E7"
            title="GitHub Repository"
            detail="Open the Harmonia Mobile source repository"
            onPress={() => void Linking.openURL('https://github.com/shreeharsh-patil/Harmonia-mobile')}
          />
        </Section>

        <Text style={styles.footer}>HARMONIA MOBILE • UNINTERRUPTED LISTENING</Text>
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

function StaticRow({
  icon,
  iconBg,
  iconColor,
  title,
  detail,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg?: string;
  iconColor?: string;
  title: string;
  detail: string;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.icon, iconBg ? { backgroundColor: iconBg } : null]}>
        <Ionicons name={icon} size={18} color={iconColor || colors.textMuted} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function ActionRow({
  icon,
  iconBg,
  iconColor,
  title,
  detail,
  onPress,
  destructive = false,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg?: string;
  iconColor?: string;
  title: string;
  detail: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.icon, iconBg ? { backgroundColor: iconBg } : null]}>
        <Ionicons name={icon} size={18} color={destructive ? colors.danger : (iconColor || colors.textMuted)} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, destructive && styles.destructive]}>{title}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
    </Pressable>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 60,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.textStrong, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  headerSpacer: { width: 42 },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  profileHero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#18181B' },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  initialText: { color: colors.accentBright, fontSize: 22, fontWeight: '900' },
  profileHeroCopy: { flex: 1, minWidth: 0, marginLeft: 14 },
  userName: { color: colors.textStrong, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  userEmail: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  badgeRow: { flexDirection: 'row', marginTop: 6 },
  profileBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(16,185,129,0.25)',
  },
  profileBadgeText: { color: colors.accentBright, fontSize: 10, fontWeight: '700' },
  signInPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: colors.accentBright,
  },
  signInPillText: { color: '#061108', fontSize: 12, fontWeight: '800' },
  section: { marginTop: 24 },
  sectionTitle: {
    color: colors.textFaint,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  group: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  rowTitle: { color: colors.textStrong, fontSize: 14, fontWeight: '700' },
  rowDetail: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  destructive: { color: colors.danger },
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.14)',
    padding: 3,
    justifyContent: 'center',
  },
  toggleTrackOn: { backgroundColor: colors.accentBright },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#888' },
  toggleThumbOn: { backgroundColor: '#061108', alignSelf: 'flex-end' },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.38 },
  settingLabel: { paddingHorizontal: 14, paddingTop: 14 },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  choice: {
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceActive: {
    backgroundColor: colors.accentBright,
    borderColor: colors.accentBright,
  },
  choiceText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  choiceTextActive: { color: '#061108', fontWeight: '800' },
  footer: {
    color: colors.textFaint,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
    letterSpacing: 1.2,
    marginTop: 32,
  },
});
