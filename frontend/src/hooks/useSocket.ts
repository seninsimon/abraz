/**
 * useSocket hook.
 * 
 * Manages Socket.IO connection lifecycle and exposes
 * connection state to React components.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, connectSocket, disconnectSocket } from '../services/socketService';
import type { UserRole } from '../types';

interface UseSocketReturn {
  /** The Socket.IO client instance */
  socket: Socket;
  /** Whether the socket is currently connected */
  isConnected: boolean;
  /** Connect to the signaling server and join a room */
  connect: (role: UserRole) => void;
  /** Disconnect from the signaling server */
  disconnect: () => void;
}

/**
 * Hook that wraps the socket service for React lifecycle management.
 * Handles connect/disconnect events and cleans up on unmount.
 */
export function useSocket(): UseSocketReturn {
  const socketRef = useRef<Socket>(getSocket());
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = socketRef.current;

    const handleConnect = () => {
      console.log('[useSocket] Connected to signaling server');
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      console.log('[useSocket] Disconnected from signaling server');
      setIsConnected(false);
    };

    const handleConnectError = (error: Error) => {
      console.error('[useSocket] Connection error:', error.message);
      setIsConnected(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    // If already connected (e.g., hot reload), sync state
    if (socket.connected) {
      setIsConnected(true);
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
    };
  }, []);

  const connect = useCallback((role: UserRole) => {
    connectSocket();
    // Once connected, join the room with the specified role
    const socket = socketRef.current;
    const handleJoin = () => {
      socket.emit('join-room', { role });
      socket.off('connect', handleJoin);
    };

    if (socket.connected) {
      socket.emit('join-room', { role });
    } else {
      socket.on('connect', handleJoin);
    }
  }, []);

  const disconnect = useCallback(() => {
    disconnectSocket();
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    connect,
    disconnect,
  };
}
