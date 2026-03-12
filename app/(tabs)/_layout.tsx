import { Tabs } from 'expo-router';
import { ColorValue, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from '@/src/components/MiniPlayer';

function TabGlyph({ value, color }: { value: string; color: ColorValue }) {
  return <Text style={[styles.glyph, { color }]}>{value}</Text>;
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const barHeight = 58;
  const bottom = Math.max(insets.bottom, 8);

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: '#070707' },
          tabBarActiveTintColor: '#F4F4F4',
          tabBarInactiveTintColor: '#686868',
          tabBarStyle: {
            position: 'absolute',
            left: 12,
            right: 12,
            bottom,
            height: barHeight,
            paddingTop: 6,
            paddingBottom: 6,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: '#292929',
            borderRadius: 24,
            backgroundColor: Platform.OS === 'android' ? 'rgba(16,16,16,0.97)' : 'rgba(16,16,16,0.92)',
            overflow: 'hidden',
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 0.1,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <TabGlyph value="⌂" color={color} /> }} />
        <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: ({ color }) => <TabGlyph value="⌕" color={color} /> }} />
        <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: ({ color }) => <TabGlyph value="♫" color={color} /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <TabGlyph value="●" color={color} /> }} />
      </Tabs>

      <View pointerEvents="box-none" style={[styles.miniWrap, { bottom: bottom + barHeight + 8 }]}>
        <MiniPlayer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070707' },
  glyph: { fontSize: 22, fontWeight: '700', lineHeight: 23 },
  miniWrap: { position: 'absolute', left: 12, right: 12 },
});
