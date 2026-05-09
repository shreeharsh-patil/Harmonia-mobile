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
import { SafeAreaView } from 'react-native-safe-area-context';
import { updateProfile } from '@/src/lib/api';
import { useAuth } from '@/src/providers/AuthProvider';

export default function EditProfileScreen() {
  const { token, user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [image, setImage] = useState<string | null>(user?.image || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickImage = async () => {
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
    if (compressed.base64) {
      setImage(`data:image/jpeg;base64,${compressed.base64}`);
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
        <View style={styles.center}><Text style={styles.error}>Sign in before editing your profile.</Text></View>
      </SafeAreaView>
    );
  }

  const initial = (name || user.email || 'H').trim().charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerButton}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>Edit profile</Text>
        <Pressable disabled={busy} onPress={save} style={styles.headerButton}>
          {busy ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.save}>Save</Text>}
        </Pressable>
      </View>

      <View style={styles.content}>
        <Pressable onPress={pickImage} style={styles.avatarWrap}>
          {image ? <Image source={{ uri: image }} style={styles.avatar} contentFit="cover" /> : <View style={[styles.avatar, styles.fallback]}><Text style={styles.initial}>{initial}</Text></View>}
          <View style={styles.changeBadge}><Text style={styles.changeText}>Change photo</Text></View>
        </Pressable>

        <Text style={styles.label}>DISPLAY NAME</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor="#666" style={styles.input} maxLength={80} />
        <Text style={styles.email}>{user.email}</Text>
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  headerButton: { minWidth: 56, height: 46, alignItems: 'center', justifyContent: 'center' },
  back: { color: '#EEE', fontSize: 36, lineHeight: 38 },
  headerTitle: { color: '#F1F1F1', fontSize: 17, fontWeight: '800' },
  save: { color: '#F1F1F1', fontSize: 14, fontWeight: '800' },
  content: { paddingHorizontal: 24, paddingTop: 24 },
  avatarWrap: { alignSelf: 'center', alignItems: 'center', marginBottom: 38 },
  avatar: { width: 126, height: 126, borderRadius: 42, backgroundColor: '#161616' },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFEFEF' },
  initial: { color: '#080808', fontSize: 45, fontWeight: '900' },
  changeBadge: { marginTop: 12, height: 36, borderRadius: 12, backgroundColor: '#151515', paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  changeText: { color: '#D8D8D8', fontSize: 12, fontWeight: '700' },
  label: { color: '#5D5D5D', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  input: { height: 54, borderRadius: 16, borderWidth: 1, borderColor: '#242424', backgroundColor: '#101010', color: '#FFF', paddingHorizontal: 17, fontSize: 16 },
  email: { color: '#616161', fontSize: 12, marginTop: 12, paddingHorizontal: 3 },
  error: { color: '#FF7979', fontSize: 13, lineHeight: 19, marginTop: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
});
