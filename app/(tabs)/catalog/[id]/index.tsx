import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CatalogEntityCard } from '@/src/components/CatalogEntityCard';
import { getTabContentBottomInset } from '@/src/components/MiniPlayer';
import {
  fetchBrowseCatalogSections,
  getBrowseCatalog,
  type CatalogSection,
} from '@/src/lib/browseCatalog';
import { RAIL_BATCH_SIZE, RAIL_INITIAL_RENDER, RAIL_WINDOW_SIZE } from '@/src/lib/listPerformance';
import { usePlayer } from '@/src/providers/PlayerProvider';

const CARD_SIZE = 148;
const CARD_GAP = 16;

export default function BrowseCatalogScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const catalog = getBrowseCatalog(rawId);
  const insets = useSafeAreaInsets();
  const { currentSong } = usePlayer();
  const [sections, setSections] = useState<CatalogSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadGenerationRef = useRef(0);

  const load = useCallback(async (forceRefresh = false) => {
    if (!catalog) {
      setLoading(false);
      setError('This catalog is unavailable.');
      return;
    }

    const generation = ++loadGenerationRef.current;
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const nextSections = await fetchBrowseCatalogSections(catalog.id, { forceRefresh });
      if (generation !== loadGenerationRef.current) return;
      setSections(nextSections);
      if (!nextSections.length) setError(`No ${catalog.name} collections are available right now.`);
    } catch (cause: any) {
      if (generation === loadGenerationRef.current) {
        setError(cause?.message || 'Unable to load this catalog.');
      }
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [catalog]);

  useEffect(() => {
    void load();
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load(false);

      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          void load(false);
        }
      });

      return () => {
        sub.remove();
      };
    }, [load])
  );

  const contentBottomInset = getTabContentBottomInset(insets.bottom, Boolean(currentSong));

  if (!catalog) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.notFound}>
          <Text style={styles.notFoundTitle}>Catalog unavailable</Text>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.retryButton}>
            <Text style={styles.retryText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor="#FFF"
            colors={['#FFF']}
          />
        )}
        contentContainerStyle={{ paddingBottom: contentBottomInset }}
      >
        <View style={[styles.hero, { backgroundColor: catalog.color }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={25} color="#FFF" />
          </Pressable>
          <Text numberOfLines={2} adjustsFontSizeToFit style={styles.heroTitle}>{catalog.name}</Text>
        </View>

        <View style={styles.sections}>
          {loading && !sections.length ? (
            <CatalogSkeleton />
          ) : (
            sections.map((section) => (
              <CatalogRail key={section.id} catalogId={catalog.id} section={section} />
            ))
          )}

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retryButton}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const CatalogRail = memo(function CatalogRail({
  catalogId,
  section,
}: {
  catalogId: string;
  section: CatalogSection;
}) {
  const showAll = () => {
    router.push({
      pathname: '/catalog/[id]/section/[sectionId]',
      params: { id: catalogId, sectionId: section.id },
    });
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text numberOfLines={2} style={styles.sectionTitle}>{section.title}</Text>
        <Pressable accessibilityRole="button" onPress={showAll} hitSlop={8} style={styles.showAllButton}>
          <Text style={styles.showAllText}>Show all</Text>
        </Pressable>
      </View>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={section.items}
        keyExtractor={(item) => `${item.kind}-${item.data.id || (item.kind === 'playlist' ? item.data._id : '')}`}
        initialNumToRender={RAIL_INITIAL_RENDER}
        maxToRenderPerBatch={RAIL_BATCH_SIZE}
        windowSize={RAIL_WINDOW_SIZE}
        removeClippedSubviews
        contentContainerStyle={styles.rail}
        getItemLayout={(_, index) => ({
          length: CARD_SIZE + CARD_GAP,
          offset: (CARD_SIZE + CARD_GAP) * index,
          index,
        })}
        renderItem={({ item }) => (
          <CatalogEntityCard item={item} size={CARD_SIZE} style={styles.railCard} />
        )}
      />
    </View>
  );
});

function CatalogSkeleton() {
  return (
    <View>
      {[0, 1].map((section) => (
        <View key={section} style={styles.section}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonRail}>
            {[0, 1, 2].map((item) => (
              <View key={item} style={styles.skeletonCard} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080808' },
  hero: { height: 260, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 34, justifyContent: 'space-between' },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.22)' },
  heroTitle: { color: '#FFF', fontSize: 54, lineHeight: 60, fontWeight: '900', letterSpacing: -2.2, textShadowColor: 'rgba(0,0,0,0.18)', textShadowRadius: 14, textShadowOffset: { width: 0, height: 3 } },
  sections: { paddingTop: 26 },
  section: { marginBottom: 34 },
  sectionHeader: { minHeight: 36, paddingHorizontal: 16, marginBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { flex: 1, color: '#EAEAF0', fontSize: 22, lineHeight: 27, fontWeight: '900', letterSpacing: -0.55 },
  showAllButton: { minHeight: 40, justifyContent: 'center', paddingLeft: 10 },
  showAllText: { color: '#A6A6AA', fontSize: 14, fontWeight: '800' },
  rail: { paddingHorizontal: 16, paddingRight: 0 },
  railCard: { marginRight: CARD_GAP },
  errorBox: { marginHorizontal: 16, borderRadius: 14, padding: 16, backgroundColor: '#171010', alignItems: 'flex-start' },
  errorText: { color: '#E9A0A0', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  retryButton: { minHeight: 40, borderRadius: 20, marginTop: 12, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F1F1' },
  retryText: { color: '#080808', fontSize: 13, fontWeight: '800' },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  notFoundTitle: { color: '#EEE', fontSize: 20, fontWeight: '800' },
  pressed: { opacity: 0.72 },
  skeletonTitle: { width: 210, height: 24, borderRadius: 7, marginHorizontal: 16, marginBottom: 16, backgroundColor: '#191919' },
  skeletonRail: { flexDirection: 'row', gap: CARD_GAP, paddingHorizontal: 16, overflow: 'hidden' },
  skeletonCard: { width: CARD_SIZE, height: CARD_SIZE, borderRadius: 8, backgroundColor: '#171717' },
});
