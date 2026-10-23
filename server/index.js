import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import compression from 'compression';
import { Server } from 'socket.io';
import { initBroadcast } from './game/broadcast.js';
import { registerHandlers } from './socket/handlers.js';
import { startLobbyLoop } from './game/lobby.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '../client/dist');
const PORT = process.env.PORT || 3000;
const IS_DEV = process.env.NODE_ENV !== 'production';

const app = express();
const server = http.createServer(app);

// LTE 환경에서 폴링 폴백으로 불안정해지지 않도록 websocket 전용으로 둔다.
const io = new Server(server, {
  transports: ['websocket'],
  pingInterval: 10000,
  pingTimeout: 20000,
  cors: IS_DEV ? { origin: true } : undefined,
});

app.get('/healthz', (_req, res) => res.send('ok'));

if (fs.existsSync(DIST)) {
  // LTE 폰 9대가 동시에 받으므로 gzip 압축하고, 해시가 붙은 에셋은 오래 캐시한다.
  app.use(compression());
  app.use(
    '/assets',
    express.static(path.join(DIST, 'assets'), { maxAge: '1y', immutable: true }),
  );
  app.use(express.static(DIST, { maxAge: 0 }));
  app.get('/admin', (_req, res) => res.sendFile(path.join(DIST, 'admin.html')));
} else {
  app.get('/', (_req, res) => res.send('server running (client build not found yet)'));
}

initBroadcast(io);
registerHandlers(io);
startLobbyLoop();

server.listen(PORT, () => console.log(`listening on :${PORT}`));
