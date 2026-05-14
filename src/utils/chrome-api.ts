import type { Message } from './types';

export function getRuntime(): typeof chrome.runtime | null {
  if (typeof chrome === 'undefined') return null;
  return chrome.runtime ?? null;
}

export function getTabs(): typeof chrome.tabs | null {
  if (typeof chrome === 'undefined') return null;
  return chrome.tabs ?? null;
}

export function getStorage(): typeof chrome.storage.local | null {
  if (typeof chrome === 'undefined') return null;
  return chrome.storage?.local ?? null;
}

export async function sendRuntimeMessage<T = unknown>(message: Message): Promise<T | undefined> {
  const runtime = getRuntime();
  if (!runtime?.sendMessage) return undefined;
  return runtime.sendMessage(message) as Promise<T>;
}

export async function sendTabMessage<T = unknown>(
  tabId: number,
  message: Message
): Promise<T | undefined> {
  const tabs = getTabs();
  if (!tabs?.sendMessage) return undefined;
  return tabs.sendMessage(tabId, message) as Promise<T>;
}
