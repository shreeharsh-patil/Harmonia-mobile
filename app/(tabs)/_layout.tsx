import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MiniPlayer,
  TAB_BAR_HEIGHT,
  TAB_BAR_TO_MINI_GAP,
} from '@/src/components/MiniPlayer';
import { colors } from '@/src/theme';

function TabIcon({
  active,
  inactive,
  color,
  focused,
}: {
  active: keyof typeof Ionicons.glyphMap;
  inactive: keyof typeof Ionicons.glyphMap;
  color: string;
  focused: boolean;
}) {
  return (
    <Ionicons
      name={focused ? active : inactive}
      size={24}
      color={color}
    />
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const safeBottom = Math.max(insets.bottom, 0);

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          lazy: true,
          freezeOnBlur: true,
          sceneStyle: { backgroundColor: colors.background },
          tabBarActiveTintColor: colors.textStrong,
          tabBarInactiveTintColor: colors.muted,
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: TAB_BAR_HEIGHT + safeBottom,
            paddingTop: 6,
            paddingBottom: Math.max(5, safeBottom),
            borderTopWidth: StyleSheet.hairlineWidth,
            borderLeftWidth: 0,
            borderRightWidth: 0,
            borderBottomWidth: 0,
            borderTopColor: colors.border,
            backgroundColor: Platform.OS === 'android' ? '#000000' : 'rgba(0,0,0,0.98)',
            elevation: 0,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 0,
          },
          tabBarItemStyle: {
            paddingVertical: 2,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon active="home" inactive="home-outline" color={String(color)} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: 'Search',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon active="search" inactive="search-outline" color={String(color)} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: 'Your Library',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon active="library" inactive="library-outline" color={String(color)} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon active="person" inactive="person-outline" color={String(color)} focused={focused} />
            ),
          }}
        />
      </Tabs>

      <View
        pointerEvents="box-none"
        style={[
          styles.miniWrap,
          { bottom: TAB_BAR_HEIGHT + safeBottom + TAB_BAR_TO_MINI_GAP },
        ]}
      >
        <MiniPlayer />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  miniWrap: { position: 'absolute', left: 6, right: 6 },
});
