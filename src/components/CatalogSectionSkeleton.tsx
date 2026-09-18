import { StyleSheet, View } from 'react-native';

export function CatalogSectionSkeleton() {
  return (
    <View style={styles.wrap} accessibilityLabel="Loading collection">
      <View style={styles.title} />
      <View style={styles.meta} />
      <View style={styles.grid}>
        {Array.from({ length: 10 }, (_, item) => (
          <View key={item} style={styles.card}>
            <View style={styles.artwork} />
            <View style={styles.line} />
            <View style={styles.subline} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 22 },
  title: { width: 188, height: 25, borderRadius: 6, backgroundColor: '#1D1D1D' },
  meta: { width: 108, height: 12, borderRadius: 4, backgroundColor: '#1D1D1D', marginTop: 9, marginBottom: 25 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 25 },
  card: { width: '46%' },
  artwork: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#1D1D1D' },
  line: { width: '81%', height: 13, borderRadius: 4, backgroundColor: '#1D1D1D', marginTop: 9 },
  subline: { width: '56%', height: 10, borderRadius: 4, backgroundColor: '#1D1D1D', marginTop: 6 },
});
