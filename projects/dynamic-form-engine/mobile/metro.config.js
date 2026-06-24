const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../shared');

const config = getDefaultConfig(projectRoot);

// Watch the shared local package for changes
config.watchFolders = [sharedRoot];

config.resolver.extraNodeModules = {
  '@qdb/shared': sharedRoot,
};

// Force every require('react') / require('react-dom') anywhere in the bundle
// — including inside react-dom's own CJS files — to the single copy in this
// workspace. Uses require.resolve so Node handles exports maps and extensions
// correctly, preventing the monorepo root's newer React from being picked up.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === 'react' || moduleName.startsWith('react/') ||
    moduleName === 'react-dom' || moduleName.startsWith('react-dom/')
  ) {
    try {
      return {
        filePath: require.resolve(moduleName, { paths: [projectRoot] }),
        type: 'sourceFile',
      };
    } catch {
      // fall through to default resolution
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
