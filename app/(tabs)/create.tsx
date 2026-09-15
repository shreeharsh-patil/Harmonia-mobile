import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTabContentBottomInset } from '@/src/components/MiniPlayer';
import { useAuth } from '@/src/providers/AuthProvider';
import { useLibrary } from '@/src/providers/LibraryProvider';
import { usePlayer } from '@/src/providers/PlayerProvider';

export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { createPlaylist } = useLibrary();
  const { currentSong } = usePlayer();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const bottomInset = getTabContentBottomInset(insets.bottom, Boolean(currentSong));

  const submit = async () => {
    if (!token) {
      router.push('/login');
      return;
    }
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const playlist = await createPlaylist(name);
      if (!playlist) return;
      setName('');
      const id = String(playlist.id || playlist._id || '');
      if (id) router.push({ pathname: '/playlist/[id]', params: { id } });
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.content, { paddingBottom: bottomInset }]}>
        <Text style={styles.title}>Create</Text>
        <Text style={styles.subtitle}>Make something new for your Harmonia library.</Text>

        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="musical-notes" size={28} color="#FFF" />
          </View>
          <Text style={styles.cardTitle}>New playlist</Text>
          <Text style={styles.cardBody}>Create a playlist that stays synced with your Harmonia account.</Text>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Playlist name"
            placeholderTextColor="#666"
            style={styles.input}
            onSubmitEditing={() => void submit()}
          />

          <Pressable
            disabled={!name.trim() || creating}
            onPress={() => void submit()}
            style={[styles.primary, (!name.trim() || creating) && styles.primaryDisabled]}
          >
            {creating
              ? <ActivityIndicator color="#101010" size="small" />
              : <Text style={styles.primaryText}>Create playlist</Text>}
          </Pressable>
        </View>

        <Pressable onPress={() => router.push('/import-playlist')} style={styles.secondaryCard}>
          <View>
            <Text style={styles.secondaryTitle}>Import playlist</Text>
            <Text style={styles.secondaryBody}>Bring an existing playlist into Harmonia.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#777" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0D0D0D' },
  content: { flex: 1, paddingHorizontal: 18, paddingTop: 20 },
  title: { color: '#F5F5F5', fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { color: '#777', fontSize: 14, lineHeight: 20, marginTop: 6 },
  card: { marginTop: 26, borderRadius: 18, backgroundColor: '#151515', padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: '#252525' },
  iconWrap: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#292929', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: '#F0F0F0', fontSize: 20, fontWeight: '800', marginTop: 16 },
  cardBody: { color: '#777', fontSize: 13, lineHeight: 19, marginTop: 6 },
  input: { height: 50, borderRadius: 13, backgroundColor: '#0D0D0D', color: '#F3F3F3', paddingHorizontal: 14, marginTop: 18, fontSize: 15 },
  primary: { height: 50, borderRadius: 14, backgroundColor: '#EFEFEF', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryDisabled: { opacity: 0.45 },
  primaryText: { color: '#101010', fontSize: 14, fontWeight: '800' },
  secondaryCard: { minHeight: 78, borderRadius: 16, backgroundColor: '#121212', borderWidth: StyleSheet.hairlineWidth, borderColor: '#222', paddingHorizontal: 16, marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  secondaryTitle: { color: '#E7E7E7', fontSize: 15, fontWeight: '800' },
  secondaryBody: { color: '#6D6D6D', fontSize: 12, marginTop: 3 },
});
