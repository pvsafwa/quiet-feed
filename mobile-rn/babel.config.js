module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Must be listed LAST. Reanimated 4 moved this plugin into react-native-worklets;
    // the old react-native-reanimated/plugin path is now only a re-export shim.
    plugins: ['react-native-worklets/plugin'],
  };
};
