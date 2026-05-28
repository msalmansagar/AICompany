const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../shared');

const config = getDefaultConfig(projectRoot);

// Watch the shared local package for changes
config.watchFolders = [sharedRoot];

// Resolve @qdb/form-engine-shared from its source
config.resolver.extraNodeModules = {
  '@qdb/form-engine-shared': sharedRoot,
};

module.exports = config;
