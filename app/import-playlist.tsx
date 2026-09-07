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
import { SafeAreaView } from 'react-native-safe-area-context';
import { importSpotifyPlaylist } from '@/src/lib/api';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';

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
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View>
          <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
          <Text style={styles.kicker}>SPOTIFY IMPORT</Text>
          <Text style={styles.title}>Bring a playlist into Harmonia.</Text>
          <Text style={styles.subtitle}>Paste a public Spotify playlist link. Harmonia matches each track to its playable catalog source and keeps the original playlist order.</Text>
        </View>
        <View style={styles.form}>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://open.spotify.com/playlist/..."
            placeholderTextColor="#606060"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
            onSubmitEditing={submit}
          />
          {!!status && <Text style={styles.success}>{status}</Text>}
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable disabled={busy} onPress={submit} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            {busy ? <ActivityIndicator color="#050505" /> : <Text style={styles.primaryText}>Import playlist</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  screen: { flex: 1, paddingHorizontal: 24, paddingBottom: 32, justifyContent: 'space-between' },
  back: { width: 44, height: 44, justifyContent: 'center' },
  backText: { color: '#EEE', fontSize: 38 },
  kicker: { color: '#666', fontSize: 11, fontWeight: '800', letterSpacing: 1.8, marginTop: 28 },
  title: { color: '#FFF', fontSize: 34, lineHeight: 39, fontWeight: '850' as any, letterSpacing: -1.1, marginTop: 8 },
  subtitle: { color: '#858585', fontSize: 15, lineHeight: 22, marginTop: 12 },
  form: { gap: 12 },
  input: { minHeight: 56, borderRadius: 16, borderWidth: 1, borderColor: '#242424', backgroundColor: '#101010', color: '#FFF', paddingHorizontal: 17, fontSize: 14 },
  success: { color: '#84D7A0', fontSize: 13, lineHeight: 19 },
  error: { color: '#FF7979', fontSize: 13, lineHeight: 19 },
  primary: { height: 54, borderRadius: 16, backgroundColor: '#F2F2F2', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#050505', fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
