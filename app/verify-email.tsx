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
import { verifyEmailAddress } from '@/src/lib/api';

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const email = String(params.email || '');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email || otp.trim().length < 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyEmailAddress(email, otp.trim());
      router.replace('/login');
    } catch (cause: any) {
      setError(cause?.message || 'Unable to verify this code');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View>
          <Pressable onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>
          <Text style={styles.kicker}>EMAIL VERIFICATION</Text>
          <Text style={styles.title}>Check your inbox.</Text>
          <Text style={styles.subtitle}>Enter the verification code sent to {email || 'your email'}.</Text>
        </View>
        <View style={styles.form}>
          <TextInput
            value={otp}
            onChangeText={setOtp}
            placeholder="Verification code"
            placeholderTextColor="#666"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={8}
            style={styles.code}
            onSubmitEditing={submit}
          />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable disabled={busy} onPress={submit} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            {busy ? <ActivityIndicator color="#050505" /> : <Text style={styles.primaryText}>Verify email</Text>}
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
  subtitle: { color: '#858585', fontSize: 15, lineHeight: 22, marginTop: 12 },
  form: { gap: 12 },
  code: { height: 62, borderRadius: 18, backgroundColor: '#101010', borderWidth: 1, borderColor: '#292929', color: '#FFF', fontSize: 24, fontWeight: '800', letterSpacing: 5, textAlign: 'center' },
  error: { color: '#FF7979', fontSize: 13 },
  primary: { height: 54, borderRadius: 16, backgroundColor: '#F2F2F2', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#050505', fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
