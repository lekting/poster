export async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const cap = Math.max(1, Math.floor(concurrency));
  const results: R[] = new Array(items.length);
  const errors: Array<{ index: number; error: unknown }> = [];
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(cap, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++;

        if (index >= items.length) return;

        try {
          results[index] = await handler(items[index], index);
        } catch (err) {
          errors.push({ index, error: err });
        }
      }
    }
  );

  await Promise.all(workers);

  if (errors.length > 0) {
    const first = errors[0];
    throw new AggregateError(
      errors.map((e) => e.error),
      `${errors.length} of ${items.length} tasks failed (first failure at index ${first.index})`
    );
  }

  return results;
}
