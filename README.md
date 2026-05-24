# Hacker News Feed - React Native 

## Overview

This is a React Native Android app built for a take-home. It displays an infinite-scrolling feed of Hacker News stories using the Hacker News Algolia API.

The app supports optimistic like/save actions, local persistence for saved/liked stories, pull-to-refresh, opening article links, and graceful handling for stories without URLs.

## Tech Stack

- React Native Bare CLI
- TypeScript
- NativeWind
- Android
- Hacker News Algolia API
- Android SharedPreferences through a small native module for local persistence

## Features

- Loads Hacker News stories on app launch
- Infinite scrolling feed
- Pull-to-refresh
- Tap story to open article URL
- Graceful handling for stories with null URL
- Optimistic Like action
- Optimistic Save action
- Mock like/save request with random 300–800ms delay
- Mock request fails around 15% of the time
- Rollback on failed like/save request
- Saved and liked states persist after closing and reopening the app

## API Used

```text
https://hn.algolia.com/api/v1/search?tags=story&page={page}&hitsPerPage=20

How to Run Locally
1. Install dependencies
npm install
2. Start Metro
npm start
3. Run on Android

In another terminal:

npx react-native run-android

If the app is already installed, it can be opened with:

adb shell monkey -p com.hackernewsfeed 1
Platform Tested

Tested on Android Emulator:

Pixel 6 AVD
Android 16
Architecture Decisions

The project keeps the app simple and focused on the requirements.

FlatList is used for efficient large-list rendering.
API pagination is handled with local page state.
Like and save use optimistic UI updates for a fast user experience.
A mocked request function simulates real API behavior with delay and failure.
Rollback restores the previous exact UI state if the mocked action fails.
Local persistence is handled using Android SharedPreferences through a small native module because AsyncStorage caused native module issues in the current setup.
Tradeoffs
The app focuses on Android only, as required.
Local persistence is implemented specifically for Android using SharedPreferences.
A separate Saved Stories screen was not added to keep the scope focused.
Refresh may show the same first story because the API can return the same latest feed again.
What I Would Add With More Time
Separate Saved Stories screen
Search/filter support
Better empty/error states
Unit tests for state logic
E2E tests for scroll, refresh, and persistence
Better offline support
More polished animations and UI
AI Assistance

I used ChatGPT to help with setup debugging, architecture planning, NativeWind setup, optimistic update logic, local persistence strategy, and README drafting.

I manually verified the output by testing:

App launch
Feed loading
Infinite scroll
Pull-to-refresh
Opening stories
Like/save optimistic updates
Rollback on mocked failure
Persistence after closing and reopening the app

