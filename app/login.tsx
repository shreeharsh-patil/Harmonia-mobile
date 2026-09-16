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
import { useAuth } from '@/src/providers/AuthProvider';

const EDITORIAL = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

export default function LoginScreen() {
  const { signIn, signInWithProvider, authenticating, error, token } = useAuth();
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (token) router.replace('/(tabs)');
  }, [token]);

  const submit = async () => {
    if (!email.trim() || !password || authenticating) return;
    const ok = await signIn(email.trim(), password);
    if (ok) router.replace('/(tabs)');
  };

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
            <View style={styles.brandRow}>
              <Image
                source={require('../assets/harmonia-icon.png')}
                resizeMode="cover"
                style={[styles.logo, compact && styles.logoCompact]}
                accessibilityLabel="Harmonia"
              />
              <Text style={styles.wordmark}>HARMONIA</Text>
            </View>

            <Text style={[styles.title, compact && styles.titleCompact]}>
              Your music follows you.
            </Text>
            <Text style={styles.subtitle}>
              Sign in to sync your playlists, liked songs, and library.
            </Text>
          </View>

          <View style={styles.form}>
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
                placeholder="Password"
                placeholderTextColor="#6D6D6D"
                secureTextEntry={!showPassword}
                autoComplete="current-password"
                returnKeyType="done"
                style={styles.input}
                onSubmitEditing={submit}
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

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/forgot-password')}
              style={styles.forgot}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>

            {!!error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}

            <Pressable
              accessibilityRole="button"
              disabled={authenticating}
              onPress={submit}
              style={({ pressed }) => [
                styles.primary,
                pressed && styles.pressed,
                authenticating && styles.disabled,
              ]}
            >
              {authenticating ? (
                <ActivityIndicator color="#050505" />
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
              disabled={authenticating}
              onPress={() => signInWithProvider('google')}
              style={({ pressed }) => [
                styles.social,
                pressed && styles.pressed,
                authenticating && styles.disabled,
              ]}
            >
              <FontAwesome5 name="google" size={21} color="#4285F4" style={styles.socialIcon} />
              <Text style={styles.socialText}>Continue with Google</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue with GitHub"
              disabled={authenticating}
              onPress={() => signInWithProvider('github')}
              style={({ pressed }) => [
                styles.social,
                pressed && styles.pressed,
                authenticating && styles.disabled,
              ]}
            >
              <FontAwesome5 name="github" size={22} color="#F2F2F2" style={styles.socialIcon} />
              <Text style={styles.socialText}>Continue with GitHub</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/signup')}
              style={styles.signup}
            >
              <Text style={styles.signupText}>
                New to Harmonia? <Text style={styles.signupAction}>Create account</Text>
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
    paddingTop: 34,
    paddingBottom: 24,
    justifyContent: 'space-between',
    gap: 34,
  },
  contentCompact: { paddingTop: 18, paddingBottom: 16, gap: 22 },
  hero: { maxWidth: 430 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 26 },
  logo: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: '#121212',
  },
  logoCompact: { width: 58, height: 58, borderRadius: 15 },
  wordmark: {
    color: '#C7C7C7',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 4,
  },
  title: {
    color: '#F7F7F7',
    fontFamily: EDITORIAL,
    fontSize: 44,
    lineHeight: 49,
    letterSpacing: -1.4,
    fontWeight: '800',
    maxWidth: 360,
  },
  titleCompact: { fontSize: 38, lineHeight: 42 },
  subtitle: {
    color: '#929292',
    fontFamily: EDITORIAL,
    fontSize: 17,
    lineHeight: 24,
    marginTop: 15,
    maxWidth: 360,
  },
  form: { gap: 12 },
  inputShell: {
    minHeight: 58,
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
    minHeight: 56,
    color: '#F5F5F5',
    paddingHorizontal: 14,
    paddingVertical: 0,
    fontSize: 16,
  },
  eyeButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgot: {
    alignSelf: 'flex-end',
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginTop: -4,
  },
  forgotText: {
    color: '#B1B1B1',
    fontFamily: EDITORIAL,
    fontSize: 13,
    fontWeight: '700',
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
    fontWeight: '800',
    fontSize: 18,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginVertical: 4,
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
  signup: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
  },
  signupText: {
    color: '#898989',
    fontFamily: EDITORIAL,
    fontSize: 13,
    fontWeight: '600',
  },
  signupAction: { color: '#E8E8E8', fontWeight: '800' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
});
