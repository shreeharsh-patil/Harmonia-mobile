import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/src/providers/AuthProvider';

export default function ProfileScreen() {
  const { user } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Profile</Text>
        {user ? (
          <Text style={styles.body}>Signed in as {user.name}</Text>
        ) : (
          <>
            <Text style={styles.body}>Sign in to sync your Harmonia account across web and mobile.</Text>
            <Pressable onPress={() => router.push('/login')} style={styles.button}>
              <Text style={styles.buttonText}>Sign in to Harmonia</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070707' },
  content: { padding: 20, paddingTop: 16 },
  title: { color: '#FFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  body: { color: '#777', fontSize: 15, lineHeight: 22, marginTop: 10 },
  button: { height: 50, borderRadius: 15, backgroundColor: '#EEE', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonText: { color: '#080808', fontSize: 15, fontWeight: '800' },
});
