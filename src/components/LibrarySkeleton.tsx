import { StyleSheet, View } from 'react-native';

export function LibrarySkeleton() {
  return (
    <View style={styles.wrap} accessibilityLabel="Loading library">
      <View style={styles.heading} />
      <View style={styles.tabs}>{[0, 1, 2].map((item) => <View key={item} style={styles.tab} />)}</View>
      <View style={styles.grid}>
        {Array.from({ length: 8 }, (_, item) => (
          <View key={item} style={styles.card}>
            <View style={styles.artwork} />
            <View style={styles.title} />
            <View style={styles.meta} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 18, paddingTop: 18 },
  heading: { width: 116, height: 28, borderRadius: 6, backgroundColor: '#1D1D1D', marginBottom: 20 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  tab: { width: 84, height: 31, borderRadius: 16, backgroundColor: '#1D1D1D' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 18 },
  card: { width: '46%' },
  artwork: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#1D1D1D' },
  title: { width: '76%', height: 13, borderRadius: 4, backgroundColor: '#1D1D1D', marginTop: 9 },
  meta: { width: '52%', height: 10, borderRadius: 4, backgroundColor: '#1D1D1D', marginTop: 6 },
});
