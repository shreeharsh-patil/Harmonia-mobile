import { StyleSheet, View } from 'react-native';

export function ProfileSkeleton() {
  return (
    <View style={styles.wrap} accessibilityLabel="Loading profile">
      <View style={styles.header}>
        <View style={styles.heading} />
        <View style={styles.action} />
      </View>
      <View style={styles.identity}>
        <View style={styles.avatar} />
        <View style={styles.identityCopy}>
          <View style={styles.name} />
          <View style={styles.email} />
        </View>
        <View style={styles.action} />
      </View>
      <View style={styles.stats}>
        {[0, 1, 2].map((item) => (
          <View key={item} style={styles.statCell}>
            <View style={styles.statValue} />
            <View style={styles.statLabel} />
          </View>
        ))}
      </View>
      <View style={styles.metrics}>
        {[0, 1, 2].map((item) => (
          <View key={item} style={styles.metricCell}>
            <View style={styles.metricValue} />
            <View style={styles.metricLabel} />
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <View style={styles.kicker} />
        <View style={styles.cardLine} />
        <View style={styles.cardLineShort} />
        <View style={styles.cardButton} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  heading: { width: 102, height: 28, borderRadius: 6, backgroundColor: '#1D1D1D' },
  action: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1D1D1D' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 26 },
  avatar: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#1D1D1D' },
  identityCopy: { flex: 1, gap: 9 },
  name: { width: 145, height: 17, borderRadius: 5, backgroundColor: '#1D1D1D' },
  email: { width: 106, height: 12, borderRadius: 4, backgroundColor: '#1D1D1D' },
  stats: {
    height: 88,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#151515',
    marginBottom: 12,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  statValue: { width: 44, height: 20, borderRadius: 5, backgroundColor: '#262626' },
  statLabel: { width: 64, height: 10, borderRadius: 4, backgroundColor: '#262626' },
  metrics: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  metricCell: {
    flex: 1,
    minHeight: 66,
    borderRadius: 14,
    backgroundColor: '#151515',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  metricValue: { width: 34, height: 16, borderRadius: 4, backgroundColor: '#262626' },
  metricLabel: { width: 58, height: 9, borderRadius: 4, backgroundColor: '#262626' },
  card: { padding: 18, borderRadius: 16, backgroundColor: '#151515', gap: 12 },
  kicker: { width: 42, height: 9, borderRadius: 4, backgroundColor: '#262626' },
  cardLine: { width: '62%', height: 15, borderRadius: 5, backgroundColor: '#262626' },
  cardLineShort: { width: '88%', height: 11, borderRadius: 4, backgroundColor: '#262626' },
  cardButton: { width: 118, height: 38, borderRadius: 19, backgroundColor: '#262626', marginTop: 4 },
});
