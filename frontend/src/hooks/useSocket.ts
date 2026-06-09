

import { useEffect, useState, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, connectSocket, disconnectSocket } from '../services/socketService';
import type { UserRole } from '../types';

interface UseSocketReturn {
  socket: Socket;
  isConnected: boolean;
  connect: (role: UserRole, token?: string, clientName?: string) => void;
  disconnect: () => void;
}

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

  const connect = useCallback((role: UserRole, token?: string, clientName?: string) => {
    connectSocket();
    const socket = socketRef.current;
    
    const handleJoin = () => {
      socket.emit('join-room', { role, token, clientName });
      socket.off('connect', handleJoin);
    };

    if (socket.connected) {
      socket.emit('join-room', { role, token, clientName });
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

