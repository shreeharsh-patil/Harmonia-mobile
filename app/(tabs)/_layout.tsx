import { Tabs } from 'expo-router';
import { ColorValue, Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from '@/src/components/MiniPlayer';
import { colors } from '@/src/theme';

type TabIconName = 'home' | 'search' | 'library' | 'person';

function TabIcon({ name, color, focused }: { name: TabIconName; color: ColorValue; focused: boolean }) {
  return <Ionicons name={focused ? name : `${name}-outline`} size={23} color={color} />;
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
          sceneStyle: { backgroundColor: colors.background },
          tabBarActiveTintColor: colors.textStrong,
          tabBarInactiveTintColor: colors.muted,
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
            borderColor: colors.borderStrong,
            borderRadius: 20,
            backgroundColor: Platform.OS === 'android' ? 'rgba(10,10,10,0.98)' : 'rgba(10,10,10,0.94)',
            overflow: 'hidden',
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 0.1,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, focused }) => <TabIcon name="home" color={color} focused={focused} /> }} />
        <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: ({ color, focused }) => <TabIcon name="search" color={color} focused={focused} /> }} />
        <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: ({ color, focused }) => <TabIcon name="library" color={color} focused={focused} /> }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, focused }) => <TabIcon name="person" color={color} focused={focused} /> }} />
      </Tabs>

      <View pointerEvents="box-none" style={[styles.miniWrap, { bottom: bottom + barHeight + 8 }]}>
        <MiniPlayer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  miniWrap: { position: 'absolute', left: 12, right: 12 },
});
