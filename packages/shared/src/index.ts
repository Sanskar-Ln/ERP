/**
 * @erp/shared — the single source of truth for types, enums, zod schemas
 * and money/weight fixed-point math, consumed by the API, web admin and
 * mobile app. See README.md for the package's responsibilities.
 */
export * from './enums';
export * from './ids';
export * from './money';
export * from './weight';
export * from './schemas/common';
export * from './schemas/auth';
export * from './schemas/master-data';
export * from './schemas/inventory';
export * from './schemas/tagging';
export * from './schemas/billing';
export * from './schemas/orders';
