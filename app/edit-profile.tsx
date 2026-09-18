import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { updateProfile } from '@/src/lib/api';
import { useAuth } from '@/src/providers/AuthProvider';
import { colors } from '@/src/theme';

export default function EditProfileScreen() {
  const { token, user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [image, setImage] = useState<string | null>(user?.image || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickImage = async () => {
    setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Photo library permission is required to choose a profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      const compressed = await manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 512, height: 512 } }],
        { compress: 0.66, format: SaveFormat.JPEG, base64: true }
      );

      if (!compressed.base64) {
        setError('Harmonia could not process this image. Try a different photo.');
        return;
      }

      setImage(`data:image/jpeg;base64,${compressed.base64}`);
    } catch (cause: any) {
      setError(cause?.message || 'Harmonia could not open or process this photo.');
    }
  };

  const save = async () => {
    if (!token || name.trim().length < 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateProfile(token, { name: name.trim(), image });
      await refreshUser();
      router.back();
    } catch (cause: any) {
      setError(cause?.message || 'Unable to update your profile');
    } finally {
      setBusy(false);
    }
  };

  if (!token || !user) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.error}>Sign in before editing your profile.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const initial = (name || user.email || 'H').trim().charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={23} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <Pressable
          disabled={busy || name.trim().length < 2}
          onPress={save}
          style={({ pressed }) => [
            styles.saveButton,
            (busy || name.trim().length < 2) && styles.saveDisabled,
            pressed && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#061108" size="small" />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.content}>
        <Pressable onPress={pickImage} style={({ pressed }) => [styles.avatarWrap, pressed && styles.pressed]}>
          <View style={styles.avatarShell}>
            {image ? (
              <Image source={{ uri: image }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.initial}>{initial}</Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={16} color="#061108" />
            </View>
          </View>
          <View style={styles.changeBadge}>
            <Ionicons name="image-outline" size={15} color={colors.accentBright} />
            <Text style={styles.changeText}>Change photo</Text>
          </View>
        </Pressable>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>DISPLAY NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            maxLength={80}
          />
          <Text style={styles.emailLabel}>ACCOUNT EMAIL</Text>
          <View style={styles.emailBox}>
            <Ionicons name="mail-outline" size={16} color={colors.textFaint} />
            <Text style={styles.email}>{user.email}</Text>
          </View>
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={styles.error}>{error}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: colors.textStrong, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  saveButton: {
    height: 36,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: colors.accentBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveDisabled: { opacity: 0.4 },
  saveText: { color: '#061108', fontSize: 13, fontWeight: '800' },
  content: { paddingHorizontal: 20, paddingTop: 28 },
  avatarWrap: { alignSelf: 'center', alignItems: 'center', marginBottom: 32 },
  avatarShell: { position: 'relative' },
  avatar: { width: 110, height: 110, borderRadius: 55, backgroundColor: colors.surface },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  initial: { color: colors.accentBright, fontSize: 44, fontWeight: '900' },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentBright,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  changeBadge: {
    marginTop: 14,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  changeText: { color: colors.textStrong, fontSize: 12, fontWeight: '700' },
  fieldGroup: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 18,
  },
  label: { color: colors.textFaint, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  input: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    color: colors.textStrong,
    paddingHorizontal: 15,
    fontSize: 15,
    fontWeight: '600',
  },
  emailLabel: { color: colors.textFaint, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginTop: 18, marginBottom: 8 },
  emailBox: {
    height: 50,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  email: { color: colors.textMuted, fontSize: 14 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  error: { color: colors.danger, fontSize: 13, flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  pressed: { opacity: 0.75 },
});
