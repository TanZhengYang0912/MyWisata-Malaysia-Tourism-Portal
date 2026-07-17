'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type ChatPresenceEntry = { key: string; role: 'customer' | 'vendor' };

/**
 * Tracks presence as {key: selfKey, role} on `channelName` and returns
 * everyone currently present (including self) — used to derive per-thread
 * "Online"/"Offline" and per-row online dots from a single shared channel.
 * Pass a null/undefined channelName or selfKey to skip tracking.
 */
export function useChatPresence(channelName: string | null | undefined, selfKey: string | null | undefined, role: 'customer' | 'vendor'): ChatPresenceEntry[] {
  const [present, setPresent] = useState<ChatPresenceEntry[]>([]);

  useEffect(() => {
    if (!channelName || !selfKey) {
      setPresent([]);
      return;
    }
    const supabase = createClient();
    const channel = supabase.channel(channelName, { config: { presence: { key: selfKey } } });

    function sync() {
      const state = channel.presenceState<{ role: 'customer' | 'vendor' }>();
      setPresent(Object.entries(state).map(([key, entries]) => ({ key, role: entries[0]?.role ?? role })));
    }

    channel
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ role });
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelName, selfKey, role]);

  return present;
}
