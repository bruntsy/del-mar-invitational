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
  const operations: Array<{ table: string; method: string; args: unknown[] }> = [];
  const channels = new Map<string, { callback?: (payload: unknown) => void; subscribed: boolean }>();

  function chain(table: string) {
    const resolve = () => Promise.resolve(results.get(table) ?? { data: null, error: null });
    const builder: Record<string, unknown> = {};
    for (const method of ['insert', 'update', 'select', 'eq', 'order', 'limit', 'in']) {
      builder[method] = (...args: unknown[]) => {
        operations.push({ table, method, args });
        return builder;
      };
    }
    builder.single = resolve;
    builder.maybeSingle = resolve;
    builder.then = (onFulfilled: unknown, onRejected: unknown) =>
      resolve().then(onFulfilled as never, onRejected as never);
    return builder;
  }

  return {
    client: {
      from: (table: string) => chain(table),
      channel: (name: string) => {
        const channel = { callback: undefined as ((payload: unknown) => void) | undefined, subscribed: false };
        channels.set(name, channel);
        return {
          on: (_type: string, _filter: unknown, callback: (payload: unknown) => void) => {
            channel.callback = callback;
            return {
              subscribe: () => {
                channel.subscribed = true;
                return channel;
              },
            };
          },
        };
      },
      removeChannel: (channel: unknown) => {
        let removed = false;
        for (const [name, value] of channels.entries()) {
          if (value === channel) {
            channels.delete(name);
            removed = true;
          }
        }
        if (!removed && channels.size === 1) channels.clear();
      },
    },
    /** Program the next response for queries against `table`. */
    set(table: string, result: MockResult) {
      results.set(table, result);
    },
    operations,
    emit(channelName: string, payload: unknown) {
      channels.get(channelName)?.callback?.(payload);
    },
    hasChannel(channelName: string) {
      return channels.has(channelName);
    },
    reset() {
      results.clear();
      operations.splice(0);
      channels.clear();
    },
  };
}
