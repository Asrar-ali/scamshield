import { useEffect, useRef, useState } from 'react';
import type { Event } from '../types';

/** Live socket health. 'reconnecting' covers the initial connect and any backoff
 * retry after a drop; 'offline' only once retries have been failing for a while. */
export type ConnState = 'connected' | 'reconnecting' | 'offline';

// Reconnect/backoff tuning. Base doubles each attempt, capped, with jitter to
// avoid a thundering herd when a restarted server comes back and every client
// retries at once. The chip stays amber ("RECONNECTING") while retries are in
// flight and only demotes to "OFFLINE" after continuous failure past
// OFFLINE_AFTER_MS.
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 10_000;
const BACKOFF_JITTER = 0.25;
const OFFLINE_AFTER_MS = 6_000;

/** Next reconnect delay: exponential base, capped, plus up to ±jitter. */
function reconnectDelay(attempt: number): number {
  const base = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
  const jitter = base * BACKOFF_JITTER * (Math.random() * 2 - 1);
  return Math.max(0, base + jitter);
}

/**
 * Owns the /ws connection and keeps it alive across drops (wifi blips, server
 * restarts) with exponential backoff + jitter, retrying indefinitely. Each
 * received event is handed to `onEvent`; on reconnect it simply resumes
 * receiving — no stale state is replayed.
 *
 * `onEvent` is read through a ref so a caller passing a fresh closure every
 * render never tears the socket down and back up (which would double-fire
 * events). The socket effect runs exactly once per mount.
 */
export function useLiveSocket(onEvent: (event: Event) => void): ConnState {
  const [connState, setConnState] = useState<ConnState>('reconnecting');
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    // Guard against React StrictMode's dev double-mount: once this effect is
    // torn down (its cleanup ran), any socket it opened — including one from a
    // pending reconnect — must never deliver events, otherwise a transient
    // second connection double-fires enqueue and every spoken line plays twice.
    // `live` gates every callback; cleanup flips it and cancels all timers.
    let live = true;
    let ws: WebSocket | null = null;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    // Set on the first drop, cleared on a successful open. If it fires while
    // still disconnected, the chip demotes from RECONNECTING to OFFLINE.
    let offlineTimer: ReturnType<typeof setTimeout> | null = null;

    const clearReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };
    const clearOffline = () => {
      if (offlineTimer) {
        clearTimeout(offlineTimer);
        offlineTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (!live || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, reconnectDelay(attempt));
      attempt += 1;
    };

    // A drop (or failed attempt) enters RECONNECTING and, on the first such
    // event, arms the OFFLINE demotion, then schedules the next retry.
    const onDrop = () => {
      if (!live) return;
      setConnState((prev) => (prev === 'offline' ? 'offline' : 'reconnecting'));
      if (!offlineTimer) {
        offlineTimer = setTimeout(() => {
          offlineTimer = null;
          if (live) setConnState('offline');
        }, OFFLINE_AFTER_MS);
      }
      scheduleReconnect();
    };

    const connect = () => {
      if (!live) return;
      const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      ws = socket;
      socket.onopen = () => {
        if (!live) return;
        // Reconnected cleanly: reset backoff, cancel the offline demotion, and
        // resume receiving. We deliberately don't replay/re-request state.
        attempt = 0;
        clearOffline();
        setConnState('connected');
      };
      socket.onclose = () => {
        if (!live || socket !== ws) return;
        onDrop();
      };
      socket.onerror = () => {
        // Surface as a close so the single reconnect path handles it; closing a
        // socket that already failed to connect is a no-op.
        socket.close();
      };
      socket.onmessage = (msg) => {
        if (!live) return;
        onEventRef.current(JSON.parse(msg.data as string) as Event);
      };
    };

    connect();
    return () => {
      live = false;
      clearReconnect();
      clearOffline();
      if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
      }
    };
  }, []);

  return connState;
}
