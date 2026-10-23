import { PHASE } from '../../shared/constants.js';

export const PHASE_LABEL = {
  [PHASE.LOBBY]: '로비',
  [PHASE.RACE_COUNTDOWN]: '레이스 준비',
  [PHASE.RACING]: '레이스 진행 중',
  [PHASE.PODIUM]: '시상식',
  [PHASE.VILLAGE]: '마을',
  [PHASE.GIFT_TIME]: '선물타임',
  [PHASE.CHOICE_TIME]: '선택의 시간',
  [PHASE.FINISHED]: '끝!',
};

/** 플레이어 폰에서 레이스 화면을 보여 주는 단계 */
export const RACE_PHASES = new Set([PHASE.RACE_COUNTDOWN, PHASE.RACING]);

/** 섬(마을) 화면을 보여 주는 단계 */
export const ISLAND_PHASES = new Set([PHASE.LOBBY, PHASE.VILLAGE, PHASE.GIFT_TIME, PHASE.CHOICE_TIME]);

/** 플레이어 폰에서 선물카드 화면을 보여 주는 단계 */
export const GIFT_PHASES = new Set([PHASE.GIFT_TIME, PHASE.CHOICE_TIME]);
