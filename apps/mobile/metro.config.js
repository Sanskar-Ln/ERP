const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration — bare React Native inside a pnpm monorepo.
 *
 * Two things the default config doesn't know about here:
 * 1. `@erp/shared` lives at ../../packages/shared, outside this app — so
 *    Metro must WATCH the workspace root to see it.
 * 2. pnpm installs into a symlinked, non-flat node_modules — so Metro must
 *    be allowed to resolve modules from BOTH this package's node_modules
 *    and the workspace root's, and to follow symlinks.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = {
  // watch the whole monorepo so changes to packages/shared hot-reload
  watchFolders: [workspaceRoot],
  resolver: {
    // resolve deps from this app first, then the hoisted workspace root
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    // pnpm uses symlinks; Metro must follow them
    unstable_enableSymlinks: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
