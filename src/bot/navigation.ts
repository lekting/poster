import type { BotSession, NavEntry, ScreenId } from './session.js';

const MAX_DEPTH = 6;

export function pushScreen(
  session: BotSession,
  screen: ScreenId,
  params?: Record<string, string>,
): void {
  if (session.navStack.length >= MAX_DEPTH) session.navStack.shift();
  session.navStack.push({ screen, params });
}

export function popScreen(session: BotSession): NavEntry {
  if (session.navStack.length > 1) session.navStack.pop();
  return session.navStack[session.navStack.length - 1] ?? { screen: 'main' };
}

export function currentScreen(session: BotSession): NavEntry {
  return session.navStack[session.navStack.length - 1] ?? { screen: 'main' };
}

export function resetNav(session: BotSession): void {
  session.navStack = [{ screen: 'main' }];
  session.inputFlow = null;
}

export function clearFlow(session: BotSession): void {
  session.inputFlow = null;
}
