import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mydigitalgarden.app',
  appName: 'My Garden',
  webDir: 'dist/public',

  // -------------------------------------------------------------------------
  // iOS-specific configuration
  // -------------------------------------------------------------------------
  ios: {
    // Allow the WKWebView to scroll; the app manages its own scroll areas
    scrollEnabled: true,
    // Prevents white flash on launch
    backgroundColor: '#F9F4EE',
    // Allow inline media playback (used for wardrobe image previews)
    allowsInlineMediaPlayback: true,
    infoPlist: {
      // Required to access the device camera
      NSCameraUsageDescription:
        'My Garden uses the camera so you can photograph clothing items to add to your wardrobe.',
      // Required to read photos from the library
      NSPhotoLibraryUsageDescription:
        'My Garden reads your photo library so you can pick existing clothing photos to add to your wardrobe.',
      // Required when a camera capture is saved back to the photo library
      NSPhotoLibraryAddUsageDescription:
        'My Garden saves photos you capture to your photo library.',
    },
  },

  plugins: {
    // Keep the splash screen visible until the React app signals it is ready
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: '#F9F4EE',
      iosSpinnerStyle: 'small',
      showSpinner: false,
    },

    // Overlay the status bar so the cream background shows through the notch
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#F9F4EE',
      overlaysWebView: true,
    },
  },
};

export default config;
