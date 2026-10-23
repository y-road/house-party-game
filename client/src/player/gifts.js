import { socket } from '../net/socket.js';
import { EVT, PHASE, GIFT_COUNT } from '../../../shared/constants.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const REASONS = {
  NO_HINT_ITEMS: '힌트 아이템이 없어요. 이미 연 카드만 다시 볼 수 있어요.',
  CARD_REMOVED: '이미 증정된 카드예요.',
  WRONG_PHASE: '지금은 카드를 열 수 없어요.',
};

/**
 * 선물카드 화면.
 * 선물타임: 카드를 눌러 힌트 확인(새 카드는 아이템 1개 사용, 연 카드는 무료로 다시 보기)
 * 선택의 시간: 보기만 가능. 카드 상태(남음/증정됨)만 보여 준다.
 */
export function createGiftView(container, initial) {
  let latest = initial;
  let busy = false;
  let toastTimer = 0;

  const wrap = el('div', 'screen gift-screen');
  const top = el('div', 'gift-top');
  const phaseEl = el('div', 'pill');
  const itemsEl = el('div', 'pill items');
  top.append(phaseEl, itemsEl);
  const guide = el('p', 'gift-guide');
  const grid = el('div', 'gift-grid');
  const toast = el('div', 'toast hide');
  const overlay = el('div', 'hint-overlay');
  overlay.hidden = true;
  wrap.append(top, guide, grid, toast, overlay);
  container.append(wrap);

  const cardEls = [];
  for (let i = 1; i <= GIFT_COUNT; i++) {
    const b = el('button', 'gcard');
    b.append(el('span', 'gc-no', String(i)), el('span', 'gc-icon', '🎁'), el('span', 'gc-state', ''));
    b.addEventListener('click', () => onCard(i));
    grid.append(b);
    cardEls.push(b);
  }

  function say(text) {
    toast.textContent = text;
    toast.classList.remove('hide');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hide'), 2600);
  }

  function closeOverlay() {
    overlay.hidden = true;
    overlay.replaceChildren();
  }

  function confirmOpen(no) {
    overlay.replaceChildren();
    const box = el('div', 'hint-box');
    box.append(
      el('div', 'hb-title', `${no}번 카드를 열까요?`),
      el('p', 'hb-text', `힌트 아이템 1개를 사용해요. (남은 아이템 ${latest.me.hintItems}개)`),
    );
    const row = el('div', 'hb-row');
    const no_ = el('button', 'ghost', '취소');
    no_.addEventListener('click', closeOverlay);
    const yes = el('button', 'primary', '🔑 열기');
    yes.addEventListener('click', () => {
      closeOverlay();
      requestOpen(no);
    });
    row.append(no_, yes);
    box.append(row);
    overlay.append(box);
    overlay.hidden = false;
  }

  function requestOpen(no) {
    if (busy) return;
    busy = true;
    socket.timeout(4000).emit(EVT.GIFT_OPEN, no, (err, res) => {
      busy = false;
      if (err) return say('서버 응답이 없어요. 다시 눌러 주세요.');
      if (!res?.ok) say(REASONS[res.reason] ?? `열 수 없어요 (${res.reason})`);
    });
  }

  function onCard(no) {
    if (latest.phase !== PHASE.GIFT_TIME) return say('지금은 보기만 할 수 있어요 👀');
    if (latest.cards[no - 1] === 'removed') return say('이미 증정된 카드예요.');
    if (latest.me.openedCards.includes(no)) return requestOpen(no); // 다시 보기: 무료
    if (latest.me.hintItems <= 0) return say(REASONS.NO_HINT_ITEMS);
    confirmOpen(no);
  }

  /** 서버가 힌트를 보내오면(본인에게만) 팝업으로 보여 준다 */
  function showHint({ card, text, hintItems }) {
    overlay.replaceChildren();
    const box = el('div', 'hint-box reveal');
    const close = el('button', 'primary', '확인');
    close.addEventListener('click', closeOverlay);
    box.append(
      el('div', 'hb-no', `🎁 ${card}번 카드`),
      el('p', 'hb-text big', text),
      el('div', 'hb-items', `🔑 남은 아이템 ${hintItems}개`),
      close,
    );
    overlay.append(box);
    overlay.hidden = false;
  }

  function update(next) {
    latest = next;
    const gift = latest.phase === PHASE.GIFT_TIME;
    phaseEl.textContent = gift ? '🎁 선물타임' : '🤔 선택의 시간';
    itemsEl.textContent = `🔑 ×${latest.me.hintItems}`;
    guide.textContent = gift
      ? '카드를 눌러 힌트를 확인하세요. 열어 본 카드는 다시 볼 수 있어요.'
      : '큰 화면을 봐 주세요! 방장이 카드를 공개해요.';
    cardEls.forEach((b, idx) => {
      const no = idx + 1;
      const removed = latest.cards[idx] === 'removed';
      const opened = latest.me.openedCards.includes(no);
      b.classList.toggle('removed', removed);
      b.classList.toggle('opened', opened && !removed);
      b.classList.toggle('view', !gift);
      b.querySelector('.gc-icon').textContent = removed ? '✔' : opened ? '📖' : '🎁';
      b.querySelector('.gc-state').textContent = removed ? '증정 완료' : opened ? '열어 봄' : '';
    });
    if (!gift) closeOverlay();
  }

  update(initial);
  return {
    update,
    showHint,
    dispose() {
      clearTimeout(toastTimer);
      wrap.remove();
    },
  };
}
