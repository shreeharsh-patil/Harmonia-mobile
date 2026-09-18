import { StyleSheet, View } from 'react-native';

export function CatalogSearchSkeleton() {
  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>{[0, 1, 2, 3].map((item) => <View key={item} style={styles.chip} />)}</View>
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
  wrap: { paddingTop: 8 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, marginBottom: 22 },
  chip: { width: 70, height: 30, borderRadius: 15, backgroundColor: '#1D1D1D' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 18 },
  card: { width: '46%' },
  artwork: { aspectRatio: 1, borderRadius: 10, backgroundColor: '#1D1D1D' },
  title: { width: '78%', height: 13, borderRadius: 4, backgroundColor: '#1D1D1D', marginTop: 9 },
  meta: { width: '52%', height: 10, borderRadius: 4, backgroundColor: '#1D1D1D', marginTop: 6 },
});
