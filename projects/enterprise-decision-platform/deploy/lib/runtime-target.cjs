'use strict';
// The single place the deploy tooling learns which runtime assembly is active and which is
// retired. Everything is read from registration/rule-engine-registration.json so that the
// assembly identity is stated once, not repeated across scripts that then drift apart.

const path = require('path');

const CONTRACT_PATH = path.join(__dirname, '..', 'registration', 'rule-engine-registration.json');
const ALLOW_LEGACY_ENV = 'EDP_ALLOW_LEGACY_SIGNED_REGISTRATION';

/** Read the runtime section of the registration contract. */
function loadRuntimeTargets() {
  return require(CONTRACT_PATH).runtime;
}

const { active, legacy } = loadRuntimeTargets();

/** Name of the active cloud runtime assembly (the plug-in package assembly). */
const ACTIVE_ASSEMBLY_NAME = active.assemblyName;

/** Name of the retired signed assembly (kept for rollback and for the on-prem build). */
const LEGACY_ASSEMBLY_NAME = legacy.assemblyName;

/**
 * Stop a legacy registration script unless the operator has explicitly opted in.
 *
 * Why: the pre-A7 scripts upload an ILRepacked DLL into the signed assembly and bind Custom
 * APIs to its plugin types. Run as routine after A7, they would quietly move the cloud
 * runtime back to 1.0.23. The manifest-driven tools (a7-metadata.mjs, a7-repoint.mjs)
 * replace them for cloud. The opt-in exists for a deliberate rollback, never by default.
 */
function assertLegacySignedRegistrationAllowed(scriptName) {
  if (process.env[ALLOW_LEGACY_ENV] === '1') {
    console.warn(`[${scriptName}] ${ALLOW_LEGACY_ENV}=1 — writing to the RETIRED signed assembly '${LEGACY_ASSEMBLY_NAME}'.`);
    return;
  }
  throw new Error(
    `[${scriptName}] refused: this script registers against the retired signed assembly ` +
    `'${LEGACY_ASSEMBLY_NAME}'. The active cloud runtime is '${ACTIVE_ASSEMBLY_NAME}' (ADR-18). ` +
    `Use deploy/a7-metadata.mjs and deploy/a7-repoint.mjs. For a deliberate rollback only, set ${ALLOW_LEGACY_ENV}=1.`);
}

module.exports = {
  ACTIVE_ASSEMBLY_NAME,
  LEGACY_ASSEMBLY_NAME,
  ALLOW_LEGACY_ENV,
  assertLegacySignedRegistrationAllowed,
};
