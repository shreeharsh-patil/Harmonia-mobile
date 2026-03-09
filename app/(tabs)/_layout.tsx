import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from '@/src/components/MiniPlayer';

function TabGlyph({ value, color }: { value: string; color: string }) {
  return <Text style={[styles.glyph, { color }]}>{value}</Text>;
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const barHeight = 60 + Math.max(insets.bottom, 6);

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: '#070707' },
          tabBarActiveTintColor: '#F4F4F4',
          tabBarInactiveTintColor: '#686868',
          tabBarStyle: {
            height: barHeight,
            paddingTop: 7,
            paddingBottom: Math.max(insets.bottom, 7),
            backgroundColor: '#090909',
            borderTopColor: '#202020',
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 0.2,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <TabGlyph value="⌂" color={color} />,
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: 'Search',
            tabBarIcon: ({ color }) => <TabGlyph value="⌕" color={color} />,
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: 'Library',
            tabBarIcon: ({ color }) => <TabGlyph value="♫" color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => <TabGlyph value="●" color={color} />,
          }}
        />
      </Tabs>

      <View pointerEvents="box-none" style={[styles.miniWrap, { bottom: barHeight + 7 }]}>
        <MiniPlayer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070707' },
  glyph: { fontSize: 24, fontWeight: '700', lineHeight: 25 },
  miniWrap: { position: 'absolute', left: 8, right: 8 },
});
