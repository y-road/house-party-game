// 서버와 클라이언트가 함께 쓰는 상수. 이벤트 이름은 여기서만 정의한다.

export const MAX_PLAYERS = 9;
export const GIFT_COUNT = 9;
export const NICKNAME_MAX = 8;

export const PHASE = Object.freeze({
  LOBBY: 'LOBBY',
  RACE_COUNTDOWN: 'RACE_COUNTDOWN',
  RACING: 'RACING',
  PODIUM: 'PODIUM',
  VILLAGE: 'VILLAGE',
  GIFT_TIME: 'GIFT_TIME',
  CHOICE_TIME: 'CHOICE_TIME',
  FINISHED: 'FINISHED',
});

// 커스터마이징 항목별 옵션 개수 (gender 제외 전부 12종)
export const AVATAR_OPTIONS = Object.freeze({
  gender: 2,
  hair: 12,
  skin: 12,
  face: 12,
  top: 12,
  bottom: 12,
  shoes: 12,
});

export const EVT = Object.freeze({
  // client -> server
  PLAYER_JOIN: 'player:join',
  PLAYER_AVATAR: 'player:avatar',
  LOBBY_MOVE_TO: 'lobby:moveTo',
  RACE_TAP: 'race:tap',
  GIFT_OPEN: 'gift:open',
  PLAYER_ACTION: 'player:action', // 점프·공격 (섬에서만)
  ADMIN_JOIN: 'admin:join',
  ADMIN_ADD_BOTS: 'admin:addBots',
  ADMIN_START: 'admin:start',
  ADMIN_REMATCH: 'admin:rematch',
  ADMIN_TO_VILLAGE: 'admin:toVillage',
  ADMIN_GIFT_TIME: 'admin:giftTime',
  ADMIN_CHOICE_TIME: 'admin:choiceTime',
  ADMIN_REVEAL: 'admin:reveal',
  ADMIN_CONFIRM_GIFT: 'admin:confirmGift',
  ADMIN_DEV_SKIP_RACE: 'admin:devSkipRace', // 개발 환경 전용

  // server -> client
  STATE_SYNC: 'state:sync',
  LOBBY_POSITIONS: 'lobby:positions',
  LOBBY_ACTION: 'lobby:action', // 다른 사람이 점프/공격했다는 알림 (본인에게는 보내지 않음)
  RACE_COUNTDOWN: 'race:countdown',
  RACE_POSITIONS: 'race:positions',
  RACE_FINISH: 'race:finish',
  RACE_RESULT: 'race:result',
  GIFT_HINT: 'gift:hint',
});

// 레이스 파라미터. 속도 모델: 터치 1회마다 속도에 TAP_IMPULSE를 더하고,
// 속도는 초당 DRAG의 지수 감쇠로 줄어든다(가속·감속 관성). 최고속도는 MAX_SPEED로 제한한다.
// 정상 상태 속도 ≈ (초당 터치 수 × TAP_IMPULSE) / DRAG
export const RACE = Object.freeze({
  COUNTDOWN_SECONDS: 3,
  TICK_HZ: 20,
  TRACK_LENGTH: 80, // scripts/tune-track.mjs로 확정 (평균 초당 7회 연타 ≈ 15초)
  MAX_TAPS_PER_SECOND: 14, // 오토클릭 방지 상한
  TAP_IMPULSE: 1.0,
  DRAG: 1.2,
  MAX_SPEED: 12,
  FORCE_END_AFTER_SECONDS: 40, // 미도착자 거리순 확정까지의 안전장치
});

// 로비 섬 (원형). 단위는 월드 좌표.
// 세로 폰 화면에 섬 전체가 들어와야 해서 반지름을 작게 잡았다.
export const LOBBY = Object.freeze({
  ISLAND_RADIUS: 11,
  MOVE_SPEED: 5,
  TICK_HZ: 10,
});

// 섬에서 쓰는 동작 버튼. 연출용이며 다른 플레이어에게 영향을 주지 않는다.
export const ACTION = Object.freeze({ JUMP: 'jump', ATTACK: 'attack' });
export const ACTION_COOLDOWN_MS = Object.freeze({
  [ACTION.JUMP]: 700,
  [ACTION.ATTACK]: 500,
});

// 순위별 힌트 아이템 개수: 1위 5, 2위 4, 3위 3, 4~6위 2, 7~9위 1
export function hintItemsForRank(rank) {
  if (rank === 1) return 5;
  if (rank === 2) return 4;
  if (rank === 3) return 3;
  if (rank >= 4 && rank <= 6) return 2;
  return 1;
}
