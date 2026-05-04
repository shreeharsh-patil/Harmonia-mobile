import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ANDROID_BUILD_VERSION,
  APP_VERSION,
  RECENT_SEARCHES_KEY,
} from '@/src/config';
import type { StreamQuality } from '@/src/lib/api';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLocalMusic } from '@/src/providers/LocalMusicProvider';
import { useOffline } from '@/src/providers/OfflineProvider';
import { usePlayer, type SleepTimerMode } from '@/src/providers/PlayerProvider';

const QUALITY_OPTIONS: Array<{ value: StreamQuality; label: string }> = [
  { value: 'automatic', label: 'Automatic' },
  { value: 'data-saver', label: 'Data Saver' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'maximum', label: 'Maximum' },
];

const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const TIMER_OPTIONS: Array<{ value: SleepTimerMode; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' },
  { value: 'track', label: 'End of track' },
];

export default function SettingsScreen() {
  const { user, token, signOut } = useAuth();
  const { downloads, totalBytes, clearDownloads } = useOffline();
  const { songs: localSongs, loading: localLoading, scan: scanLocalMusic } = useLocalMusic();
  const {
    currentSong,
    playbackRate,
    streamQuality,
    sleepTimer,
    radioEnabled,
    history,
    setPlaybackRate,
    setStreamQuality,
    setSleepTimer,
    toggleRadio,
    clearHistory,
  } = usePlayer();

  const clearRecentSearches = async () => {
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
    Alert.alert('Recent searches cleared');
  };

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

  const signOutNow = async () => {
    await signOut();
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={23} color="#F2F2F2" />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section title="ACCOUNT">
          {token && user ? (
            <>
              <StaticRow icon="person-outline" title={user.name || 'Harmonia account'} detail={user.email} />
              <ActionRow icon="create-outline" title="Edit profile" detail="Update your name and profile picture" onPress={() => router.push('/edit-profile')} />
              <ActionRow icon="musical-notes-outline" title="Import Spotify playlist" detail="Match a public Spotify playlist into Harmonia" onPress={() => router.push('/import-playlist')} />
              <ActionRow icon="log-out-outline" title="Sign out" detail="Remove this account from the phone" destructive onPress={() => void signOutNow()} />
            </>
          ) : (
            <ActionRow icon="log-in-outline" title="Sign in" detail="Sync your Harmonia account" onPress={() => router.push('/login')} />
          )}
        </Section>

        <Section title="PLAYBACK">
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

          <SettingLabel title="Playback speed" detail="Applies immediately to the native player." />
          <ChoiceRow>
            {RATE_OPTIONS.map((rate) => (
              <Choice key={rate} label={`${rate}×`} active={playbackRate === rate} onPress={() => setPlaybackRate(rate)} />
            ))}
          </ChoiceRow>
          <ToggleRow
            icon="radio-outline"
            title="Harmonia Radio"
            detail="Continue with related songs when the queue ends"
            enabled={radioEnabled}
            onPress={toggleRadio}
          />
        </Section>

        <Section title="PLAYER">
          <SettingLabel title="Sleep timer" detail="Stops playback at the selected time or at the end of the track." />
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
              title="Playback diagnostics"
              detail="Open Now Playing → Tools → Advanced"
              onPress={() => router.push({ pathname: '/player', params: { panel: 'tools' } })}
            />
          )}
        </Section>

        <Section title="DOWNLOADS">
          <StaticRow
            icon="download-outline"
            title="Downloaded music"
            detail={`${downloads.length} track${downloads.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)}`}
          />
          <ActionRow
            icon="trash-outline"
            title="Remove all downloads"
            detail={downloads.length ? 'Delete offline audio stored by Harmonia' : 'No downloaded tracks'}
            destructive
            disabled={!downloads.length}
            onPress={confirmClearDownloads}
          />
        </Section>

        <Section title="LOCAL MUSIC">
          <StaticRow icon="musical-notes-outline" title="On-device library" detail={`${localSongs.length} track${localSongs.length === 1 ? '' : 's'} loaded`} />
          <ActionRow
            icon="scan-outline"
            title={localSongs.length ? 'Rescan music library' : 'Scan music library'}
            detail="Permission is requested only when you use this feature"
            disabled={localLoading}
            onPress={() => void scanLocalMusic()}
          />
        </Section>

        <Section title="DATA">
          <ActionRow
            icon="time-outline"
            title="Clear listening history"
            detail={history.length ? `${history.length} local history entries` : 'No local listening history'}
            disabled={!history.length}
            onPress={confirmClearHistory}
          />
          <ActionRow
            icon="search-outline"
            title="Clear recent searches"
            detail="Removes searches stored on this phone"
            onPress={() => void clearRecentSearches()}
          />
        </Section>

        <Section title="ABOUT">
          <StaticRow icon="information-circle-outline" title="Harmonia Mobile" detail={`Version ${APP_VERSION} · Android build ${ANDROID_BUILD_VERSION}`} />
          <ActionRow
            icon="logo-github"
            title="GitHub"
            detail="Open the Harmonia Mobile repository"
            onPress={() => void Linking.openURL('https://github.com/shreeharsh-patil/Harmonia-mobile')}
          />
        </Section>

        <Text style={styles.footer}>Native Expo player · Harmonia account and catalog backend</Text>
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
    <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceActive]}>
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ToggleRow({
  icon,
  title,
  detail,
  enabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.icon}><Ionicons name={icon} size={19} color="#A6A6A6" /></View>
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

function StaticRow({ icon, title, detail }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.icon}><Ionicons name={icon} size={19} color="#A6A6A6" /></View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function ActionRow({
  icon,
  title,
  detail,
  onPress,
  destructive = false,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}>
      <View style={styles.icon}><Ionicons name={icon} size={19} color={destructive ? '#D98282' : '#A6A6A6'} /></View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, destructive && styles.destructive]}>{title}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color="#4D4D4D" />
    </Pressable>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  header: { height: 62, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#F5F5F5', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  headerSpacer: { width: 42 },
  content: { paddingHorizontal: 18, paddingBottom: 80 },
  section: { marginTop: 22 },
  sectionTitle: { color: '#595959', fontSize: 9, fontWeight: '800', letterSpacing: 1.7, marginBottom: 8, paddingHorizontal: 4 },
  group: { borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, borderColor: '#242424', backgroundColor: '#0F0F0F', overflow: 'hidden' },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#202020' },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#171717', alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0, marginLeft: 11 },
  rowTitle: { color: '#E7E7E7', fontSize: 14, fontWeight: '700' },
  rowDetail: { color: '#666', fontSize: 11, lineHeight: 16, marginTop: 3 },
  destructive: { color: '#E28B8B' },
  toggleTrack: { width: 42, height: 24, borderRadius: 12, backgroundColor: '#292929', padding: 3, justifyContent: 'center' },
  toggleTrackOn: { backgroundColor: '#EDEDED' },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#777' },
  toggleThumbOn: { backgroundColor: '#080808', alignSelf: 'flex-end' },
  pressed: { opacity: 0.62 },
  disabled: { opacity: 0.42 },
  settingLabel: { paddingHorizontal: 14, paddingTop: 14 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 13, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#202020' },
  choice: { height: 34, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: '#292929', backgroundColor: '#141414', paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  choiceActive: { backgroundColor: '#EDEDED', borderColor: '#EDEDED' },
  choiceText: { color: '#8B8B8B', fontSize: 11, fontWeight: '700' },
  choiceTextActive: { color: '#090909' },
  footer: { color: '#3F3F3F', fontSize: 9, lineHeight: 15, textAlign: 'center', letterSpacing: 0.6, marginTop: 28 },
});
