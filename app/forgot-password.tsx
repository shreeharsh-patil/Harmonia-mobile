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
import { requestPasswordReset } from '@/src/lib/api';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await requestPasswordReset(email.trim().toLowerCase());
      setMessage(result.message || 'Check your email for the reset link.');
    } catch (cause: any) {
      setError(cause?.message || 'Unable to send the reset email');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View>
          <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
          <Text style={styles.kicker}>ACCOUNT RECOVERY</Text>
          <Text style={styles.title}>Reset your password.</Text>
          <Text style={styles.subtitle}>We’ll send a secure reset link to your Harmonia email.</Text>
        </View>
        <View style={styles.form}>
          <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor="#666" autoCapitalize="none" keyboardType="email-address" autoComplete="email" style={styles.input} onSubmitEditing={submit} />
          {!!message && <Text style={styles.success}>{message}</Text>}
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable disabled={busy} onPress={submit} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            {busy ? <ActivityIndicator color="#050505" /> : <Text style={styles.primaryText}>Send reset link</Text>}
          </Pressable>
          <Pressable onPress={() => router.replace('/login')} style={styles.link}><Text style={styles.linkText}>Back to sign in</Text></Pressable>
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
  title: { color: '#FFF', fontSize: 36, lineHeight: 40, fontWeight: '850' as any, letterSpacing: -1.2, marginTop: 8 },
  subtitle: { color: '#858585', fontSize: 15, lineHeight: 22, marginTop: 12 },
  form: { gap: 12 },
  input: { height: 54, borderRadius: 16, borderWidth: 1, borderColor: '#242424', backgroundColor: '#101010', color: '#FFF', paddingHorizontal: 17, fontSize: 16 },
  success: { color: '#84D7A0', fontSize: 13, lineHeight: 19 },
  error: { color: '#FF7979', fontSize: 13 },
  primary: { height: 54, borderRadius: 16, backgroundColor: '#F2F2F2', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#050505', fontSize: 16, fontWeight: '800' },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: '#8F8F8F', fontSize: 13, fontWeight: '650' as any },
  pressed: { opacity: 0.72 },
});
