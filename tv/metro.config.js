const fs = require('fs');
const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * The TV app lives outside the npm workspaces on purpose (React Native
 * tooling dislikes hoisted node_modules) and reaches the shared caption
 * packages through Metro: watchFolders lets Metro see them, and
 * extraNodeModules resolves their names. react and react-native are
 * pinned to this app's node_modules so there is never a duplicate React.
 *
 * Windows note: native (CMake) builds hit the 260-character MAX_PATH
 * limit under this repo's long path, so Gradle runs from a subst drive
 * (X: -> the repo). Node realpaths X: back to C:, which would put every
 * resolved file outside Metro's watch roots; watching the REAL repo root
 * (realpathSync) covers both spellings.
 */
const repoRoot = fs.realpathSync(path.resolve(__dirname, '..'));
const appRoot = fs.realpathSync(__dirname);

/**
 * Exactly one React: the shared packages sit under the repo root, whose
 * own node_modules carries the web app's React. Node-style upward
 * resolution would find that copy and crash hooks with a duplicate
 * React, so the parent copies are blocklisted (invisible to Metro) and
 * extraNodeModules routes those names to this app's node_modules.
 */
const escapeForRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blockParent = name =>
  new RegExp(
    `${escapeForRegex(path.join(repoRoot, 'node_modules', name) + path.sep)}.*`,
  );

/**
 * NodeNext import specifiers, resolved for Metro.
 *
 * The shared packages are written for NodeNext, so their own relative
 * imports carry a `.js` extension that points at a `.tsx` file on disk:
 * `packages/digits-in-noise/src/native.tsx` imports
 * `./index.js`. Node and tsc both require that spelling. Metro takes it
 * literally, finds no `src/index.js`, and fails the bundle.
 *
 * This went unnoticed for three days and is the most expensive kind of
 * bug this repo can have. The release variant ships a hand-generated
 * bundle (see android/app/build.gradle), that file is not tracked by
 * git, and Gradle has no task that regenerates it. So nothing rebuilt
 * the bundle after the commit that added those extensions, the published
 * APK kept working because its JavaScript predated the change, and the
 * Fire TV app quietly became impossible to build from its own source.
 *
 * Retrying without the extension is enough: Metro then applies its
 * normal sourceExts search and finds the .tsx.
 */
const resolveNodeNextExtension = (context, moduleName, platform) => {
  if (/^\.{1,2}\/.*\.js$/.test(moduleName)) {
    try {
      return context.resolveRequest(context, moduleName.replace(/\.js$/, ''), platform);
    } catch {
      // Fall through: a real .js file may genuinely be what was meant.
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

const config = {
  watchFolders: [repoRoot],
  resolver: {
    resolveRequest: resolveNodeNextExtension,
    blockList: [
      blockParent('react'),
      blockParent('react-dom'),
      blockParent('react-native'),
    ],
    extraNodeModules: {
      '@earshot/core': path.join(repoRoot, 'packages', 'earshot-core'),
      'digits-in-noise': path.join(repoRoot, 'packages', 'digits-in-noise'),
      react: path.join(appRoot, 'node_modules', 'react'),
      'react-native': path.join(appRoot, 'node_modules', 'react-native'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
