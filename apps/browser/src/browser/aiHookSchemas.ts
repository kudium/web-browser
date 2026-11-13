/* eslint-disable import/no-relative-packages */
import {
  actionContexts,
  actionPermissions,
} from '../../../../packages/hooks/actions';

export const hookActionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'contexts', 'source'],
  properties: {
    id: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,100}$' },
    name: { type: 'string', minLength: 1, maxLength: 120 },
    contexts: {
      type: 'array',
      minItems: 1,
      maxItems: 5,
      uniqueItems: true,
      items: { type: 'string', enum: [...actionContexts] },
    },
    source: { type: 'string', maxLength: 20000 },
    permissions: {
      type: 'array',
      maxItems: actionPermissions.length,
      uniqueItems: true,
      items: { type: 'string', enum: [...actionPermissions] },
      description: 'Legacy compatibility only; omit for new actions.',
    },
  },
};
export const hookSitesSchema = {
  type: 'array',
  maxItems: 20,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['host', 'includeSubdomains'],
    properties: {
      host: {
        type: 'string',
        maxLength: 253,
        pattern:
          '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$',
      },
      includeSubdomains: { type: 'boolean' },
    },
  },
};
export const authoringHookSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'enabled', 'path', 'before', 'after', 'css'],
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      pattern: '^(?!global:).+',
    },
    name: { type: 'string', minLength: 1, maxLength: 120 },
    enabled: { type: 'boolean' },
    path: {
      type: 'string',
      pattern: '^/',
      maxLength: 500,
      description: 'Pathname glob; /* matches all paths. Query/hash ignored.',
    },
    before: { type: 'string', maxLength: 20000 },
    after: { type: 'string', maxLength: 20000 },
    css: { type: 'string', maxLength: 20000 },
    actions: { type: 'array', maxItems: 20, items: hookActionSchema },
    sites: hookSitesSchema,
    testUrl: { type: 'string', maxLength: 4096, pattern: '^https?://' },
    exclusions: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'string',
        maxLength: 253,
        pattern: '^(\\*\\.)?[a-z0-9.-]+$',
      },
    },
  },
};
const { exclusions: _globalExclusions, ...siteHookProperties } =
  authoringHookSchema.properties;
export const siteHookSchema = {
  ...authoringHookSchema,
  properties: siteHookProperties,
};
const sampleField = {
  type: 'object',
  additionalProperties: false,
  required: [
    'key',
    'type',
    'label',
    'name',
    'id',
    'placeholder',
    'autocomplete',
    'required',
  ],
  properties: {
    key: { type: 'string', minLength: 1, maxLength: 100 },
    type: { type: 'string', maxLength: 40 },
    label: { type: 'string', maxLength: 2000 },
    name: { type: 'string', maxLength: 200 },
    id: { type: 'string', maxLength: 200 },
    placeholder: { type: 'string', maxLength: 2000 },
    autocomplete: { type: 'string', maxLength: 200 },
    required: { type: 'boolean' },
    maxLength: { type: 'integer', minimum: 0, maximum: 100000 },
    minLength: { type: 'integer', minimum: 0, maximum: 100000 },
    pattern: { type: 'string', maxLength: 1000 },
    value: { type: 'string', maxLength: 10000 },
  },
};
export const hookSampleSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['url', 'title'],
  properties: {
    url: { type: 'string', maxLength: 4096, pattern: '^https?://' },
    title: { type: 'string', maxLength: 2000 },
    selection: { type: 'string', maxLength: 30000 },
    pageText: { type: 'string', maxLength: 100000 },
    link: { type: 'string', maxLength: 4096 },
    field: sampleField,
    form: {
      type: 'object',
      additionalProperties: false,
      required: ['fields'],
      properties: {
        fields: { type: 'array', maxItems: 50, items: sampleField },
      },
    },
  },
};

/** The same bounded schema check for provider calls and external MCP arguments. */
export function validateHookSchema(schema: any, value: unknown, path = 'hook') {
  if (schema.anyOf) {
    if (
      schema.anyOf.some((option: any) => {
        try {
          validateHookSchema(option, value, path);
          return true;
        } catch {
          return false;
        }
      })
    )
      return;
    throw new Error(`Invalid ${path}.`);
  }
  const fail = () => {
    throw new Error(`Invalid ${path}.`);
  };
  if (schema.type === 'null') {
    if (value !== null) fail();
    return;
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
    const object = value as Record<string, unknown>;
    if (
      schema.maxProperties !== undefined &&
      Object.keys(object).length > schema.maxProperties
    )
      fail();
    for (const required of schema.required || [])
      if (object[required] === undefined) fail();
    for (const [key, item] of Object.entries(object)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) fail();
      const property = schema.properties?.[key];
      if (property) validateHookSchema(property, item, `${path}.${key}`);
      else if (schema.additionalProperties === false) fail();
      else if (typeof schema.additionalProperties === 'object')
        validateHookSchema(schema.additionalProperties, item, `${path}.${key}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) fail();
    const array = value as unknown[];
    if (
      array.length < (schema.minItems || 0) ||
      array.length > (schema.maxItems ?? Infinity)
    )
      fail();
    if (
      schema.uniqueItems &&
      new Set(array.map((item) => JSON.stringify(item))).size !== array.length
    )
      fail();
    array.forEach((item, index) =>
      validateHookSchema(schema.items, item, `${path}[${index}]`)
    );
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') fail();
    const text = value as string;
    if (
      text.length < (schema.minLength || 0) ||
      text.length > (schema.maxLength ?? Infinity) ||
      (schema.pattern && !new RegExp(schema.pattern).test(text))
    )
      fail();
  } else if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') fail();
  } else if (schema.type === 'integer') {
    if (
      !Number.isInteger(value) ||
      Number(value) < (schema.minimum ?? -Infinity) ||
      Number(value) > (schema.maximum ?? Infinity)
    )
      fail();
  }
  if (schema.enum && !schema.enum.includes(value)) fail();
}
