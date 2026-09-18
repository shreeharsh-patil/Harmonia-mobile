import { StyleSheet, View } from 'react-native';

/** Content-shaped loading state shared by playlist, album, artist, and mix pages. */
export function CatalogDetailSkeleton() {
  return (
    <View style={styles.screen}>
      <View style={styles.topRow}>
        <View style={styles.round} />
        <View style={styles.round} />
      </View>
      <View style={styles.heroArtwork} />
      <View style={styles.kicker} />
      <View style={styles.title} />
      <View style={styles.meta} />
      <View style={styles.actions}>
        <View style={styles.play} />
        <View style={styles.shuffle} />
      </View>
      <View style={styles.sectionTitle} />
      {[0, 1, 2, 3, 4].map((item) => (
        <View key={item} style={styles.row}>
          <View style={styles.rowArtwork} />
          <View style={styles.rowCopy}>
            <View style={styles.rowTitle} />
            <View style={styles.rowMeta} />
          </View>
        </View>
      ))}
    </View>
  );
}

const tone = '#1D1D1D';
const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 18, paddingTop: 10, backgroundColor: '#070707' },
  topRow: { height: 46, flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: tone },
  heroArtwork: { width: 224, height: 224, alignSelf: 'center', borderRadius: 14, backgroundColor: tone, marginTop: 12 },
  kicker: { width: 78, height: 9, borderRadius: 5, backgroundColor: tone, alignSelf: 'center', marginTop: 22 },
  title: { width: '68%', height: 28, borderRadius: 7, backgroundColor: tone, alignSelf: 'center', marginTop: 10 },
  meta: { width: '42%', height: 13, borderRadius: 5, backgroundColor: tone, alignSelf: 'center', marginTop: 10 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 22, marginBottom: 28 },
  play: { width: 118, height: 46, borderRadius: 23, backgroundColor: '#2B2B2B' },
  shuffle: { width: 118, height: 46, borderRadius: 23, backgroundColor: tone },
  sectionTitle: { width: 74, height: 19, borderRadius: 5, backgroundColor: tone, marginBottom: 9 },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center' },
  rowArtwork: { width: 52, height: 52, borderRadius: 10, backgroundColor: tone },
  rowCopy: { marginLeft: 12, flex: 1, gap: 8 },
  rowTitle: { width: '57%', height: 14, borderRadius: 4, backgroundColor: tone },
  rowMeta: { width: '38%', height: 11, borderRadius: 4, backgroundColor: tone },
});
