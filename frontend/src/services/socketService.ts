/**
 * Socket.IO client service.
 * 
 * Provides a singleton socket connection to the signaling server.
 * All signaling events (offer, answer, ICE candidates) flow through this service.
 */

import { io, Socket } from 'socket.io-client';

/** Signaling server URL — defaults to localhost:3001 for development */
const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_URL || 'http://localhost:3001';

/** Singleton socket instance */
let socket: Socket | null = null;

/**
 * Returns the singleton Socket.IO client instance.
 * Creates a new connection on first call with auto-connect disabled.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SIGNALING_SERVER_URL, {
      autoConnect: false,
      // Reconnect automatically on disconnect
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}

/**
 * Connects the socket to the signaling server.
 * No-op if already connected.
 */
export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
}

/**
 * Disconnects the socket from the signaling server.
 */
export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}

/**
 * Checks whether the socket is currently connected.
 */
export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}
