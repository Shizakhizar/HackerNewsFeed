package com.hackernewsfeed;

import android.content.SharedPreferences;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class LocalStorageModule extends ReactContextBaseJavaModule {
    private static final String PREFS_NAME = "HackerNewsFeedPrefs";
    private final ReactApplicationContext reactContext;

    public LocalStorageModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "LocalStorage";
    }

    @ReactMethod
    public void getItem(String key, Promise promise) {
        try {
            SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, 0);
            String value = prefs.getString(key, null);
            promise.resolve(value);
        } catch (Exception e) {
            promise.reject("GET_ITEM_ERROR", e);
        }
    }

    @ReactMethod
    public void setItem(String key, String value, Promise promise) {
        try {
            SharedPreferences prefs = reactContext.getSharedPreferences(PREFS_NAME, 0);
            prefs.edit().putString(key, value).apply();
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("SET_ITEM_ERROR", e);
        }
    }
}