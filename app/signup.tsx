import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { registerAccount } from '@/src/lib/api';
import { useAuth } from '@/src/providers/AuthProvider';

const EDITORIAL = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

export default function SignupScreen() {
  const { signInWithProvider, authenticating, error: authError, token } = useAuth();
  const { height } = useWindowDimensions();
  const compact = height < 820;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) router.replace('/(tabs)');
  }, [token]);

  const submit = async () => {
    if (busy || authenticating) return;

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || !cleanEmail) {
      setError('Enter your name and email to continue.');
      return;
    }
    if (password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await registerAccount(cleanName, cleanEmail, password);
      if (result.requiresVerification) {
        router.replace({ pathname: '/verify-email', params: { email: cleanEmail } });
      } else {
        router.replace('/login');
      }
    } catch (cause: any) {
      setError(cause?.message || 'Unable to create your account');
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || authenticating;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, compact && styles.contentCompact]}
        >
          <View style={styles.hero}>
            <View style={styles.topRow}>
              <View style={styles.brandRow}>
                <Image
                  source={require('../assets/harmonia-icon.png')}
                  resizeMode="cover"
                  style={[styles.logo, compact && styles.logoCompact]}
                  accessibilityLabel="Harmonia"
                />
                <Text style={styles.wordmark}>HARMONIA</Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={10}
                onPress={() => router.back()}
                style={styles.back}
              >
                <Ionicons name="close" size={24} color="#A8A8A8" />
              </Pressable>
            </View>

            <Text style={[styles.title, compact && styles.titleCompact]}>
              Create your account.
            </Text>
            <Text style={styles.subtitle}>
              Join Harmonia to sync your playlists, liked songs, and library across devices.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputShell}>
              <Ionicons name="person-outline" size={21} color="#969696" />
              <TextInput
                accessibilityLabel="Full name"
                value={name}
                onChangeText={setName}
                placeholder="Full name"
                placeholderTextColor="#6D6D6D"
                autoComplete="name"
                returnKeyType="next"
                style={styles.input}
              />
            </View>

            <View style={styles.inputShell}>
              <Ionicons name="mail-outline" size={21} color="#969696" />
              <TextInput
                accessibilityLabel="Email address"
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor="#6D6D6D"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                returnKeyType="next"
                style={styles.input}
              />
            </View>

            <View style={styles.inputShell}>
              <Ionicons name="lock-closed-outline" size={21} color="#969696" />
              <TextInput
                accessibilityLabel="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Password · minimum 8 characters"
                placeholderTextColor="#6D6D6D"
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                returnKeyType="next"
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
                  size={21}
                  color="#8A8A8A"
                />
              </Pressable>
            </View>

            <View style={styles.inputShell}>
              <Ionicons name="shield-checkmark-outline" size={21} color="#969696" />
              <TextInput
                accessibilityLabel="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm password"
                placeholderTextColor="#6D6D6D"
                secureTextEntry={!showConfirmPassword}
                autoComplete="new-password"
                returnKeyType="done"
                style={styles.input}
                onSubmitEditing={submit}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'}
                hitSlop={10}
                onPress={() => setShowConfirmPassword((value) => !value)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={21}
                  color="#8A8A8A"
                />
              </Pressable>
            </View>

            {!!(error || authError) && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error || authError}
              </Text>
            )}

            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={submit}
              style={({ pressed }) => [
                styles.primary,
                pressed && styles.pressed,
                disabled && styles.disabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#050505" />
              ) : (
                <Text style={styles.primaryText}>Create account</Text>
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
              disabled={disabled}
              onPress={() => signInWithProvider('google')}
              style={({ pressed }) => [
                styles.social,
                pressed && styles.pressed,
                disabled && styles.disabled,
              ]}
            >
              <FontAwesome5 name="google" size={21} color="#4285F4" style={styles.socialIcon} />
              <Text style={styles.socialText}>Continue with Google</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue with GitHub"
              disabled={disabled}
              onPress={() => signInWithProvider('github')}
              style={({ pressed }) => [
                styles.social,
                pressed && styles.pressed,
                disabled && styles.disabled,
              ]}
            >
              <FontAwesome5 name="github" size={22} color="#F2F2F2" style={styles.socialIcon} />
              <Text style={styles.socialText}>Continue with GitHub</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/login')}
              style={styles.loginLink}
            >
              <Text style={styles.loginText}>
                Already have an account? <Text style={styles.loginAction}>Sign in</Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 22,
    justifyContent: 'space-between',
    gap: 28,
  },
  contentCompact: { paddingTop: 16, paddingBottom: 16, gap: 20 },
  hero: { maxWidth: 430 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logo: {
    width: 62,
    height: 62,
    borderRadius: 17,
    backgroundColor: '#121212',
  },
  logoCompact: { width: 54, height: 54, borderRadius: 15 },
  wordmark: {
    color: '#C7C7C7',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 4,
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#282828',
    backgroundColor: '#0C0C0C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#F7F7F7',
    fontFamily: EDITORIAL,
    fontSize: 42,
    lineHeight: 47,
    letterSpacing: -1.3,
    fontWeight: '800',
    maxWidth: 360,
  },
  titleCompact: { fontSize: 36, lineHeight: 40 },
  subtitle: {
    color: '#909090',
    fontFamily: EDITORIAL,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 13,
    maxWidth: 390,
  },
  form: { gap: 11 },
  inputShell: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2C2C2C',
    backgroundColor: '#0E0E0E',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 18,
    paddingRight: 12,
  },
  input: {
    flex: 1,
    minHeight: 54,
    color: '#F5F5F5',
    paddingHorizontal: 14,
    paddingVertical: 0,
    fontSize: 15.5,
  },
  eyeButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: '#FF8585',
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  primary: {
    height: 58,
    borderRadius: 18,
    backgroundColor: '#F4F4F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  primaryText: {
    color: '#050505',
    fontFamily: EDITORIAL,
    fontSize: 18,
    fontWeight: '800',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginVertical: 3,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#303030',
  },
  or: {
    color: '#686868',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  social: {
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#303030',
    backgroundColor: '#0B0B0B',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  socialIcon: { position: 'absolute', left: 22 },
  socialText: {
    color: '#EEEEEE',
    fontFamily: EDITORIAL,
    fontWeight: '700',
    fontSize: 16,
  },
  loginLink: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
  },
  loginText: {
    color: '#898989',
    fontFamily: EDITORIAL,
    fontSize: 13,
    fontWeight: '600',
  },
  loginAction: { color: '#E8E8E8', fontWeight: '800' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
});
