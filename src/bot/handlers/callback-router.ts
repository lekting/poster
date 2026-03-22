import type { AppContext } from '../context.js';

type CallbackHandler = (ctx: AppContext, param: string) => Promise<void>;

interface Route {
  prefix: string;
  handler: CallbackHandler;
}

const routes: Route[] = [];

/**
 * Register a callback-query handler for a given prefix.
 * When data === prefix or data starts with `prefix:`, the handler fires
 * with the remainder after the colon (or '' if exact match).
 */
export function onCallback(prefix: string, handler: CallbackHandler): void {
  routes.push({ prefix, handler });
}

/**
 * Dispatch a callback query to the first matching route.
 * Returns true if handled.
 */
export async function routeCallback(ctx: AppContext, data: string): Promise<boolean> {
  for (const { prefix, handler } of routes) {
    if (data === prefix) {
      await handler(ctx, '');
      return true;
    }
    if (data.startsWith(prefix + ':')) {
      await handler(ctx, data.slice(prefix.length + 1));
      return true;
    }
  }
  return false;
}
