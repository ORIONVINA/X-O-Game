/* =========================================================
   XO GAME – cấu trúc code
   1. CONFIG  – chỗ chỉnh nhanh (link Google Sheet, điểm thưởng...)
   2. Store   – hồ sơ người chơi lưu trên máy (phe, điểm, chuỗi ngày)
   3. Track   – gửi data ẩn danh về Google Sheet
   4. Sfx/Fx  – âm thanh (tự tạo, không cần file) và hiệu ứng
   5. Rules   – luật thắng
   6. AI      – máy đấu
   7. Game    – trạng thái ván đấu
   8. Arena   – sân bắn cung
   9. Net     – chơi với bạn qua link (kết nối trực tiếp 2 máy)
   10. UI     – màn hình, khảo sát
   ========================================================= */

/* 1. CONFIG */
const CONFIG = {
  // Dán link Apps Script vào đây để data chảy về Google Sheet (xem tools/HUONG-DAN-GOOGLE-SHEET.md)
  sheetUrl: '',
  points: { easy: 5, hard: 10, online: 10, survey: 20 },
  botDelay: 450,
  keep: 3,                       // bàn 3×3: mỗi người chỉ giữ 3 quân, quân cũ nhất biến mất
  storageKey: 'xo_profile_v2',
  roomPrefix: 'tayoxo-',
  peerOptions: window.XO_PEER_OPTIONS || {},
  aim: { easy: 0.65, hard: 0.9 } // độ chính xác của máy ở sân bắn cung
};
const PIECE = { X: 'assets/x.webp', O: 'assets/o.webp' };
const other = p => p === 'X' ? 'O' : 'X';
const $ = id => document.getElementById(id);
const today = () => new Date().toLocaleDateString('sv');

/* 2. Store */
const Store = {
  p: null,
  load(){
    let p = {};
    try { p = JSON.parse(localStorage.getItem(CONFIG.storageKey)) || {}; } catch {}
    this.p = Object.assign({ uid: Math.random().toString(36).slice(2, 10) + Date.now().toString(36), team: null, points: 0,
      streak: 0, lastDay: '', plays: 0, wins: 0, survey: '', sound: true, src: '', minor: false, queue: [] }, p);
    if (!this.p.src){
      const q = new URLSearchParams(location.search);
      let ref = ''; try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch {}
      this.p.src = q.get('utm_source') || q.get('src') || ref || 'direct';
    }
    this.save();
  },
  save(){ try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(this.p)); } catch {} }
};

/* 3. Track – mỗi sự kiện là 1 dòng trong Google Sheet */
const Track = {
  send(event, data, anonymous){
    const p = Store.p;
    if (p.minor && !anonymous) return;            // dưới 16 tuổi: không lưu gì thêm
    const row = Object.assign({ ts: new Date().toISOString(), event,
      uid: anonymous ? '' : p.uid, src: p.src, team: p.team || '',
      device: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop' }, data);
    p.queue.push(row); if (p.queue.length > 200) p.queue.shift();
    Store.save(); this.flush();
  },
  flush(){
    const p = Store.p;
    if (!CONFIG.sheetUrl || !p.queue.length) return;
    const batch = p.queue.slice();
    // text/plain + no-cors: cách gửi mà Apps Script nhận được từ web tĩnh
    fetch(CONFIG.sheetUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(batch), keepalive: true })
      .then(() => { p.queue = p.queue.slice(batch.length); Store.save(); }).catch(() => {});
  }
};

/* 4a. Sfx – âm thanh tổng hợp bằng WebAudio */
const Sfx = {
  ctx: null,
  ac(){
    if (!Store.p.sound) return null;
    try { this.ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume(); } catch { return null; }
    return this.ctx;
  },
  tone(f, dur, type = 'sine', vol = .18, at = 0, to){
    const c = this.ac(); if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + .02);
  },
  noise(dur, vol = .2, at = 0, freq = 1800){
    const c = this.ac(); if (!c) return;
    const t = c.currentTime + at, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol;
    s.connect(f).connect(g).connect(c.destination); s.start(t);
  },
  click(){ this.tone(700, .06, 'square', .08); },
  place(p){ if (p === 'X'){ this.tone(190, .2, 'sawtooth', .2, 0, 70); this.noise(.1, .22, 0, 900); } else { this.tone(520, .14, 'sine', .22, 0, 820); this.tone(1040, .1, 'sine', .08, .05); } },
  shoot(){ this.noise(.2, .28, 0, 2600); this.tone(950, .2, 'triangle', .1, 0, 260); },
  miss(){ this.tone(320, .3, 'triangle', .18, 0, 110); },
  vanish(){ this.tone(760, .22, 'sine', .1, 0, 190); },
  join(){ this.tone(523, .1, 'triangle', .16); this.tone(784, .16, 'triangle', .16, .1); },
  win(){ [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, .22, 'square', .1, i * .11)); this.tone(1568, .5, 'triangle', .14, .56); },
  lose(){ [392, 311, 262].forEach((f, i) => this.tone(f, .3, 'triangle', .16, i * .2)); }
};

/* 4b. Fx – pháo giấy, tia văng, rung bàn */
const Fx = {
  parts: [], running: false,
  cv: null, g: null,
  init(){ this.cv = $('fx'); this.g = this.cv.getContext('2d'); const fit = () => { this.cv.width = innerWidth; this.cv.height = innerHeight; }; fit(); addEventListener('resize', fit); },
  still(){ return matchMedia('(prefers-reduced-motion: reduce)').matches; },
  add(list){ if (this.still()) return; this.parts.push(...list); if (!this.running){ this.running = true; requestAnimationFrame(() => this.tick()); } },
  tick(){
    const g = this.g; g.clearRect(0, 0, this.cv.width, this.cv.height);
    this.parts = this.parts.filter(p => p.life > 0 && p.y < this.cv.height + 40);
    for (const p of this.parts){
      p.vy += p.grav; p.x += p.vx; p.y += p.vy; p.rot += p.spin; p.life--;
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.min(1, p.life / 20); g.fillStyle = p.color;
      if (p.round){ g.beginPath(); g.arc(0, 0, p.size / 2, 0, 7); g.fill(); } else g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      g.restore();
    }
    if (this.parts.length) requestAnimationFrame(() => this.tick()); else { this.running = false; g.clearRect(0, 0, this.cv.width, this.cv.height); }
  },
  confetti(){
    const colors = ['#ffd42e', '#f47a1c', '#2aa6ff', '#0b4fc4', '#ffffff', '#d9390f'];
    const mk = d => Array.from({ length: 70 }, () => ({ x: Math.random() * innerWidth, y: -20 - Math.random() * 200 - d, vx: (Math.random() - .5) * 5, vy: 2 + Math.random() * 4,
      grav: .08, rot: Math.random() * 6, spin: (Math.random() - .5) * .4, size: 8 + Math.random() * 8, color: colors[Math.floor(Math.random() * colors.length)], life: 260 }));
    this.add(mk(0)); setTimeout(() => this.add(mk(100)), 350);
  },
  // X: syrup văng mạnh · O: seasoning rắc nhẹ
  burst(x, y, p){
    const colors = p === 'X' ? ['#2aa6ff', '#8fe1ff', '#7a3b00', '#c8791a'] : ['#ffd42e', '#fff3a6', '#f47a1c', '#ffffff'];
    const n = p === 'X' ? 22 : 16, sp = p === 'X' ? 8 : 4.5;
    this.add(Array.from({ length: n }, () => { const a = Math.random() * 6.28, v = (0.4 + Math.random() * .6) * sp;
      return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, grav: .35, rot: 0, spin: .2, size: 5 + Math.random() * 6, color: colors[Math.floor(Math.random() * colors.length)], life: 38, round: true }; }));
  },
  shake(el, strong){
    if (this.still()) return; const d = strong ? 7 : 3;
    el.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${d}px,-${d}px)` }, { transform: `translate(-${d}px,${d}px)` }, { transform: `translate(${d / 2}px,${d / 2}px)` }, { transform: 'translate(0,0)' }], { duration: 260 });
  },
  pop(text, x, y){
    const el = $('pop'); el.textContent = text; el.style.left = x + 'px'; el.style.top = y + 'px'; el.hidden = false;
    const a = el.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(.4)' }, { opacity: 1, transform: 'translate(-50%,-90%) scale(1.1)', offset: .3 }, { opacity: 0, transform: 'translate(-50%,-160%) scale(1)' }], { duration: 900 });
    a.onfinish = () => { el.hidden = true; };
  }
};

/* 5. Rules */
const Rules = {
  // trả về {winner, line} | {draw:true} | null
  check(board, n, k){
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++){
      const p = board[r * n + c]; if (!p) continue;
      for (const [dr, dc] of dirs){
        const line = [r * n + c];
        for (let i = 1; i < k; i++){
          const rr = r + dr * i, cc = c + dc * i;
          if (rr < 0 || rr >= n || cc < 0 || cc >= n || board[rr * n + cc] !== p) break;
          line.push(rr * n + cc);
        }
        if (line.length === k) return { winner: p, line };
      }
    }
    return board.every(Boolean) ? { draw: true } : null;
  },
  empty(board){ return board.map((v, i) => v ? null : i).filter(i => i !== null); }
};

/* 6. AI */
const AI = {
  move(g, level){
    if (level === 'easy' && Math.random() < 0.6) return this.random(g);
    return g.vanish ? this.vanish(g) : this.heuristic(g);
  },
  random(g){ const e = Rules.empty(g.board); return e[Math.floor(Math.random() * e.length)]; },

  // Bàn 3×3 "không hòa": tìm kiếm có giới hạn độ sâu, tính cả quân sắp biến mất
  vanish(g){
    const me = g.turn, b = [...g.board], q = { X: [...g.q.X], O: [...g.q.O] }, DEPTH = 6;
    const wins = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    const won = p => wins.some(l => l.every(i => b[i] === p));
    const put = (i, p) => { b[i] = p; q[p].push(i); let rm = null; if (q[p].length > CONFIG.keep){ rm = q[p].shift(); b[rm] = null; } return rm; };
    const back = (i, p, rm) => { q[p].pop(); b[i] = null; if (rm !== null){ q[p].unshift(rm); b[rm] = p; } };
    const search = (p, depth, a, bt) => {
      if (depth >= DEPTH) return 0;
      const mine = p === me; let best = mine ? -Infinity : Infinity;
      for (let i = 0; i < 9; i++){
        if (b[i]) continue;
        const rm = put(i, p);
        const v = won(p) ? (mine ? 100 - depth : depth - 100) : search(other(p), depth + 1, a, bt);
        back(i, p, rm);
        if (mine){ if (v > best) best = v; if (v > a) a = v; } else { if (v < best) best = v; if (v < bt) bt = v; }
        if (bt <= a) break;
      }
      return best;
    };
    let bestV = -Infinity, bests = [];
    for (let i = 0; i < 9; i++){
      if (b[i]) continue;
      const rm = put(i, me);
      const v = won(me) ? 100 : search(other(me), 1, -Infinity, Infinity);
      back(i, me, rm);
      if (v > bestV){ bestV = v; bests = [i]; } else if (v === bestV) bests.push(i);
    }
    return bests[Math.floor(Math.random() * bests.length)];
  },

  // Chấm điểm theo chuỗi cho bàn lớn (5×5, 7×7)
  heuristic(g){
    const { n, k, board } = g, me = g.turn, op = other(me);
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    const lineVal = (i, p) => {
      const r = Math.floor(i / n), c = i % n; let total = 0;
      for (const [dr, dc] of dirs){
        let cnt = 1, open = 0;
        for (const s of [1, -1]){
          let rr = r + dr * s, cc = c + dc * s;
          while (rr >= 0 && rr < n && cc >= 0 && cc < n && board[rr * n + cc] === p){ cnt++; rr += dr * s; cc += dc * s; }
          if (rr >= 0 && rr < n && cc >= 0 && cc < n && !board[rr * n + cc]) open++;
        }
        if (cnt >= k) total += 1e6; else total += Math.pow(10, cnt) * (open || 0.1);
      }
      return total;
    };
    let best = null, bestV = -1;
    for (const i of Rules.empty(board)){
      const center = n / 2 - Math.abs(Math.floor(i / n) - (n - 1) / 2) - Math.abs(i % n - (n - 1) / 2) * 0.5;
      const v = lineVal(i, me) * 1.1 + lineVal(i, op) + center + Math.random() * .5;
      if (v > bestV){ bestV = v; best = i; }
    }
    return best;
  }
};

/* 7. Game */
const Game = {
  n: 3, k: 3, vanish: true, arena: 'classic',
  mode: 'bot', level: 'hard', remote: false,   // mode: bot | local | online ; remote = máy khách trong phòng online
  board: [], q: { X: [], O: [] }, turn: 'X', my: 'X', history: [], over: false, result: null,
  score: { X: 0, O: 0 }, starter: 'X', moves: 0, t0: 0, botTimer: null,

  setup(opts){ Object.assign(this, opts); this.vanish = this.n === 3; this.score = { X: 0, O: 0 }; this.starter = 'X'; },
  start(){
    clearTimeout(this.botTimer); Arena.stop();
    this.board = Array(this.n * this.n).fill(null); this.q = { X: [], O: [] };
    this.turn = this.starter; this.history = []; this.over = false; this.result = null; this.moves = 0; this.t0 = Date.now();
    this.commit({ type: 'start' });
  },
  canAct(){ return !this.over && !Arena.busy && (this.mode === 'local' || this.turn === this.my); },
  isBotTurn(){ return this.mode === 'bot' && !this.over && this.turn !== this.my; },

  // Người chơi ở máy này muốn đặt quân / bắn trượt
  request(i){ if (!this.canAct()) return; if (this.remote) Net.send({ t: 'move', i }); else this.play(i); },
  requestMiss(){ if (!this.canAct()) return; if (this.remote) Net.send({ t: 'miss' }); else this.miss(); },

  play(i){
    if (this.over || this.board[i]) return false;
    const p = this.turn; let removed = null;
    this.board[i] = p; this.q[p].push(i);
    if (this.vanish && this.q[p].length > CONFIG.keep){ removed = this.q[p].shift(); this.board[removed] = null; }
    this.history.push({ i, p, removed }); this.moves++;
    const r = Rules.check(this.board, this.n, this.k);
    if (r){
      this.over = true; this.result = r;
      if (r.winner) this.score[r.winner]++;
      this.starter = other(this.starter);
    } else this.turn = other(p);
    this.commit({ type: 'move', i, p, removed });
    return true;
  },
  miss(){ const p = this.turn; this.turn = other(p); this.commit({ type: 'miss', p }); },
  undo(){
    if (this.over || !this.history.length || this.mode === 'online' || this.arena !== 'classic') return;
    clearTimeout(this.botTimer);
    const steps = this.mode === 'local' ? 1 : (this.turn === this.my ? 2 : 1);
    for (let s = 0; s < steps && this.history.length; s++){
      const { i, p, removed } = this.history.pop();
      this.board[i] = null; this.q[p].pop();
      if (removed !== null){ this.board[removed] = p; this.q[p].unshift(removed); }
      this.turn = p; this.moves--;
    }
    this.commit({ type: 'undo' });
  },

  // Sau mỗi thay đổi: gửi cho bạn (nếu là chủ phòng), vẽ lại, hiệu ứng, gọi máy đi
  commit(ev){
    if (this.mode === 'online' && !this.remote) Net.send({ t: 'state', s: this.snap(), ev });
    this.show(ev);
    if (this.isBotTurn()){
      this.botTimer = setTimeout(() => {
        const target = AI.move(this, this.level);
        if (this.arena === 'archery') Arena.botShoot(target); else this.play(target);
      }, CONFIG.botDelay);
    }
  },
  snap(){ const { n, k, vanish, arena, board, q, turn, over, result, score, moves, my } = this; return { n, k, vanish, arena, board, q, turn, over, result, score, moves, host: my }; },
  load(s){ const { host, ...rest } = s; Object.assign(this, rest); this.mode = 'online'; this.remote = true; this.my = other(host); },

  show(ev){
    UI.render(ev.type === 'move' ? ev.i : undefined);
    if (ev.type === 'move'){
      Sfx.place(ev.p);
      const c = UI.cellCenter(ev.i); Fx.burst(c.x, c.y, ev.p); Fx.shake($('board'), ev.p === 'X');
      if (ev.removed !== null) setTimeout(() => Sfx.vanish(), 160);
      if (this.result) this.finish();
    } else if (ev.type === 'miss'){
      Sfx.miss(); const r = $('board').getBoundingClientRect(); Fx.pop('TRƯỢT!', r.left + r.width / 2, r.top + r.height / 2);
    } else if (ev.type === 'start'){ $('result').hidden = true; if (this.t0 === 0) this.t0 = Date.now(); }
    Arena.sync();
  },

  finish(){
    const r = this.result, p = Store.p, d = today();
    const outcome = this.mode === 'local' ? 'local' : r.draw ? 'draw' : r.winner === this.my ? 'win' : 'lose';
    let gain = 0;
    if (outcome === 'win') gain = this.mode === 'online' ? CONFIG.points.online : CONFIG.points[this.level];
    if (p.lastDay !== d){
      const y = new Date(Date.now() - 864e5).toLocaleDateString('sv');
      p.streak = p.lastDay === y ? p.streak + 1 : 1; p.lastDay = d;
    }
    p.plays++; p.points += gain; if (outcome === 'win') p.wins++;
    Store.save();
    Track.send('van_dau', { mode: this.mode === 'bot' ? 'may_' + this.level : this.mode, arena: this.arena, size: this.n + 'x' + this.n,
      result: outcome, winner: r.winner || '', moves: this.moves, seconds: Math.round((Date.now() - (this.t0 || Date.now())) / 1000), plays: p.plays, streak: p.streak });
    setTimeout(() => {
      if (outcome === 'lose') Sfx.lose(); else { Sfx.win(); Fx.confetti(); }
      UI.result(outcome, r, gain);
    }, 750);
  }
};

/* 8. Arena – sân bắn cung: tâm ngắm chạy, bấm để bắn que bánh vào ô */
const Arena = {
  busy: false, on: false, raf: 0, u: .5, v: .5, t0: 0,
  sync(){
    const aiming = Game.arena === 'archery' && !Game.over && Game.canAct();
    $('board').classList.toggle('aiming', Game.arena === 'archery');
    if (aiming) this.start(); else if (!this.busy) this.stop();
  },
  start(){
    if (this.on) return; this.on = true; this.t0 = performance.now() - Math.random() * 5000;
    const aim = $('aim'); aim.hidden = false; aim.classList.remove('bot');
    const loop = now => {
      if (!this.on) return;
      const sp = Math.min(1.9, 0.9 + Game.moves * 0.07) * (Game.n > 3 ? .8 : 1), t = (now - this.t0) / 1000 * sp;
      this.u = .5 + .47 * Math.sin(t * 1.9); this.v = .5 + .47 * Math.sin(t * 1.33 + 1.1);
      this.place(); this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  },
  stop(){ this.on = false; cancelAnimationFrame(this.raf); $('aim').hidden = true; },
  place(){ const b = $('board'); $('aim').style.transform = `translate(${this.u * b.clientWidth}px,${this.v * b.clientHeight}px)`; },
  cellAt(u, v){ const n = Game.n, c = Math.min(n - 1, Math.floor(u * n)), r = Math.min(n - 1, Math.floor(v * n)); return r * n + c; },
  fly(u, v, piece){
    const b = $('board').getBoundingClientRect(), tx = b.left + u * b.width, ty = b.top + v * b.height, a = $('arrow');
    a.src = PIECE[piece]; a.hidden = false; Sfx.shoot();
    const anim = a.animate([{ transform: `translate(${innerWidth / 2}px,${innerHeight + 60}px) scale(2.2) rotate(-200deg)` }, { transform: `translate(${tx}px,${ty}px) scale(.55) rotate(0deg)` }],
      { duration: Fx.still() ? 1 : 300, easing: 'cubic-bezier(.2,.7,.3,1)' });
    return new Promise(res => { anim.onfinish = anim.oncancel = () => { a.hidden = true; res(); }; });
  },
  async fire(){
    if (!this.on || this.busy || !Game.canAct()) return;
    this.busy = true; this.on = false; cancelAnimationFrame(this.raf);
    const u = this.u, v = this.v, i = this.cellAt(u, v);
    await this.fly(u, v, Game.turn);
    this.busy = false; $('aim').hidden = true;
    if (Game.board[i]) Game.requestMiss(); else Game.request(i);
  },
  async botShoot(target){
    const n = Game.n; let i = target;
    if (Math.random() > CONFIG.aim[Game.level]){   // máy bắn lệch sang ô kế bên
      const r = Math.floor(target / n), c = target % n, near = [];
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]){ const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < n && cc >= 0 && cc < n) near.push(rr * n + cc); }
      i = near[Math.floor(Math.random() * near.length)];
    }
    this.busy = true;
    const aim = $('aim'), tu = (i % n + .5) / n, tv = (Math.floor(i / n) + .5) / n, su = this.u, sv = this.v, T = 700, s0 = performance.now();
    aim.hidden = false; aim.classList.add('bot');
    await new Promise(res => { const step = now => { const k = Math.min(1, (now - s0) / T), e = 1 - Math.pow(1 - k, 3);
      this.u = su + (tu - su) * e; this.v = sv + (tv - sv) * e; this.place(); k < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
    await this.fly(tu, tv, Game.turn);
    this.busy = false; aim.hidden = true;
    if (Game.over || !Game.isBotTurn()) return;    // ván đã đổi trong lúc bắn
    if (Game.board[i]) Game.miss(); else Game.play(i);
  }
};

/* 9. Net – chơi với bạn qua link. Chủ phòng giữ trạng thái ván, máy khách gửi nước đi */
const Net = {
  peer: null, conn: null, code: '', isHost: false, lib: null, last: 0, beat: 0,
  loadLib(){ return this.lib ||= new Promise((res, rej) => { if (window.Peer) return res(); const s = document.createElement('script'); s.src = 'vendor/peerjs.min.js'; s.onload = res; s.onerror = () => { this.lib = null; rej(new Error('lib')); }; document.head.appendChild(s); }); },
  link(){ return location.origin + location.pathname + '?room=' + this.code; },
  async host(){
    this.close(true);
    try { await this.loadLib(); } catch { return UI.toast('Không tải được phần kết nối. Kiểm tra mạng rồi thử lại.'); }
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    this.code = Array.from({ length: 4 }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
    this.isHost = true;
    const peer = this.peer = new Peer(CONFIG.roomPrefix + this.code, CONFIG.peerOptions);
    peer.on('open', () => UI.friendWait(this.code, this.link()));
    peer.on('connection', c => {
      if (this.conn){ c.close(); return; }       // phòng chỉ có 2 người
      this.bind(c);
      c.on('open', () => { Sfx.join(); UI.closeOverlays(); UI.startMatch({ mode: 'online', remote: false, my: Store.p.team || 'X' }); Track.send('phong', { role: 'chu_phong' }); });
    });
    peer.on('error', e => this.fail(e));
  },
  async join(code){
    this.close(true);
    code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 4) return UI.toast('Mã phòng gồm 4 ký tự.');
    UI.toast('Đang vào phòng ' + code + '…', 8000);
    try { await this.loadLib(); } catch { return UI.toast('Không tải được phần kết nối. Kiểm tra mạng rồi thử lại.'); }
    this.code = code; this.isHost = false;
    const peer = this.peer = new Peer(CONFIG.peerOptions);
    peer.on('open', () => { const c = peer.connect(CONFIG.roomPrefix + code, { reliable: true }); this.bind(c);
      c.on('open', () => { Sfx.join(); UI.closeOverlays(); Track.send('phong', { role: 'khach' }); }); });
    peer.on('error', e => this.fail(e));
  },
  bind(c){
    this.conn = c; this.last = Date.now();
    c.on('data', m => this.onData(m));
    c.on('close', () => this.left(c));
    // nhịp tim: 10 giây không thấy tín hiệu thì coi như bạn kia đã rời phòng
    clearInterval(this.beat);
    this.beat = setInterval(() => { if (this.conn !== c) return; this.send({ t: 'ping' }); if (Date.now() - this.last > 10000) this.left(c); }, 3000);
  },
  left(c){ if (this.conn !== c) return; this.close(true); UI.toast('Bạn kia đã rời phòng.'); UI.home(); },
  onData(m){
    if (!m || typeof m !== 'object') return;
    this.last = Date.now();
    if (m.t === 'ping') return;
    if (m.t === 'bye') return this.left(this.conn);
    if (this.isHost){
      const guest = other(Game.my);
      if (Game.over || Game.turn !== guest){ if (m.t === 'again' && Game.over) Game.start(); return; }
      if (m.t === 'move' && Number.isInteger(m.i) && m.i >= 0 && m.i < Game.board.length) Game.play(m.i);
      else if (m.t === 'miss') Game.miss();
    } else if (m.t === 'state'){
      const first = $('game').hidden;
      Game.load(m.s); if (first) UI.showGame();
      if (m.ev.type === 'start') Game.t0 = Date.now();
      Game.show(m.ev);
    }
  },
  send(m){ if (this.conn && this.conn.open) this.conn.send(m); },
  fail(e){
    const msg = e && e.type === 'peer-unavailable' ? 'Không tìm thấy phòng này. Kiểm tra lại mã nha.'
      : e && e.type === 'unavailable-id' ? 'Mã phòng bị trùng, bấm tạo lại nha.' : 'Kết nối không ổn. Thử lại sau ít phút nha.';
    this.close(true); UI.toast(msg); UI.friendMenu();
  },
  close(silent){
    this.send({ t: 'bye' }); clearInterval(this.beat);
    const p = this.peer; this.peer = null; this.conn = null; this.code = '';
    if (p) try { p.destroy(); } catch {}
    if (!silent) UI.toast('Đã rời phòng.');
  }
};

/* 10. UI */
const UI = {
  opts: { arena: 'classic', size: '3-3' },
  toastTimer: 0,
  toast(text, ms = 3200){ const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { t.hidden = true; }, ms); },
  seg(id, val){ $(id).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === val)); },
  closeOverlays(){ ['friend', 'result', 'teamPick'].forEach(id => { $(id).hidden = true; }); $('toast').hidden = true; },

  home(){
    clearTimeout(Game.botTimer); Arena.stop(); Game.over = true;
    $('game').hidden = true; $('home').hidden = false; $('result').hidden = true;
    const p = Store.p, t = p.team || 'X';
    document.body.dataset.team = t;
    $('meImg').src = PIECE[t]; $('meTeam').textContent = 'Phe ' + t;
    $('meStats').textContent = `${p.points} điểm · ${p.wins} trận thắng` + (p.streak > 1 ? ` · 🔥 ${p.streak} ngày liên tiếp` : '');
    this.seg('optArena', this.opts.arena); this.seg('optSize', this.opts.size);
    $('sizeHint').textContent = this.opts.size === '3-3' ? 'Mỗi người chỉ giữ 3 quân. Đặt quân thứ 4 thì quân cũ nhất biến mất.' : '';
    this.sound();
    if (!p.team) $('teamPick').hidden = false;
  },
  sound(){ const on = Store.p.sound; $('soundHome').textContent = on ? '🔊 Âm thanh: bật' : '🔇 Âm thanh: tắt'; $('soundGame').textContent = on ? '🔊' : '🔇'; },
  startMatch(o){
    const [n, k] = this.opts.size.split('-').map(Number);
    Game.setup(Object.assign({ n, k, arena: this.opts.arena, remote: false, my: Store.p.team || 'X' }, o));
    this.showGame(); Game.start();
  },
  showGame(){ $('home').hidden = true; $('game').hidden = false; this.closeOverlays(); },

  names(){
    const my = Game.my, op = other(my);
    if (Game.mode === 'local') return { X: 'Người X', O: 'Người O' };
    return { [my]: 'Bạn', [op]: Game.mode === 'bot' ? 'Máy' : 'Bạn bè' };
  },
  render(last){
    const { n, board, result } = Game, el = $('board');
    el.style.gridTemplate = `repeat(${n},minmax(0,1fr)) / repeat(${n},minmax(0,1fr))`;
    el.style.gap = n > 5 ? '4px' : n > 3 ? '6px' : '8px';
    el.style.padding = n > 5 ? '7px' : '10px';
    el.classList.toggle('over', !!result);
    // quân sắp biến mất ở lượt này
    const fading = Game.vanish && !result && Game.q[Game.turn].length >= CONFIG.keep ? Game.q[Game.turn][0] : -1;
    el.innerHTML = '';
    board.forEach((v, i) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'cell' + (v ? ` filled ${v}` : '') + (result?.line?.includes(i) ? ' win' : '') + (i === last ? ' pop' : '') + (i === fading ? ' fade' : '');
      c.style.borderRadius = n > 5 ? '8px' : n > 3 ? '10px' : '14px';
      c.setAttribute('aria-label', `Ô ${Math.floor(i / n) + 1}-${i % n + 1}${v ? ': ' + v : ''}`);
      if (v) c.innerHTML = `<img src="${PIECE[v]}" alt="${v}">`;
      c.onclick = () => { if (Game.arena === 'classic') Game.request(i); };
      el.appendChild(c);
    });
    const names = this.names(), icon = p => `<img src="${PIECE[p]}" alt="${p}">`;
    $('nX').textContent = names.X; $('nO').textContent = names.O;
    $('sX').textContent = Game.score.X; $('sO').textContent = Game.score.O;
    $('cX').classList.toggle('turn', !result && Game.turn === 'X');
    $('cO').classList.toggle('turn', !result && Game.turn === 'O');
    $('arenaName').textContent = Game.arena === 'archery' ? '🏹 Bắn cung' : 'Cổ điển';
    $('roomTag').textContent = Game.mode === 'online' ? 'Phòng ' + Net.code : Game.mode === 'local' ? 'Chung 1 máy' : Game.level === 'easy' ? 'Máy dễ' : 'Máy khó';
    const st = $('status'); st.classList.toggle('end', !!result);
    st.innerHTML = result?.winner ? `🎉 ${icon(result.winner)} ${names[result.winner]} thắng!` : result?.draw ? '🤝 Hòa rồi!' : `Lượt của ${icon(Game.turn)} ${names[Game.turn]}`;
    const archery = Game.arena === 'archery', mine = !result && (Game.mode === 'local' || Game.turn === Game.my);
    $('undo').hidden = archery || Game.mode === 'online';
    $('undo').disabled = Game.over || !Game.history.length;
    $('fire').hidden = !archery; $('fire').disabled = !mine;
    $('gameHint').textContent = result ? '' : archery ? (mine ? 'Canh tâm ngắm rồi bấm BẮN. Trúng ô đã có quân là mất lượt.' : 'Đợi đối thủ bắn…')
      : fading >= 0 && mine ? 'Quân đang nhấp nháy sẽ biến mất khi bạn đặt quân mới.' : '';
  },
  cellCenter(i){ const c = $('board').children[i]; if (!c) return { x: innerWidth / 2, y: innerHeight / 2 }; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },

  result(outcome, r, gain){
    if ($('game').hidden) return;
    const team = Store.p.team || 'X';
    $('resultImg').src = PIECE[r.winner || team];
    $('resultTitle').textContent = outcome === 'win' ? 'Bạn thắng!' : outcome === 'lose' ? (Game.mode === 'bot' ? 'Máy thắng rồi' : 'Bạn bè thắng rồi') : outcome === 'draw' ? 'Hòa rồi!' : `Người ${r.winner} thắng!`;
    $('resultSub').textContent = outcome === 'win' ? `+${gain} điểm cho Phe ${team}` : outcome === 'lose' ? 'Làm ván nữa gỡ lại nha!' : outcome === 'local' ? 'Đổi lượt đi trước, làm ván nữa nha!' : '';
    $('result').hidden = false;
  },

  friendMenu(){ $('friendMenu').hidden = false; $('friendWait').hidden = true; },
  friendWait(code, link){ $('toast').hidden = true; $('friend').hidden = false; $('friendMenu').hidden = true; $('friendWait').hidden = false; $('roomCode').textContent = code; $('roomLink').textContent = link; },

  /* Khảo sát: tuổi, giới tính, chấm điểm Tayo X và Tayo O */
  ans: {},
  surveyMaybe(){ const p = Store.p; if (p.survey === 'done' || $('survey').hidden === false) return false; if (p.plays === 1 || p.plays === 4){ this.surveyOpen(); return true; } return false; },
  surveyOpen(){ this.ans = {}; $('survey').querySelectorAll('.chips button').forEach(b => b.setAttribute('aria-pressed', 'false')); $('surveyMore').hidden = false; $('surveySend').disabled = true; $('survey').hidden = false; },
  surveyPick(q, v){
    this.ans[q] = v; const a = this.ans;
    $('surveyMore').hidden = a.age === '<16';
    $('surveySend').disabled = !(a.age === '<16' || (a.age && a.gender && a.rateX && a.rateO));
  },
  surveySend(){
    const a = this.ans, p = Store.p;
    if (a.age === '<16'){ Track.send('khao_sat', { age: '<16' }, true); p.minor = true; }   // chỉ đếm, không kèm mã người chơi
    else Track.send('khao_sat', { age: a.age, gender: a.gender, rateX: a.rateX, rateO: a.rateO });
    p.survey = 'done'; p.points += CONFIG.points.survey; Store.save();
    $('survey').hidden = true; Sfx.win(); Fx.confetti();
    this.toast(`Cảm ơn bạn! +${CONFIG.points.survey} điểm cho Phe ${p.team || 'X'}`);
    if (!$('home').hidden) this.home();
  }
};

/* Gắn sự kiện */
function wire(){
  document.addEventListener('click', e => { if (e.target.closest('button') && !e.target.closest('.cell')) Sfx.click(); }, true);
  $('optArena').onclick = e => { const b = e.target.closest('button'); if (b){ UI.opts.arena = b.dataset.v; UI.home(); } };
  $('optSize').onclick = e => { const b = e.target.closest('button'); if (b){ UI.opts.size = b.dataset.v; UI.home(); } };
  $('playEasy').onclick = () => UI.startMatch({ mode: 'bot', level: 'easy' });
  $('playHard').onclick = () => UI.startMatch({ mode: 'bot', level: 'hard' });
  $('playFriend').onclick = () => { UI.friendMenu(); $('friend').hidden = false; };
  $('changeTeam').onclick = () => { $('teamPick').hidden = false; };
  $('teamPick').onclick = e => { const b = e.target.closest('[data-team]'); if (!b) return; const first = !Store.p.team; Store.p.team = b.dataset.team; Store.save(); $('teamPick').hidden = true; Sfx.join(); UI.home(); Track.send(first ? 'chon_phe' : 'doi_phe', {}); };
  const toggleSound = () => { Store.p.sound = !Store.p.sound; Store.save(); UI.sound(); Sfx.click(); };
  $('soundHome').onclick = toggleSound; $('soundGame').onclick = toggleSound;

  $('hostRoom').onclick = () => { UI.toast('Đang tạo phòng…', 8000); Net.host(); };
  $('joinRoom').onclick = () => Net.join($('joinCode').value);
  $('joinCode').onkeydown = e => { if (e.key === 'Enter') Net.join($('joinCode').value); };
  $('playLocal').onclick = () => UI.startMatch({ mode: 'local' });
  $('friendClose').onclick = () => { $('friend').hidden = true; if ($('game').hidden) Net.close(true); };
  $('shareRoom').onclick = async () => {
    const url = Net.link(), text = 'Vô XO Game đấu caro với mình nè! Mã phòng: ' + Net.code;
    try { if (navigator.share) await navigator.share({ title: 'XO Game', text, url }); else throw 0; }
    catch { try { await navigator.clipboard.writeText(url); UI.toast('Đã sao chép link. Dán vào Zalo hoặc Messenger gửi bạn nha.'); } catch { UI.toast('Giữ vào link ở trên để sao chép nha.'); } }
  };
  $('copyRoom').onclick = async () => { try { await navigator.clipboard.writeText(Net.link()); UI.toast('Đã sao chép link.'); } catch { UI.toast('Giữ vào link ở trên để sao chép nha.'); } };

  $('back').onclick = () => { if (Game.mode === 'online') Net.close(true); UI.home(); UI.surveyMaybe(); };
  $('undo').onclick = () => Game.undo();
  const again = () => { $('result').hidden = true; if (Game.remote) Net.send({ t: 'again' }); else Game.start(); };
  $('restart').onclick = again;
  $('resultAgain').onclick = () => { again(); UI.surveyMaybe(); };
  $('resultHome').onclick = () => { if (Game.mode === 'online') Net.close(true); UI.home(); UI.surveyMaybe(); };
  $('fire').onclick = () => Arena.fire();
  $('boardWrap').onclick = () => { if (Game.arena === 'archery') Arena.fire(); };
  document.addEventListener('keydown', e => { if (e.code === 'Space' && Game.arena === 'archery' && !$('game').hidden && Arena.on){ e.preventDefault(); Arena.fire(); } });

  $('survey').onclick = e => { const b = e.target.closest('.chips button'); if (!b) return; const box = b.parentElement;
    box.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); UI.surveyPick(box.dataset.q, b.dataset.v); };
  $('surveySkip').onclick = () => { $('survey').hidden = true; };
  $('surveySend').onclick = () => UI.surveySend();
  addEventListener('pagehide', () => { Track.flush(); Net.send({ t: 'bye' }); });
}

/* Khởi động */
Store.load(); Fx.init(); wire(); UI.home(); Track.flush();
(() => {  // vào bằng link mời: ?room=ABCD
  const q = new URLSearchParams(location.search), room = q.get('room');
  if (!room) return;
  history.replaceState(null, '', location.pathname);
  $('teamPick').hidden = true;   // khách vào chơi liền, chọn phe sau khi về sảnh
  Net.join(room);
})();
