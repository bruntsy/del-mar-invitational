/**
 * A tiny Supabase test double. Routes results by table name and supports the
 * subset of the query builder the stores use (`insert/update/select/eq/order/
 * limit/in` chained into `single`/`maybeSingle` or awaited directly).
 *
 * Usage inside a hoisted `vi.mock` factory requires a `mock`-prefixed binding,
 * e.g. `const mockDb = createMockSupabase()`.
 */
export interface MockResult {
  data: unknown;
  error: unknown;
}

export function createMockSupabase() {
  const results = new Map<string, MockResult>();

  function chain(table: string) {
    const resolve = () => Promise.resolve(results.get(table) ?? { data: null, error: null });
    const builder: Record<string, unknown> = {};
    for (const method of ['insert', 'update', 'select', 'eq', 'order', 'limit', 'in']) {
      builder[method] = () => builder;
    }
    builder.single = resolve;
    builder.maybeSingle = resolve;
    builder.then = (onFulfilled: unknown, onRejected: unknown) =>
      resolve().then(onFulfilled as never, onRejected as never);
    return builder;
  }

  return {
    client: { from: (table: string) => chain(table) },
    /** Program the next response for queries against `table`. */
    set(table: string, result: MockResult) {
      results.set(table, result);
    },
    reset() {
      results.clear();
    },
  };
}
