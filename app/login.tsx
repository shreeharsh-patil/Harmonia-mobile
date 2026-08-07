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
import { useAuth } from '@/src/providers/AuthProvider';

export default function LoginScreen() {
  const { signIn, signInWithProvider, authenticating, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = async () => {
    if (!email.trim() || !password) return;
    const ok = await signIn(email.trim(), password);
    if (ok) router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.brand}>
          <View style={styles.mark}><Text style={styles.markText}>H</Text></View>
          <Text style={styles.eyebrow}>HARMONIA</Text>
          <Text style={styles.title}>Your music follows you.</Text>
          <Text style={styles.subtitle}>Sign in to sync playlists, liked songs and your library.</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor="#666"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor="#666"
            secureTextEntry
            autoComplete="current-password"
            style={styles.input}
            onSubmitEditing={submit}
          />
          <Pressable onPress={() => router.push('/forgot-password')} style={styles.forgot}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>
          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            disabled={authenticating}
            onPress={submit}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            {authenticating ? <ActivityIndicator color="#050505" /> : <Text style={styles.primaryText}>Continue</Text>}
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.or}>OR</Text>
            <View style={styles.line} />
          </View>

          <Pressable
            disabled={authenticating}
            onPress={() => signInWithProvider('google')}
            style={({ pressed }) => [styles.social, pressed && styles.pressed]}
          >
            <Text style={styles.socialText}>Continue with Google</Text>
          </Pressable>
          <Pressable
            disabled={authenticating}
            onPress={() => signInWithProvider('github')}
            style={({ pressed }) => [styles.social, pressed && styles.pressed]}
          >
            <Text style={styles.socialText}>Continue with GitHub</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/signup')} style={styles.signup}>
            <Text style={styles.signupText}>New to Harmonia? Create account</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  screen: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between', paddingBottom: 28 },
  brand: { paddingTop: 50 },
  mark: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#F3F3F3', alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  markText: { color: '#090909', fontSize: 27, fontWeight: '900', letterSpacing: -1.5 },
  eyebrow: { color: '#747474', fontSize: 12, fontWeight: '800', letterSpacing: 2.3 },
  title: { color: '#FFF', fontSize: 38, lineHeight: 42, letterSpacing: -1.4, fontWeight: '800', marginTop: 10, maxWidth: 330 },
  subtitle: { color: '#909090', fontSize: 16, lineHeight: 23, marginTop: 14, maxWidth: 330 },
  form: { gap: 11 },
  input: { height: 54, borderRadius: 16, borderWidth: 1, borderColor: '#242424', backgroundColor: '#101010', color: '#FFF', paddingHorizontal: 17, fontSize: 16 },
  forgot: { alignSelf: 'flex-end', minHeight: 32, justifyContent: 'center', paddingHorizontal: 4, marginTop: -2 },
  forgotText: { color: '#9C9C9C', fontSize: 12, fontWeight: '700' },
  error: { color: '#FF7373', fontSize: 13, paddingHorizontal: 4 },
  primary: { height: 54, borderRadius: 16, backgroundColor: '#F2F2F2', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  primaryText: { color: '#050505', fontWeight: '800', fontSize: 16 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#252525' },
  or: { color: '#555', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  social: { height: 50, borderRadius: 16, borderWidth: 1, borderColor: '#262626', backgroundColor: '#0D0D0D', alignItems: 'center', justifyContent: 'center' },
  socialText: { color: '#E9E9E9', fontWeight: '700', fontSize: 15 },
  signup: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  signupText: { color: '#8D8D8D', fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
});
