const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
// Worktrees may share installed dependencies through a symlink.
const fs = require('fs');
const path = require('path');
const dependencies = fs.realpathSync(path.join(__dirname, 'node_modules'));
const config = { watchFolders: [dependencies] };

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
