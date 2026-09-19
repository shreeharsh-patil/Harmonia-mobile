import { router, Tabs } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
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
      size={focused ? 27 : 25}
      color={color}
    />
  );
}

function LibraryIcon({ color, focused }: { color: string; focused: boolean }) {
  const iconColor = color;
  const barHeight = focused ? 25 : 23;
  return (
    <View style={styles.libraryIcon} accessibilityElementsHidden>
      <View style={[styles.libraryBar, { height: barHeight, backgroundColor: iconColor }]} />
      <View style={[styles.libraryBar, { height: barHeight, backgroundColor: iconColor }]} />
      <View style={[styles.libraryBlock, { height: barHeight, backgroundColor: iconColor }]} />
    </View>
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
          // Android can occasionally resume a frozen native tab without
          // repainting it after the app returns from the background. Keeping
          // tabs mounted is a small memory trade-off, but avoids the blank
          // screen and remains smooth because each long list is virtualized.
          freezeOnBlur: false,
          sceneStyle: { backgroundColor: colors.background },
          // The reference uses a glass-like dock over the scrolling content.
          // A light black wash preserves contrast without making a solid bar.
          tabBarActiveTintColor: colors.textStrong,
          tabBarInactiveTintColor: '#808080',
          tabBarHideOnKeyboard: true,
          tabBarStyle: {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: TAB_BAR_HEIGHT + safeBottom,
            paddingTop: 7,
            paddingBottom: Math.max(5, safeBottom),
            borderTopWidth: 0,
            borderLeftWidth: 0,
            borderRightWidth: 0,
            borderBottomWidth: 0,
            backgroundColor: 'rgba(0,0,0,0.38)',
            elevation: 0,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            lineHeight: 14,
            fontWeight: '700',
            letterSpacing: -0.1,
          },
          tabBarItemStyle: {
            paddingVertical: 0,
          },
          tabBarIconStyle: {
            marginBottom: 1,
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
            title: 'Library',
            // This Library-position control is the quick entry point for
            // full-screen Music Clips. The Library stays available through
            // existing Home/Profile entries and deep links.
            tabBarButton: (props) => {
              const { ref: _ref, ...rest } = (props || {}) as any;
              return <Pressable {...rest} onPress={() => router.push('/clips')} />;
            },
            tabBarIcon: ({ color, focused }) => (
              <LibraryIcon color={String(color)} focused={focused} />
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
        <Tabs.Screen name="preferences" options={{ href: null, title: 'Settings' }} />
        <Tabs.Screen name="catalog" options={{ href: null }} />
        <Tabs.Screen name="playlist/[id]" options={{ href: null }} />
        <Tabs.Screen name="album/[id]" options={{ href: null }} />
        <Tabs.Screen name="artist/[id]" options={{ href: null }} />
        <Tabs.Screen name="mix/[id]" options={{ href: null }} />
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
  miniWrap: { position: 'absolute', left: 8, right: 8 },
  libraryIcon: { width: 28, height: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  libraryBar: { width: 4, borderRadius: 2 },
  libraryBlock: { width: 10, borderRadius: 2, borderTopRightRadius: 8 },
});
