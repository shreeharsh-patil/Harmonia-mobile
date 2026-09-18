import { StyleSheet, View } from 'react-native';

export function ExploreSkeleton() {
  return (
    <View style={styles.wrap} accessibilityLabel="Loading explore">
      <View style={styles.hero}><View style={styles.kicker} /><View style={styles.title} /><View style={styles.body} /><View style={styles.bodyShort} /></View>
      {[0, 1].map((section) => (
        <View key={section} style={styles.section}>
          <View style={styles.sectionTitle} />
          <View style={styles.rail}>{[0, 1, 2].map((item) => <View key={item} style={styles.card}><View style={styles.artwork} /><View style={styles.line} /><View style={styles.meta} /></View>)}</View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 28 },
  hero: { padding: 20, borderRadius: 18, backgroundColor: '#151515', gap: 10 },
  kicker: { width: 92, height: 10, borderRadius: 4, backgroundColor: '#262626' },
  title: { width: '84%', height: 28, borderRadius: 6, backgroundColor: '#262626' },
  body: { width: '100%', height: 12, borderRadius: 4, backgroundColor: '#262626' },
  bodyShort: { width: '68%', height: 12, borderRadius: 4, backgroundColor: '#262626' },
  section: { gap: 13 },
  sectionTitle: { width: 148, height: 21, borderRadius: 5, backgroundColor: '#1D1D1D' },
  rail: { flexDirection: 'row', gap: 14 },
  card: { width: 136, gap: 8 },
  artwork: { width: 136, height: 136, borderRadius: 10, backgroundColor: '#1D1D1D' },
  line: { width: '78%', height: 12, borderRadius: 4, backgroundColor: '#1D1D1D' },
  meta: { width: '53%', height: 10, borderRadius: 4, backgroundColor: '#1D1D1D' },
});
