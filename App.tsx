import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  NativeModules,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type Story = {
  objectID: string;
  title: string | null;
  url: string | null;
  author: string;
  points: number;
  num_comments: number;
  created_at: string;
  story_text: string | null;
};

type StoryItem = Story & {
  liked: boolean;
  saved: boolean;
};

const API_URL = 'https://hn.algolia.com/api/v1/search?tags=story';
const SAVED_KEY = 'saved_story_ids_v1';
const LIKED_KEY = 'liked_story_ids_v1';

const {LocalStorage} = NativeModules;

const Storage = {
  getItem: (key: string): Promise<string | null> => {
    return LocalStorage.getItem(key);
  },
  setItem: (key: string, value: string): Promise<void> => {
    return LocalStorage.setItem(key, value);
  },
};

function mockLikeSaveApi(): Promise<void> {
  const delay = Math.floor(Math.random() * 500) + 300;
  const shouldFail = Math.random() < 0.15;

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (shouldFail) {
        reject(new Error('Mock request failed'));
      } else {
        resolve();
      }
    }, delay);
  });
}

async function safeGetIds(key: string): Promise<string[]> {
  try {
    const value = await Storage.getItem(key);
    return value ? JSON.parse(value) : [];
  } catch (error) {
    console.log(`Storage read failed for ${key}:`, error);
    return [];
  }
}

async function safeSetIds(key: string, ids: string[]) {
  try {
    await Storage.setItem(key, JSON.stringify(ids));
  } catch (error) {
    console.log(`Storage write failed for ${key}:`, error);
  }
}

function withLocalState(
  apiStories: Story[],
  savedIds: string[],
  likedIds: string[],
): StoryItem[] {
  return apiStories.map(story => ({
    ...story,
    saved: savedIds.includes(story.objectID),
    liked: likedIds.includes(story.objectID),
  }));
}

async function fetchWithTimeout(url: string, timeoutMs = 10000) {
  return Promise.race([
    fetch(url),
    new Promise<Response>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
    }),
  ]);
}

function getDomain(url: string | null) {
  if (!url) {
    return 'Ask HN';
  }

  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'External Link';
  }
}

function formatDate(date: string) {
  try {
    return new Date(date).toLocaleDateString();
  } catch {
    return '';
  }
}

function StoryCard({
  item,
  onOpen,
  onLike,
  onSave,
}: {
  item: StoryItem;
  onOpen: () => void;
  onLike: () => void;
  onSave: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onOpen}
      className="mx-4 mb-4 overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm">
      <View className="p-4">
        <View className="mb-3 flex-row items-center justify-between">
          <View className="rounded-full bg-orange-50 px-3 py-1">
            <Text className="text-xs font-bold text-orange-600">
              {getDomain(item.url)}
            </Text>
          </View>

          <Text className="text-xs text-gray-400">{formatDate(item.created_at)}</Text>
        </View>

        <Text className="text-lg font-extrabold leading-6 text-gray-950">
          {item.title || 'Untitled Story'}
        </Text>

        <Text className="mt-2 text-sm text-gray-500">by {item.author}</Text>

        <View className="mt-4 flex-row flex-wrap gap-2">
          <View className="rounded-full bg-gray-100 px-3 py-1">
            <Text className="text-xs font-semibold text-gray-700">
              ▲ {item.points || 0} points
            </Text>
          </View>

          <View className="rounded-full bg-gray-100 px-3 py-1">
            <Text className="text-xs font-semibold text-gray-700">
              💬 {item.num_comments || 0} comments
            </Text>
          </View>

          {!item.url ? (
            <View className="rounded-full bg-yellow-100 px-3 py-1">
              <Text className="text-xs font-semibold text-yellow-700">
                Text Story
              </Text>
            </View>
          ) : null}
        </View>

        <View className="mt-5 flex-row gap-3">
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={event => {
              event.stopPropagation();
              onLike();
            }}
            className={`flex-1 rounded-2xl px-4 py-3 ${
              item.liked ? 'bg-red-500' : 'bg-gray-100'
            }`}>
            <Text
              className={`text-center text-sm font-bold ${
                item.liked ? 'text-white' : 'text-gray-800'
              }`}>
              {item.liked ? '❤️ Liked' : '🤍 Like'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={event => {
              event.stopPropagation();
              onSave();
            }}
            className={`flex-1 rounded-2xl px-4 py-3 ${
              item.saved ? 'bg-orange-500' : 'bg-gray-100'
            }`}>
            <Text
              className={`text-center text-sm font-bold ${
                item.saved ? 'text-white' : 'text-gray-800'
              }`}>
              {item.saved ? '🔖 Saved' : '📌 Save'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function App() {
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [nbPages, setNbPages] = useState<number | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadingRef = useRef(false);

  useEffect(() => {
    startApp();
  }, []);

  async function startApp() {
    const storedSavedIds = await safeGetIds(SAVED_KEY);
    const storedLikedIds = await safeGetIds(LIKED_KEY);

    setSavedIds(storedSavedIds);
    setLikedIds(storedLikedIds);

    await loadStories(0, true, storedSavedIds, storedLikedIds);
  }

  async function loadStories(
    pageToLoad: number,
    replace = false,
    currentSavedIds = savedIds,
    currentLikedIds = likedIds,
  ) {
    if (loadingRef.current) {
      return;
    }

    if (nbPages !== null && pageToLoad >= nbPages) {
      return;
    }

    try {
      loadingRef.current = true;

      if (replace) {
        setRefreshing(true);
      } else {
        setLoadingMore(true);
      }

      const response = await fetchWithTimeout(
        `${API_URL}&page=${pageToLoad}&hitsPerPage=20`,
      );

      if (!response.ok) {
        throw new Error('Network response failed');
      }

      const data = await response.json();

      const mappedStories = withLocalState(
        data.hits || [],
        currentSavedIds,
        currentLikedIds,
      );

      setStories(prev =>
        replace ? mappedStories : [...prev, ...mappedStories],
      );

      setPage(pageToLoad);
      setNbPages(data.nbPages || null);
    } catch (error) {
      console.log('FETCH ERROR:', error);

      if (stories.length === 0) {
        Alert.alert(
          'Network error',
          'Could not load stories. Please check internet and pull down to refresh.',
        );
      }
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }

  async function handleRefresh() {
    const storedSavedIds = await safeGetIds(SAVED_KEY);
    const storedLikedIds = await safeGetIds(LIKED_KEY);

    setSavedIds(storedSavedIds);
    setLikedIds(storedLikedIds);

    await loadStories(0, true, storedSavedIds, storedLikedIds);
  }

  async function handleLoadMore() {
    if (!loadingMore && !refreshing && !initialLoading) {
      await loadStories(page + 1);
    }
  }

  async function handleOpenStory(story: StoryItem) {
    if (story.url) {
      Linking.openURL(story.url);
      return;
    }

    Alert.alert(
      'No article link',
      story.story_text || 'This story does not have an external URL.',
    );
  }

  async function handleLike(storyId: string) {
    const previousStories = [...stories];
    const previousLikedIds = [...likedIds];

    const isLiked = likedIds.includes(storyId);
    const nextLikedIds = isLiked
      ? likedIds.filter(id => id !== storyId)
      : [...likedIds, storyId];

    setLikedIds(nextLikedIds);
    setStories(prev =>
      prev.map(story =>
        story.objectID === storyId ? {...story, liked: !isLiked} : story,
      ),
    );

    await safeSetIds(LIKED_KEY, nextLikedIds);

    try {
      await mockLikeSaveApi();
    } catch {
      setStories(previousStories);
      setLikedIds(previousLikedIds);
      await safeSetIds(LIKED_KEY, previousLikedIds);

      Alert.alert('Like failed', 'Like was rolled back.');
    }
  }

  async function handleSave(storyId: string) {
    const previousStories = [...stories];
    const previousSavedIds = [...savedIds];

    const isSaved = savedIds.includes(storyId);
    const nextSavedIds = isSaved
      ? savedIds.filter(id => id !== storyId)
      : [...savedIds, storyId];

    setSavedIds(nextSavedIds);
    setStories(prev =>
      prev.map(story =>
        story.objectID === storyId ? {...story, saved: !isSaved} : story,
      ),
    );

    await safeSetIds(SAVED_KEY, nextSavedIds);

    try {
      await mockLikeSaveApi();
    } catch {
      setStories(previousStories);
      setSavedIds(previousSavedIds);
      await safeSetIds(SAVED_KEY, previousSavedIds);

      Alert.alert('Save failed', 'Save was rolled back.');
    }
  }

  if (initialLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-orange-50">
        <StatusBar barStyle="dark-content" backgroundColor="#FFF7ED" />
        <View className="rounded-3xl bg-white px-8 py-7 shadow-sm">
          <ActivityIndicator size="large" color="#F97316" />
          <Text className="mt-4 text-center text-base font-bold text-gray-900">
            Loading Hacker News
          </Text>
          <Text className="mt-1 text-center text-xs text-gray-500">
            Fetching latest stories...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-orange-50">
      <StatusBar barStyle="dark-content" backgroundColor="#FFF7ED" />

      <FlatList
        data={stories}
        keyExtractor={item => item.objectID}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.6}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#F97316"
            colors={['#F97316']}
          />
        }
        ListHeaderComponent={
          <View className="px-4 pb-4 pt-5">
            <View className="overflow-hidden rounded-3xl bg-gray-950 p-5">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-xs font-bold uppercase tracking-widest text-orange-400">
                    Hacker News
                  </Text>
                  <Text className="mt-2 text-3xl font-black text-white">
                    Top Stories
                  </Text>
                </View>

                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-orange-500">
                  <Text className="text-xl font-black text-white">Y</Text>
                </View>
              </View>

              <Text className="mt-3 text-sm leading-5 text-gray-300">
                Fast infinite feed with optimistic like and save actions.
              </Text>

              <View className="mt-5 flex-row gap-2">
                <View className="rounded-full bg-white/10 px-3 py-2">
                  <Text className="text-xs font-bold text-white">
                    {stories.length} loaded
                  </Text>
                </View>

                <View className="rounded-full bg-white/10 px-3 py-2">
                  <Text className="text-xs font-bold text-white">
                    {savedIds.length} saved
                  </Text>
                </View>

                <View className="rounded-full bg-white/10 px-3 py-2">
                  <Text className="text-xs font-bold text-white">
                    {likedIds.length} liked
                  </Text>
                </View>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View className="mx-4 rounded-3xl bg-white px-6 py-14">
            <Text className="text-center text-lg font-black text-gray-900">
              No stories loaded
            </Text>
            <Text className="mt-2 text-center text-sm text-gray-500">
              Pull down to refresh and try again.
            </Text>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View className="py-6">
              <ActivityIndicator color="#F97316" />
              <Text className="mt-2 text-center text-xs font-semibold text-gray-500">
                Loading more stories...
              </Text>
            </View>
          ) : (
            <View className="py-4" />
          )
        }
        renderItem={({item}) => (
          <StoryCard
            item={item}
            onOpen={() => handleOpenStory(item)}
            onLike={() => handleLike(item.objectID)}
            onSave={() => handleSave(item.objectID)}
          />
        )}
      />
    </SafeAreaView>
  );
}