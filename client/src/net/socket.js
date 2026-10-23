import { io } from 'socket.io-client';

// 개발 중에는 Vite(5173)와 서버(3000)가 따로 뜬다. 배포 후에는 같은 주소를 쓴다.
const url = import.meta.env.DEV ? `http://${location.hostname}:3000` : undefined;

// LTE 환경을 위해 websocket 전용, 끊기면 빠르게 재시도한다.
export const socket = io(url, {
  transports: ['websocket'],
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
});

/** 응답(ack)을 기다리는 emit. 5초 안에 응답이 없으면 TIMEOUT으로 처리한다. */
export function emitAck(event, payload) {
  return new Promise((resolve) => {
    socket.timeout(5000).emit(event, payload, (err, res) => {
      resolve(err ? { ok: false, reason: 'TIMEOUT' } : res);
    });
  });
}
