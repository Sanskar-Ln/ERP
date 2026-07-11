/**
 * OpenAPI helpers bridging zod → Swagger.
 *
 * We validate with zod (shared schemas), not class-validator DTO classes,
 * so Swagger cannot introspect body shapes on its own. `ApiZodBody`
 * converts the zod schema to JSON Schema and attaches it to the route's
 * OpenAPI definition, keeping /api/docs accurate for every endpoint.
 */
import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';

/** Document a request body from a zod schema. */
export function ApiZodBody(schema: ZodTypeAny): MethodDecorator {
  // zod-to-json-schema's return type recursion trips TS2589 on complex
  // schemas; the runtime output is plain JSON Schema, so cast via unknown.
  const jsonSchema = zodToJsonSchema(schema as never, { target: 'openApi3' }) as unknown as SchemaObject;
  return applyDecorators(ApiBody({ schema: jsonSchema }));
}

/** Document a single query parameter from a zod schema. */
export function ApiZodQuery(name: string, schema: ZodTypeAny, required = false): MethodDecorator {
  const jsonSchema = zodToJsonSchema(schema as never, { target: 'openApi3' }) as unknown as SchemaObject;
  return applyDecorators(ApiQuery({ name, required, schema: jsonSchema }));
}
