/**
 * Application-generated identifiers.
 *
 * ARCHITECTURE RULE: every primary key in the system is a UUIDv4 minted in
 * the application layer (here), never a DB sequence. This keeps identity
 * generation location-independent so future offline mobile clients can
 * create records locally and sync without renumbering.
 */
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';

/** Mint a new UUIDv4 entity id. */
export const newId = (): string => uuidv4();

/** Runtime check that a string is a valid UUID (any version). */
export const isUuid = (value: string): boolean => uuidValidate(value);
