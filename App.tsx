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
      <SafeAreaView className="flex-1 items-center justify-center bg-gray-100">
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" />
        <Text className="mt-3 text-gray-600">Loading Hacker News...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-100">
      <StatusBar barStyle="dark-content" />

      <View className="px-4 pb-3 pt-4">
        <Text className="text-3xl font-extrabold text-gray-950">
          Hacker News
        </Text>
        <Text className="mt-1 text-sm text-gray-500">
          Infinite feed with optimistic like and save actions
        </Text>
      </View>

      <FlatList
        data={stories}
        keyExtractor={item => item.objectID}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.6}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={true}
        ListEmptyComponent={
          <View className="px-6 py-20">
            <Text className="text-center text-lg font-bold text-gray-800">
              No stories loaded
            </Text>
            <Text className="mt-2 text-center text-sm text-gray-500">
              Pull down to refresh.
            </Text>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View className="py-5">
              <ActivityIndicator />
              <Text className="mt-2 text-center text-xs text-gray-500">
                Loading more stories...
              </Text>
            </View>
          ) : null
        }
        renderItem={({item}) => (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => handleOpenStory(item)}
            className="mx-4 mb-3 rounded-2xl border border-gray-200 bg-white p-4">
            <Text className="text-base font-bold text-gray-900">
              {item.title || 'Untitled Story'}
            </Text>

            <Text className="mt-2 text-xs text-gray-500">
              by {item.author} • {item.points || 0} points •{' '}
              {item.num_comments || 0} comments
            </Text>

            <View className="mt-4 flex-row gap-3">
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleLike(item.objectID)}
                className={`rounded-xl px-4 py-2 ${
                  item.liked ? 'bg-red-100' : 'bg-gray-100'
                }`}>
                <Text
                  className={item.liked ? 'text-red-600' : 'text-gray-700'}>
                  {item.liked ? '❤️ Liked' : '🤍 Like'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleSave(item.objectID)}
                className={`rounded-xl px-4 py-2 ${
                  item.saved ? 'bg-blue-100' : 'bg-gray-100'
                }`}>
                <Text
                  className={item.saved ? 'text-blue-700' : 'text-gray-700'}>
                  {item.saved ? '🔖 Saved' : '📌 Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}