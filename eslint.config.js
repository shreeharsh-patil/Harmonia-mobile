const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['.expo/**', 'dist/**', 'node_modules/**'],
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
