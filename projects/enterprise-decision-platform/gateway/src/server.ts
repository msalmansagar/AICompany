import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { DataverseRuntime } from './dataverseRuntime.js';

/** Process entry point: wire the real Dataverse runtime and start listening. */
async function main(): Promise<void> {
  const config = loadConfig();
  if (config.apiKeys.length === 0) {
    // eslint-disable-next-line no-console
    console.warn('[edp-gateway] No EDP_GATEWAY_API_KEYS configured — caller authentication is DISABLED (dev only).');
  }
  const app = buildApp({ config, runtime: new DataverseRuntime(config.dataverse) });
  await app.listen({ port: config.port, host: '0.0.0.0' });
  // eslint-disable-next-line no-console
  console.log(`[edp-gateway] listening on :${config.port}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[edp-gateway] failed to start', error);
  process.exit(1);
});
