/**
 * OpenAPI 3.1 description of the Decision Gateway, served at `GET /openapi.json` and rendered
 * at `GET /docs`. Hand-authored to stay legible; kept in step with the routes and Zod schemas.
 */
export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'EDP Decision Gateway',
    version: '0.2.0',
    description:
      'Transport-only REST façade over the Dataverse decision runtime (ADR-EDS-02). The gateway ' +
      'validates the canonical envelope, authenticates callers, and forwards to the qdb_edp_* Custom ' +
      'API — it never executes rules.',
  },
  servers: [{ url: '/', description: 'This gateway' }],
  security: [{ apiKey: [] }],
  tags: [
    { name: 'decisions', description: 'Evaluate, test and explain decisions' },
    { name: 'rules', description: 'Validate and inspect rules' },
    { name: 'rule-sets', description: 'Evaluate governed rule sets' },
    { name: 'system', description: 'Health' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['system'],
        summary: 'Liveness probe',
        security: [],
        responses: { '200': { description: 'OK', content: json({ $ref: '#/components/schemas/Health' }) } },
      },
    },
    '/v1/decisions/evaluate': {
      post: op('decisions', 'Evaluate a decision (durable)', 'EvaluateRequest', 'DecisionResponse'),
    },
    '/v1/decisions/test': {
      post: op('decisions', 'Test a decision (no durable write)', 'EvaluateRequest', 'DecisionResponse'),
    },
    '/v1/decisions/explain': {
      post: op('decisions', 'Explain a past decision by execution-log id', 'ExplainRequest', 'ReadResponse'),
    },
    '/v1/rules/validate': {
      post: op('rules', 'Validate a rule’s structure', 'RuleReadRequest', 'ValidateResponse'),
    },
    '/v1/rules/schema': {
      post: op('rules', 'Get a rule’s input/output schema', 'RuleReadRequest', 'SchemaResponse'),
    },
    '/v1/rules/history': {
      post: op('rules', 'Get a rule’s version history (rule addressed by id or name)', 'RuleReadRequest', 'ReadResponse'),
    },
    '/v1/rule-sets/evaluate': {
      post: op('rule-sets', 'Evaluate a governed rule set', 'EvaluateRuleSetRequest', 'RuleSetResponse'),
    },
  },
  components: {
    securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' } },
    schemas: {
      Health: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } },
      Meta: {
        type: 'object',
        properties: {
          correlationId: { type: 'string' },
          requestId: { type: 'string' },
          executionId: { type: ['string', 'null'] },
          elapsedMs: { type: ['number', 'null'] },
        },
      },
      RuleRef: {
        type: 'object',
        description: 'Address a rule by one of: published version, rule id, or rule name.',
        properties: { versionId: { type: 'string', format: 'uuid' }, id: { type: 'string', format: 'uuid' }, name: { type: 'string' } },
      },
      EvaluateRequest: {
        type: 'object',
        required: ['rule'],
        properties: {
          meta: { type: 'object', properties: { correlationId: { type: 'string' }, source: { type: 'string' } } },
          rule: { $ref: '#/components/schemas/RuleRef' },
          input: { type: 'object', additionalProperties: true, example: { revenue: 1500000 } },
          options: { type: 'object', properties: { includeTrace: { type: 'boolean', default: false } } },
        },
      },
      RuleReadRequest: {
        type: 'object',
        required: ['rule'],
        properties: {
          meta: { type: 'object', properties: { correlationId: { type: 'string' } } },
          rule: { $ref: '#/components/schemas/RuleRef' },
        },
      },
      EvaluateRuleSetRequest: {
        type: 'object',
        required: ['ruleSetId'],
        properties: {
          meta: { type: 'object', properties: { correlationId: { type: 'string' } } },
          ruleSetId: { type: 'string', format: 'uuid' },
          input: { type: 'object', additionalProperties: true },
        },
      },
      ExplainRequest: {
        type: 'object',
        required: ['executionLogId'],
        properties: {
          meta: { type: 'object', properties: { correlationId: { type: 'string' } } },
          executionLogId: { type: 'string', format: 'uuid' },
        },
      },
      DecisionResponse: {
        type: 'object',
        properties: {
          meta: { $ref: '#/components/schemas/Meta' },
          matched: { type: 'boolean' },
          outputs: { type: 'object', additionalProperties: true, example: { creditTier: 'Gold', discount: 15 } },
          trace: {},
          diagnostics: {},
        },
      },
      ValidateResponse: {
        type: 'object',
        properties: { meta: { $ref: '#/components/schemas/Meta' }, valid: { type: 'boolean' }, diagnostics: {} },
      },
      SchemaResponse: {
        type: 'object',
        properties: { meta: { $ref: '#/components/schemas/Meta' }, inputs: {}, outputs: {} },
      },
      RuleSetResponse: {
        type: 'object',
        properties: { meta: { $ref: '#/components/schemas/Meta' }, result: {} },
      },
      ReadResponse: {
        type: 'object',
        properties: { meta: { $ref: '#/components/schemas/Meta' }, result: {} },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          meta: { $ref: '#/components/schemas/Meta' },
          error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } },
        },
      },
    },
  },
} as const;

function json(schema: object): Record<string, unknown> {
  return { 'application/json': { schema } };
}

function op(tag: string, summary: string, requestSchema: string, responseSchema: string): Record<string, unknown> {
  return {
    tags: [tag],
    summary,
    requestBody: { required: true, content: json({ $ref: `#/components/schemas/${requestSchema}` }) },
    responses: {
      '200': { description: 'Success', content: json({ $ref: `#/components/schemas/${responseSchema}` }) },
      '400': { description: 'Invalid request', content: json({ $ref: '#/components/schemas/ErrorResponse' }) },
      '401': { description: 'Unauthorized', content: json({ $ref: '#/components/schemas/ErrorResponse' }) },
      '404': { description: 'Rule not found', content: json({ $ref: '#/components/schemas/ErrorResponse' }) },
      '502': { description: 'Runtime error', content: json({ $ref: '#/components/schemas/ErrorResponse' }) },
    },
  };
}

/** Minimal Swagger-UI page (loads the UI from a CDN — a server may use external assets). */
export const docsHtml = `<!doctype html>
<html><head><meta charset="utf-8"><title>EDP Decision Gateway — API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="app"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>window.onload = () => SwaggerUIBundle({ url: '/openapi.json', dom_id: '#app' });</script>
</body></html>`;
