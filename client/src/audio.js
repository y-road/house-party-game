// 효과음은 파일 없이 WebAudio로 만든다. (용량 0, 로딩 지연 없음)
// 브라우저 정책상 첫 터치 이후에만 소리가 나므로, 첫 터치에서 오디오를 깨운다.
let ctx = null;
let master = null;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone({ freq, freqEnd = freq, type = 'sine', start = 0, dur = 0.1, gain = 0.15 }) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== freq) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** 터치음: 짧고 경쾌한 "톡" */
export function playTap() {
  tone({ freq: 760 + Math.random() * 120, freqEnd: 420, type: 'triangle', dur: 0.07, gain: 0.13 });
}

/** 카운트다운 "삑" (3·2·1) */
export function playCountBeep() {
  tone({ freq: 660, type: 'square', dur: 0.16, gain: 0.09 });
}

/** 출발 "삐-익!" (한 옥타브 위, 더 길게) */
export function playGo() {
  tone({ freq: 1320, type: 'square', dur: 0.5, gain: 0.1 });
  tone({ freq: 1980, type: 'triangle', dur: 0.5, gain: 0.07 });
}

/** 큰 글자가 바뀔 때 호출: 숫자면 카운트 삑, GO!면 출발음 */
export function playForBigText(text) {
  if (/^\d+$/.test(text)) playCountBeep();
  else if (text.startsWith('GO')) playGo();
}

/** 화면 어디를 터치해도 소리가 나게 한다. 연타는 45ms 간격으로 솎아 낸다. */
export function installTapSound() {
  let last = 0;
  document.addEventListener(
    'pointerdown',
    () => {
      ensure();
      const now = performance.now();
      if (now - last < 45) return;
      last = now;
      playTap();
    },
    { capture: true, passive: true },
  );
}
