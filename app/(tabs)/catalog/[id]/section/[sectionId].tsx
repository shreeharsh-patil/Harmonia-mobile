import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CatalogEntityCard } from '@/src/components/CatalogEntityCard';
import { CatalogSectionSkeleton } from '@/src/components/CatalogSectionSkeleton';
import { getTabContentBottomInset } from '@/src/components/MiniPlayer';
import {
  fetchBrowseCatalogSections,
  getBrowseCatalog,
  type CatalogSection,
} from '@/src/lib/browseCatalog';
import { usePlayer } from '@/src/providers/PlayerProvider';

export default function CatalogSectionScreen() {
  const params = useLocalSearchParams<{ id?: string; sectionId?: string }>();
  const catalogId = Array.isArray(params.id) ? params.id[0] : params.id;
  const sectionId = Array.isArray(params.sectionId) ? params.sectionId[0] : params.sectionId;
  const catalog = getBrowseCatalog(catalogId);
  const { width } = useWindowDimensions();
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
      if (generation === loadGenerationRef.current) setSections(nextSections);
    } catch (cause: any) {
      if (generation === loadGenerationRef.current) {
        setError(cause?.message || 'Unable to load this section.');
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

  const section = useMemo(
    () => sections.find((item) => item.id === sectionId) || null,
    [sectionId, sections]
  );
  const cardSize = Math.max(132, Math.floor((width - 44) / 2));
  const contentBottomInset = getTabContentBottomInset(insets.bottom, Boolean(currentSong));

  if (!catalog) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Catalog unavailable</Text>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.actionButton}>
            <Text style={styles.actionText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.header, { backgroundColor: catalog.color }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={25} color="#FFF" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text numberOfLines={1} style={styles.catalogName}>{catalog.name}</Text>
          <Text numberOfLines={2} style={styles.title}>{section?.title || 'Collection'}</Text>
        </View>
      </View>

      {loading && !section ? (
        <CatalogSectionSkeleton />
      ) : section ? (
        <FlatList
          data={section.items}
          numColumns={2}
          keyExtractor={(item) => `${item.kind}-${item.data.id || (item.kind === 'playlist' ? item.data._id : '')}`}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          columnWrapperStyle={styles.columns}
          contentContainerStyle={[styles.grid, { paddingBottom: contentBottomInset }]}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor="#FFF"
              colors={['#FFF']}
            />
          )}
          renderItem={({ item }) => (
            <CatalogEntityCard item={item} size={cardSize} style={styles.gridCard} />
          )}
        />
      ) : (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Section unavailable</Text>
          <Text style={styles.errorText}>{error || 'This collection could not be found.'}</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.actionButton}>
            <Text style={styles.actionText}>Try again</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#080808' },
  header: { minHeight: 142, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 22, flexDirection: 'row', alignItems: 'flex-start' },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.22)' },
  headerCopy: { flex: 1, minWidth: 0, alignSelf: 'flex-end', marginLeft: 12 },
  catalogName: { color: 'rgba(255,255,255,0.78)', fontSize: 12, lineHeight: 16, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },
  title: { color: '#FFF', fontSize: 28, lineHeight: 33, fontWeight: '900', letterSpacing: -0.8, marginTop: 3 },
  grid: { paddingHorizontal: 16, paddingTop: 22 },
  columns: { justifyContent: 'space-between' },
  gridCard: { marginBottom: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  errorTitle: { color: '#EEE', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  errorText: { color: '#888', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 7 },
  actionButton: { minHeight: 42, borderRadius: 21, marginTop: 16, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F1F1' },
  actionText: { color: '#080808', fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
