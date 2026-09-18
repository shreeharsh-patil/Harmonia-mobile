import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { importSpotifyPlaylist } from '@/src/lib/api';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { colors } from '@/src/theme';

export default function ImportPlaylistScreen() {
  const { token } = useAuth();
  const { refresh } = useLibrary();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (navigationTimerRef.current) {
        clearTimeout(navigationTimerRef.current);
        navigationTimerRef.current = null;
      }
    };
  }, []);

  const submit = async () => {
    if (!token) {
      router.push('/login');
      return;
    }
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await importSpotifyPlaylist(token, url.trim());
      setStatus(result.message || 'Playlist imported');
      await refresh();
      if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
      navigationTimerRef.current = setTimeout(() => {
        navigationTimerRef.current = null;
        router.back();
      }, 700);
    } catch (cause: any) {
      setError(cause?.message || 'Unable to import this playlist');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View>
          <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={23} color={colors.textStrong} />
          </Pressable>
          <View style={styles.headerHero}>
            <Text style={styles.kicker}>SPOTIFY IMPORT</Text>
            <Text style={styles.title}>Bring a playlist to Harmonia.</Text>
            <Text style={styles.subtitle}>
              Paste a public Spotify playlist link. Harmonia matches each track to its playable catalog source and keeps the original playlist order.
            </Text>
          </View>
        </View>

        <View style={styles.formCard}>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://open.spotify.com/playlist/..."
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
            onSubmitEditing={submit}
          />
          {!!status && (
            <View style={styles.statusBox}>
              <Ionicons name="checkmark-circle" size={16} color={colors.accentBright} />
              <Text style={styles.success}>{status}</Text>
            </View>
          )}
          {!!error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.error}>{error}</Text>
            </View>
          )}
          <Pressable
            disabled={busy || !url.trim()}
            onPress={submit}
            style={({ pressed }) => [
              styles.primary,
              (!url.trim() || busy) && styles.primaryDisabled,
              pressed && styles.pressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#061108" />
            ) : (
              <Text style={styles.primaryText}>Import playlist</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1, paddingHorizontal: 20, paddingBottom: 32, justifyContent: 'space-between' },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  headerHero: { marginTop: 24 },
  kicker: { color: colors.accentBright, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: colors.textStrong, fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -0.9, marginTop: 8 },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 10 },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 18,
    gap: 12,
  },
  input: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    color: colors.textStrong,
    paddingHorizontal: 16,
    fontSize: 14,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 12,
    padding: 12,
  },
  success: { color: colors.accentBright, fontSize: 13, fontWeight: '600', flex: 1 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 12,
    padding: 12,
  },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', flex: 1 },
  primary: {
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.accentBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: '#061108', fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
