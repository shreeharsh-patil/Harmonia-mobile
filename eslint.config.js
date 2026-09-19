const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['.expo/**', 'dist/**', 'node_modules/**'],
    settings: {
      // Expo native modules ship their entry point in package.json. Keep the
      // import resolver aware of normal Node package entries as well as TS
      // files so expo-updates is linted like the rest of the runtime.
      'import/resolver': {
        node: { extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'] },
      },
    },
    rules: {
      // These compiler-oriented rules reject intentional React Native patterns
      // used throughout the app: synchronizing async native state in effects
      // and keeping the latest event values in refs. The hooks correctness
      // rules (rules-of-hooks and exhaustive-deps) remain enabled.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
    },
  },
]);
