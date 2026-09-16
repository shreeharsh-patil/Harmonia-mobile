import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/providers/AuthProvider';

const BRAND_LOGO = require('../assets/harmonia-icon.png');
const GOOGLE_LOGO = require('../assets/google-logo.svg');
const GITHUB_LOGO = require('../assets/github-logo.svg');

export default function LoginScreen() {
  const { signIn, signInWithProvider, authenticating, error, token } = useAuth();
  const { height, width } = useWindowDimensions();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<'google' | 'github' | null>(null);

  const compact = height < 720;
  const narrow = width < 360;
  const canSubmit = Boolean(email.trim() && password) && !authenticating;

  useEffect(() => {
    if (token) router.replace('/(tabs)');
  }, [token]);

  const submit = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password || authenticating) return;
    const ok = await signIn(cleanEmail, password);
    if (ok) router.replace('/(tabs)');
  };

  const socialSignIn = async (provider: 'google' | 'github') => {
    if (authenticating) return;
    setPendingProvider(provider);
    try {
      await signInWithProvider(provider);
    } finally {
      setPendingProvider(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View pointerEvents="none" style={styles.glowTop} />
      <View pointerEvents="none" style={styles.glowBottom} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            compact && styles.scrollContentCompact,
            narrow && styles.scrollContentNarrow,
          ]}
        >
          <View style={styles.card}>
            <View style={[styles.header, compact && styles.headerCompact]}>
              <View style={styles.logoShell}>
                <Image
                  source={BRAND_LOGO}
                  contentFit="contain"
                  style={styles.logo}
                  accessibilityLabel="Harmonia"
                />
              </View>
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.subtitle}>Sign in to continue to Harmonia</Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputShell}>
                <Ionicons name="mail-outline" size={20} color="#8D8D93" />
                <TextInput
                  accessibilityLabel="Email address"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor="#68686D"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  style={styles.input}
                />
              </View>

              <View style={styles.inputShell}>
                <Ionicons name="lock-closed-outline" size={20} color="#8D8D93" />
                <TextInput
                  ref={passwordRef}
                  accessibilityLabel="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor="#68686D"
                  secureTextEntry={!showPassword}
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={submit}
                  style={styles.input}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  hitSlop={10}
                  onPress={() => setShowPassword((value) => !value)}
                  style={styles.eyeButton}
                >
                  <Ionicons
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={20}
                    color="#8D8D93"
                  />
                </Pressable>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/forgot-password')}
                style={styles.forgot}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>

              {!!error && (
                <View accessibilityRole="alert" style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={17} color="#FF9A9A" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSubmit, busy: authenticating && !pendingProvider }}
                disabled={!canSubmit}
                onPress={submit}
                style={({ pressed }) => [
                  styles.primary,
                  pressed && canSubmit && styles.pressed,
                  !canSubmit && styles.primaryDisabled,
                ]}
              >
                {authenticating && !pendingProvider ? (
                  <ActivityIndicator color="#080808" />
                ) : (
                  <Text style={styles.primaryText}>Continue</Text>
                )}
              </Pressable>

              <View style={styles.divider}>
                <View style={styles.line} />
                <Text style={styles.or}>OR</Text>
                <View style={styles.line} />
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Continue with Google"
                accessibilityState={{ disabled: authenticating, busy: pendingProvider === 'google' }}
                disabled={authenticating}
                onPress={() => void socialSignIn('google')}
                style={({ pressed }) => [
                  styles.social,
                  pressed && !authenticating && styles.socialPressed,
                  authenticating && pendingProvider !== 'google' && styles.socialDisabled,
                ]}
              >
                {pendingProvider === 'google' ? (
                  <ActivityIndicator color="#18181B" style={styles.socialIcon} />
                ) : (
                  <Image source={GOOGLE_LOGO} contentFit="contain" style={styles.socialIconImage} />
                )}
                <Text style={styles.socialText}>
                  {pendingProvider === 'google' ? 'Connecting to Google...' : 'Continue with Google'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Continue with GitHub"
                accessibilityState={{ disabled: authenticating, busy: pendingProvider === 'github' }}
                disabled={authenticating}
                onPress={() => void socialSignIn('github')}
                style={({ pressed }) => [
                  styles.social,
                  pressed && !authenticating && styles.socialPressed,
                  authenticating && pendingProvider !== 'github' && styles.socialDisabled,
                ]}
              >
                {pendingProvider === 'github' ? (
                  <ActivityIndicator color="#18181B" style={styles.socialIcon} />
                ) : (
                  <Image source={GITHUB_LOGO} contentFit="contain" style={styles.socialIconImage} />
                )}
                <Text style={styles.socialText}>
                  {pendingProvider === 'github' ? 'Connecting to GitHub...' : 'Continue with GitHub'}
                </Text>
              </Pressable>

              <Text style={styles.browserHint}>
                Social sign-in opens a secure browser and returns to Harmonia automatically.
              </Text>

              <View style={styles.accountRow}>
                <Text style={styles.accountText}>New to Harmonia?</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/signup')}
                  hitSlop={8}
                >
                  <Text style={styles.accountAction}>Create account</Text>
                </Pressable>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/(tabs)')}
                style={({ pressed }) => [styles.guestButton, pressed && styles.pressed]}
              >
                <Text style={styles.guestText}>Continue without an account</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#070707',
    overflow: 'hidden',
  },
  flex: { flex: 1 },
  glowTop: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: 'rgba(16,185,129,0.075)',
    top: -270,
    alignSelf: 'center',
  },
  glowBottom: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(59,130,246,0.035)',
    bottom: -230,
    right: -130,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 28,
  },
  scrollContentCompact: {
    justifyContent: 'flex-start',
    paddingTop: 16,
    paddingBottom: 16,
  },
  scrollContentNarrow: {
    paddingHorizontal: 12,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#27272A',
    backgroundColor: 'rgba(14,14,15,0.98)',
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 22,
    shadowColor: '#000',
    shadowOpacity: 0.34,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 14,
  },
  header: {
    alignItems: 'center',
    marginBottom: 26,
  },
  headerCompact: {
    marginBottom: 20,
  },
  logoShell: {
    width: 64,
    height: 64,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#151516',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2A2A2D',
    padding: 5,
    marginBottom: 16,
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  title: {
    color: '#F7F7F8',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.7,
    textAlign: 'center',
  },
  subtitle: {
    color: '#8F8F95',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
  },
  form: {
    gap: 12,
  },
  inputShell: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2C2C30',
    backgroundColor: '#111113',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 9,
  },
  input: {
    flex: 1,
    minHeight: 52,
    color: '#F4F4F5',
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 0,
  },
  eyeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgot: {
    minHeight: 30,
    alignSelf: 'flex-end',
    justifyContent: 'center',
    marginTop: -4,
    paddingHorizontal: 2,
  },
  forgotText: {
    color: '#C1C1C6',
    fontSize: 13,
    fontWeight: '700',
  },
  errorBox: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,125,125,0.26)',
    backgroundColor: 'rgba(255,90,90,0.08)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    color: '#FFAAAA',
    fontSize: 12,
    lineHeight: 17,
  },
  primary: {
    height: 54,
    borderRadius: 14,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  primaryDisabled: {
    opacity: 0.42,
  },
  primaryText: {
    color: '#09090B',
    fontSize: 16,
    fontWeight: '800',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 2,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#303034',
  },
  or: {
    color: '#69696F',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.7,
  },
  social: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#FAFAFA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingHorizontal: 44,
  },
  socialPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.995 }],
  },
  socialDisabled: {
    opacity: 0.5,
  },
  socialIcon: {
    position: 'absolute',
    left: 17,
  },
  socialIconImage: {
    position: 'absolute',
    left: 17,
    width: 21,
    height: 21,
  },
  socialText: {
    color: '#27272A',
    fontSize: 15,
    fontWeight: '750' as any,
    textAlign: 'center',
  },
  browserHint: {
    color: '#66666C',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 12,
    marginTop: -2,
  },
  accountRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 2,
  },
  accountText: {
    color: '#85858B',
    fontSize: 13,
  },
  accountAction: {
    color: '#F0F0F1',
    fontSize: 13,
    fontWeight: '800',
  },
  guestButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
  },
  guestText: {
    color: '#77777D',
    fontSize: 12,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }],
  },
});
