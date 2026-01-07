/**
 * Custom Constructs Index
 * 
 * Architectural Decision: Providing a barrel export file for all custom constructs
 * following ADR-005. This enables cleaner imports in the main stack and makes it
 * easier to discover available constructs.
 * 
 * Instead of:
 *   import { StorageConstruct } from './constructs/storage-construct';
 *   import { DatabaseConstruct } from './constructs/database-construct';
 * 
 * You can now use:
 *   import { StorageConstruct, DatabaseConstruct } from './constructs';
 */

export { StorageConstruct } from './storage-construct';
export { DatabaseConstruct } from './database-construct';
export { ProcessingConstruct } from './processing-construct';
export type { ProcessingProps } from './processing-construct';
export { ApiConstruct } from './api-construct';
export type { ApiProps } from './api-construct';
