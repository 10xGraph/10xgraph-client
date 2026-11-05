/**
 * Filter types shared by `threads()`, `searchMemory()`, `listMemories()` and `forgetMemories()`.
 *
 * A filter is `{ column: value }` (equality) or `{ column: { op: value, ... } }`. The server
 * validates column names and value types and answers 422 for a bad filter, so the client does
 * not check them.
 */

/** Operator names the server accepts inside a filter condition. */
export type FilterOperator =
  'eq' | 'ne' | 'in' | 'nin' | 'like' | 'ilike' | 'is_null' | 'gt' | 'gte' | 'lt' | 'lte';

/** A plain value a column can be compared with. Timestamps are ISO 8601 strings. */
export type FilterScalar = string | number | boolean;

/** Operators for one column. Combine several to AND them, e.g. `{ gte: 1, lt: 10 }`. */
export interface FilterCondition {
  eq?: FilterScalar;
  ne?: FilterScalar;
  gt?: FilterScalar;
  gte?: FilterScalar;
  lt?: FilterScalar;
  lte?: FilterScalar;
  like?: string;
  ilike?: string;
  in?: FilterScalar[];
  nin?: FilterScalar[];
  is_null?: boolean;
}

/** Column name to equality value or condition. */
export type Filters = Record<string, FilterScalar | FilterCondition>;
