import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Fantasy Markets",
  slug: "fantasy-markets",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  scheme: "fantasymarkets",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#0D0D0D",
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.pull.fantasymarkets",
    buildNumber: "1",
    config: {
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      NSCameraUsageDescription: "Used for profile photos",
      NSPhotoLibraryUsageDescription: "Used for profile photos",
      UIBackgroundModes: ["remote-notification", "fetch"],
    },
    associatedDomains: [
      "applinks:fantasy.pull.app",
      "webcredentials:fantasy.pull.app",
    ],
    entitlements: {
      "aps-environment": "production",
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0D0D0D",
    },
    package: "com.pull.fantasymarkets",
    versionCode: 1,
    permissions: [
      "CAMERA",
      "READ_EXTERNAL_STORAGE",
      "VIBRATE",
      "INTERNET",
      "ACCESS_NETWORK_STATE",
    ],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "fantasy.pull.app", pathPrefix: "/league" },
          { scheme: "https", host: "fantasy.pull.app", pathPrefix: "/market" },
          { scheme: "https", host: "fantasy.pull.app", pathPrefix: "/invite" },
          { scheme: "https", host: "fantasy.pull.app", pathPrefix: "/player" },
          { scheme: "https", host: "fantasy.pull.app", pathPrefix: "/draft" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#10B981",
        defaultChannel: "default",
        sounds: ["./assets/sounds/draft_pick.wav"],
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          compileSdkVersion: 34,
          targetSdkVersion: 34,
          buildToolsVersion: "34.0.0",
        },
        ios: {
          deploymentTarget: "15.0",
        },
      },
    ],
    "expo-secure-store",
    "expo-haptics",
    "expo-linking",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001",
    wsUrl: process.env.EXPO_PUBLIC_WS_URL || "ws://localhost:3001/ws",
    matrixHomeserver: process.env.EXPO_PUBLIC_MATRIX_HOMESERVER || "http://localhost:8008",
    eas: {
      projectId: process.env.EAS_PROJECT_ID || "your-project-id",
    },
  },
  updates: {
    url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID || "your-project-id"}`,
    fallbackToCacheTimeout: 30000,
  },
  runtimeVersion: {
    policy: "sdkVersion",
  },
});
