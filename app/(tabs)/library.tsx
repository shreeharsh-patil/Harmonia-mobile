import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LibraryScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Your Library</Text>
        <Text style={styles.body}>Your synchronized playlists and liked songs are being connected here.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  content: { padding: 20, paddingTop: 16 },
  title: { color: '#FFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  body: { color: '#777', fontSize: 15, lineHeight: 22, marginTop: 10 },
});
