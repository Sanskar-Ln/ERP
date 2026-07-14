/**
 * React Native CLI config (bare workflow).
 *
 * `assets` lists folders whose files are linked into the native projects
 * by `npx react-native-asset` — here the bundled .ttf fonts, which land in
 * android/app/src/main/assets/fonts and are registered in the iOS
 * Info.plist (UIAppFonts). Run `npx react-native-asset` after install and
 * again whenever fonts change. See README "Fonts" for how family names map.
 */
module.exports = {
  project: {
    ios: {},
    android: {},
  },
  assets: ['./assets/fonts'],
};
