import { StyleSheet, View } from 'react-native';

export function ProfileSkeleton() {
  return (
    <View style={styles.wrap} accessibilityLabel="Loading profile">
      <View style={styles.header}><View style={styles.heading} /><View style={styles.action} /></View>
      <View style={styles.identity}><View style={styles.avatar} /><View><View style={styles.name} /><View style={styles.email} /></View></View>
      <View style={styles.card}>{[0, 1, 2].map((item) => <View key={item} style={styles.row}><View style={styles.icon} /><View style={styles.line} /></View>)}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  heading: { width: 102, height: 28, borderRadius: 6, backgroundColor: '#1D1D1D' },
  action: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1D1D1D' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 28 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#1D1D1D' },
  name: { width: 145, height: 17, borderRadius: 5, backgroundColor: '#1D1D1D', marginBottom: 9 },
  email: { width: 106, height: 12, borderRadius: 4, backgroundColor: '#1D1D1D' },
  card: { padding: 16, borderRadius: 16, backgroundColor: '#151515', gap: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  icon: { width: 25, height: 25, borderRadius: 13, backgroundColor: '#262626' },
  line: { flex: 1, height: 14, borderRadius: 4, backgroundColor: '#262626' },
});
