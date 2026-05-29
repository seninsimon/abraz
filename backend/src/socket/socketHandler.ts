/**
 * Socket.IO event handler module.
 * 
 * Manages the signaling layer for WebRTC peer connections.
 * This module does NOT process any media — it only relays
 * SDP offers/answers and ICE candidates between connected peers.
 */

import { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ConnectedUser,
  UserRole,
} from '../types/index.js';

/** The single streaming room identifier */
const ROOM_ID = 'stream-room';

/** In-memory store of connected users */
const connectedUsers: Map<string, ConnectedUser> = new Map();

/**
 * Registers all socket event handlers on the given Socket.IO server.
 * Each socket joins the stream room and can relay signaling messages.
 */
export function registerSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>
): void {
  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    console.log(`[Socket] New connection: ${socket.id}`);

    /**
     * join-room: A peer announces its role (client or host) and joins the room.
     * All other peers in the room are notified.
     */
    socket.on('join-room', ({ role }: { role: UserRole }) => {
      // Store user info
      const user: ConnectedUser = {
        socketId: socket.id,
        role,
        joinedAt: new Date(),
      };
      connectedUsers.set(socket.id, user);

      // Join the Socket.IO room
      socket.join(ROOM_ID);
      console.log(`[Socket] ${socket.id} joined as ${role}`);

      // Notify others in the room
      socket.to(ROOM_ID).emit('user-connected', {
        role,
        socketId: socket.id,
      });

      // Inform the joining user about existing peers
      for (const [id, existingUser] of connectedUsers) {
        if (id !== socket.id) {
          socket.emit('user-connected', {
            role: existingUser.role,
            socketId: id,
          });
        }
      }
    });

    /**
     * offer: Client sends an SDP offer to the host.
     * Relayed to all other peers in the room.
     */
    socket.on('offer', (payload) => {
      console.log(`[Socket] Offer from ${socket.id}`);
      socket.to(ROOM_ID).emit('offer', {
        ...payload,
        senderId: socket.id,
      });
    });

    /**
     * answer: Host sends an SDP answer back to the client.
     * Relayed to all other peers in the room.
     */
    socket.on('answer', (payload) => {
      console.log(`[Socket] Answer from ${socket.id}`);
      socket.to(ROOM_ID).emit('answer', {
        ...payload,
        senderId: socket.id,
      });
    });

    /**
     * ice-candidate: Either peer sends an ICE candidate.
     * Relayed to all other peers in the room.
     */
    socket.on('ice-candidate', (payload) => {
      socket.to(ROOM_ID).emit('ice-candidate', {
        ...payload,
        senderId: socket.id,
      });
    });

    /**
     * disconnect: Clean up when a peer leaves.
     * Notify remaining peers so they can update their UI.
     */
    socket.on('disconnect', () => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        console.log(`[Socket] ${user.role} disconnected: ${socket.id}`);
        connectedUsers.delete(socket.id);
        socket.to(ROOM_ID).emit('user-disconnected', {
          role: user.role,
          socketId: socket.id,
        });
      } else {
        console.log(`[Socket] Unknown socket disconnected: ${socket.id}`);
      }
    });
  });
}
