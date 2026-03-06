import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>HARMONIA</Text>
        <Text style={styles.title}>Your music, built for your phone.</Text>
        <Text style={styles.subtitle}>
          Native Harmonia mobile development has started.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>PHASE 1</Text>
        <Text style={styles.cardTitle}>Mobile foundation ready</Text>
        <Text style={styles.cardBody}>
          Next: navigation, authentication, library, search and the native player.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#070707',
    paddingHorizontal: 22,
  },
  header: {
    paddingTop: 56,
  },
  eyebrow: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.4,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '800',
    letterSpacing: -1.4,
    marginTop: 12,
    maxWidth: 340,
  },
  subtitle: {
    color: '#A1A1A6',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 16,
    maxWidth: 320,
  },
  card: {
    marginTop: 48,
    borderRadius: 24,
    padding: 22,
    backgroundColor: '#111111',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2A2A2A',
  },
  cardLabel: {
    color: '#777777',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 8,
  },
  cardBody: {
    color: '#9A9A9A',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
});
