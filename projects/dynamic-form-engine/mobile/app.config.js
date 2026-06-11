// eslint-disable-next-line @typescript-eslint/no-require-imports
const base = require('./app.json');

// Override apiBaseUrl at dev-time by setting API_BASE_URL environment variable:
//   API_BASE_URL=http://192.168.x.x:4000 npx expo start
// Useful when moving between networks (home ↔ office) without editing app.json.
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
