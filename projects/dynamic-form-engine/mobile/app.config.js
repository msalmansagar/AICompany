// eslint-disable-next-line @typescript-eslint/no-require-imports
const base = require('./app.json');

// Load .env.local if present (create one to avoid editing app.json per network).
// Example .env.local content:
//   API_BASE_URL=http://10.191.163.111:4000   # office
//   API_BASE_URL=http://192.168.1.14:4000     # home
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: '.env.local' });
} catch {
  // dotenv optional — fall through to env var or app.json default
}

// Priority: shell env var > .env.local > app.json hardcoded value
module.exports = {
  ...base,
  expo: {
    ...base.expo,
    extra: {
      ...base.expo.extra,
      apiBaseUrl: process.env.API_BASE_URL ?? base.expo.extra.apiBaseUrl,
    },
  },
};
