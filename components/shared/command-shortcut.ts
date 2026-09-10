import { useSyncExternalStore } from 'react';

export function getCommandShortcutLabel(platform: string | undefined): '⌘K' | 'Ctrl K' {
  return /Mac|iPhone|iPad|iPod/i.test(platform ?? '') ? '⌘K' : 'Ctrl K';
}

export function useCommandShortcutLabel() {
  return useSyncExternalStore(
    () => () => {},
    () => getCommandShortcutLabel(`${navigator.platform} ${navigator.userAgent}`),
    () => 'Ctrl K'
  );
}
