import { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ConnectedUser,
  UserRole,
} from '../types/index.js';


const ROOM_ID = 'stream-room';


const connectedUsers: Map<string, ConnectedUser> = new Map();


export function registerSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>
): void {
  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    console.log(`[Socket] New connection: ${socket.id}`);


    socket.on('join-room', ({ role }: { role: UserRole }) => {
      const user: ConnectedUser = {
        socketId: socket.id,
        role,
        joinedAt: new Date(),
      };
      connectedUsers.set(socket.id, user);

      socket.join(ROOM_ID);
      console.log(`[Socket] ${socket.id} joined as ${role}`);

      socket.to(ROOM_ID).emit('user-connected', {
        role,
        socketId: socket.id,
      });

      for (const [id, existingUser] of connectedUsers) {
        if (id !== socket.id) {
          socket.emit('user-connected', {
            role: existingUser.role,
            socketId: id,
          });
        }
      }
    });

    socket.on('offer', (payload) => {
      console.log(`[Socket] Offer from ${socket.id}`);
      socket.to(ROOM_ID).emit('offer', {
        ...payload,
        senderId: socket.id,
      });
    });

    socket.on('answer', (payload) => {
      console.log(`[Socket] Answer from ${socket.id}`);
      socket.to(ROOM_ID).emit('answer', {
        ...payload,
        senderId: socket.id,
      });
    });

    socket.on('ice-candidate', (payload) => {
      socket.to(ROOM_ID).emit('ice-candidate', {
        ...payload,
        senderId: socket.id,
      });
    });


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
