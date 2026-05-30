import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { registerSocketHandlers } from './socket/socketHandler.js';
import type { ClientToServerEvents, ServerToClientEvents } from './types/index.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3001', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const app = express();
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});


registerSocketHandlers(io);

// Start listening
httpServer.listen(PORT, () => {
  console.log(`\n Signaling server running on http://localhost:${PORT}`);
  console.log(` Accepting connections from ${FRONTEND_URL}`);
  console.log(`  Health check: http://localhost:${PORT}/health\n`);
});
