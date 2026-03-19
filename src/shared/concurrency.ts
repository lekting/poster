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
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(cap, items.length) },
    async () => {
      while (true) {
        const index = cursor;
        cursor += 1;

        if (index >= items.length) {
          return;
        }

        results[index] = await handler(items[index], index);
      }
    }
  );

  await Promise.all(workers);
  return results;
}
