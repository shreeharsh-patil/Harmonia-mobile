import { useState } from 'react';
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
import { registerAccount } from '@/src/lib/api';

export default function SignupScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !email.trim() || password.length < 8 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await registerAccount(name.trim(), email.trim().toLowerCase(), password);
      if (result.requiresVerification) {
        router.replace({ pathname: '/verify-email', params: { email: email.trim().toLowerCase() } });
      } else {
        router.replace('/login');
      }
    } catch (cause: any) {
      setError(cause?.message || 'Unable to create your account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View>
          <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
          <Text style={styles.kicker}>HARMONIA ACCOUNT</Text>
          <Text style={styles.title}>Create your account.</Text>
          <Text style={styles.subtitle}>Keep your library, playlists, and liked songs in sync across Harmonia.</Text>
        </View>

        <View style={styles.form}>
          <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor="#666" autoComplete="name" style={styles.input} />
          <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor="#666" autoCapitalize="none" keyboardType="email-address" autoComplete="email" style={styles.input} />
          <TextInput value={password} onChangeText={setPassword} placeholder="Password · minimum 8 characters" placeholderTextColor="#666" secureTextEntry autoComplete="new-password" style={styles.input} onSubmitEditing={submit} />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable disabled={busy || password.length < 8} onPress={submit} style={({ pressed }) => [styles.primary, pressed && styles.pressed, (busy || password.length < 8) && styles.disabled]}>
            {busy ? <ActivityIndicator color="#050505" /> : <Text style={styles.primaryText}>Create account</Text>}
          </Pressable>
          <Pressable onPress={() => router.replace('/login')} style={styles.link}><Text style={styles.linkText}>Already have an account? Sign in</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  screen: { flex: 1, paddingHorizontal: 24, paddingBottom: 28, justifyContent: 'space-between' },
  back: { width: 44, height: 44, justifyContent: 'center', marginTop: 4 },
  backText: { color: '#EEE', fontSize: 38, lineHeight: 40 },
  kicker: { color: '#666', fontSize: 11, fontWeight: '800', letterSpacing: 1.8, marginTop: 28 },
  title: { color: '#FFF', fontSize: 36, lineHeight: 40, fontWeight: '850' as any, letterSpacing: -1.2, marginTop: 8 },
  subtitle: { color: '#858585', fontSize: 15, lineHeight: 22, marginTop: 12, maxWidth: 340 },
  form: { gap: 11 },
  input: { height: 54, borderRadius: 16, borderWidth: 1, borderColor: '#242424', backgroundColor: '#101010', color: '#FFF', paddingHorizontal: 17, fontSize: 16 },
  error: { color: '#FF7979', fontSize: 13, paddingHorizontal: 4 },
  primary: { height: 54, borderRadius: 16, backgroundColor: '#F2F2F2', alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  primaryText: { color: '#050505', fontSize: 16, fontWeight: '800' },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: '#8F8F8F', fontSize: 13, fontWeight: '650' as any },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
});
