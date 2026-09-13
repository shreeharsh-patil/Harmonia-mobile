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
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { resetPassword } from '@/src/lib/api';

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = String(params.token || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!token || password.length < 8 || password !== confirm || busy) return;
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      router.replace('/login');
    } catch (cause: any) {
      setError(cause?.message || 'Unable to reset your password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View>
          <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
          <Text style={styles.kicker}>NEW PASSWORD</Text>
          <Text style={styles.title}>Choose a new password.</Text>
          {!token && <Text style={styles.error}>This reset link is missing its token. Open the link from your reset email again.</Text>}
        </View>
        <View style={styles.form}>
          <TextInput value={password} onChangeText={setPassword} placeholder="New password" placeholderTextColor="#666" secureTextEntry autoComplete="new-password" style={styles.input} />
          <TextInput value={confirm} onChangeText={setConfirm} placeholder="Confirm password" placeholderTextColor="#666" secureTextEntry autoComplete="new-password" style={styles.input} onSubmitEditing={submit} />
          {password !== confirm && !!confirm && <Text style={styles.error}>Passwords do not match.</Text>}
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable disabled={busy || !token || password.length < 8 || password !== confirm} onPress={submit} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            {busy ? <ActivityIndicator color="#050505" /> : <Text style={styles.primaryText}>Update password</Text>}
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
  title: { color: '#FFF', fontSize: 36, lineHeight: 40, fontWeight: '850' as any, letterSpacing: -1.2, marginTop: 8 },
  form: { gap: 12 },
  input: { height: 54, borderRadius: 16, borderWidth: 1, borderColor: '#242424', backgroundColor: '#101010', color: '#FFF', paddingHorizontal: 17, fontSize: 16 },
  error: { color: '#FF7979', fontSize: 13, lineHeight: 19, marginTop: 12 },
  primary: { height: 54, borderRadius: 16, backgroundColor: '#F2F2F2', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#050505', fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
