/**
 * Decodes the qdb_runtime_json column from qdb_form_render_cache rows.
 * The column stores Base64(gzip(runtime-JSON)), matching the format produced by the
 * DFE C# publish plugin (confirmed in RENDER-CACHE-SCHEMA.md).
 *
 * @module regression-gate/lib/decode
 */
import { gunzipSync } from 'node:zlib';

/**
 * Decodes a Base64-encoded gzip-compressed render-cache JSON blob.
 * Throws with a clear, specific message on any corruption — never returns a
 * partial result that could masquerade as a successful decode.
 *
 * @param {string} base64GzippedJson - The value of qdb_runtime_json from Dataverse.
 * @returns {unknown} The parsed runtime JSON object.
 * @throws {Error} If the payload is empty, not a string, corrupt, or not valid JSON.
 */
export function decodeRenderCacheJson(base64GzippedJson) {
  if (typeof base64GzippedJson !== 'string' || base64GzippedJson.length === 0) {
    throw new Error('decodeRenderCacheJson: payload is empty or not a string');
  }

  const buffer = decodeBase64(base64GzippedJson);
  const decompressed = decompressGzip(buffer);
  return parseJson(decompressed);
}

/**
 * @param {string} base64
 * @returns {Buffer}
 */
function decodeBase64(base64) {
  try {
    return Buffer.from(base64, 'base64');
  } catch (err) {
    throw new Error(`decodeRenderCacheJson: Base64 decode failed — ${err.message}`);
  }
}

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function decompressGzip(buffer) {
  try {
    return gunzipSync(buffer).toString('utf8');
  } catch (err) {
    throw new Error(`decodeRenderCacheJson: gzip decompress failed — ${err.message}`);
  }
}

/**
 * @param {string} text
 * @returns {unknown}
 */
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`decodeRenderCacheJson: JSON parse failed — ${err.message}`);
  }
}
