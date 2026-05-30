

import { io, Socket } from 'socket.io-client';

const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_URL || 'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SIGNALING_SERVER_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}


export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
}


export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}


export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}
