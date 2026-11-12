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
  // Nơi lưu data: Supabase (khóa công khai "anon/publishable" đặt vào key; khóa này vốn để cho web dùng, quyền chỉ gồm 2 hàm ghi() và bang_vang_hom_nay()).
  supabase: { url: 'https://zcqcigmmbmuoxhsfwuyb.supabase.co', key: 'sb_publishable_XPl3VOgRv3YwbeHHntNOoA_t7x4AXTS' },
  // Dự phòng cũ (Google Sheet qua Apps Script), chỉ dùng khi Supabase chưa có key
  sheetUrl: 'https://script.google.com/macros/s/AKfycbx3pKc0ixYv2UJg0wSRFT0pqvSwxgi-Vw-AhOHT0OCMl9LvGGWyp_eruihiv543b839/exec',
  points: { easy: 5, medium: 10, hard: 20, online: 10, survey: 20 },
  volume: 0.5,                   // âm lượng chung của game, 0 đến 1
  // Nhạc nền: đặt file MP3 vào thư mục assets rồi ghi đường dẫn vào đây, ví dụ 'assets/nhac-teaser.mp3'. Để trống là không có nhạc.
  music: { teaser: '', lobby: '' },
  musicVolume: 0.35,
  botDelay: 450,
  growMax: 14,                   // bàn mở rộng: lớn nhất 14×14 để ô không quá nhỏ trên điện thoại
  keep: 3,                       // bàn 3×3: mỗi người chỉ giữ 3 quân, quân cũ nhất biến mất
  storageKey: 'xo_profile_v2',
  roomPrefix: 'tayoxo-',
  peerOptions: window.XO_PEER_OPTIONS || {},
  aim: { easy: 0.65, medium: 0.9, hard: 0.97 },   // độ chính xác của máy ở sân bắn cung
  wind: { easy: 0.35, medium: 0.6, hard: 0.8 },    // gió mạnh nhất (tính theo ô)
  spinSeconds: 7                                    // sân bắn cung cấp Khó: bia quay 1 vòng mất bấy nhiêu giây
};
const PIECE = { X: 'assets/x.webp', O: 'assets/o.webp' };
const PACK = { X: 'assets/pack-x.webp', O: 'assets/pack-o.webp' };
const KID_AGES = ['6-9', '10-14'];   // nhóm tuổi nhỏ: câu trả lời không gắn mã người chơi
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
  busy: false, fails: 0, timer: 0,
  send(event, data, anonymous){
    const p = Store.p;
    const row = Object.assign({ ts: new Date().toISOString(), event,
      rid: (p.uid || 'x') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),   // mã riêng từng dòng: gửi lại không bị lưu trùng
      uid: anonymous ? '' : p.uid, src: p.src, team: p.team || '',
      device: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop' }, data);
    p.queue.push(row); if (p.queue.length > 300) p.queue.shift();
    Store.save(); this.flush();
  },
  ready(){ return !!(CONFIG.supabase.key || CONFIG.sheetUrl); },
  // Gửi tối đa 50 dòng mỗi lượt. Chỉ xóa khỏi hàng chờ khi máy chủ báo đã lưu; lỗi thì chờ lâu dần (có ngẫu nhiên) rồi gửi lại.
  flush(){
    const p = Store.p;
    if (!this.ready() || !p.queue.length || this.busy) return;
    this.busy = true; clearTimeout(this.timer);
    const batch = p.queue.slice(0, 50), sb = CONFIG.supabase;
    const done = ok => {
      this.busy = false;
      if (ok){ p.queue = p.queue.slice(batch.length); Store.save(); this.fails = 0; if (p.queue.length) this.flush(); }
      else { this.fails = Math.min(this.fails + 1, 6); this.timer = setTimeout(() => this.flush(), Math.min(60000, 2000 * 2 ** this.fails) * (.7 + Math.random() * .6)); }
    };
    if (sb.key){
      fetch(sb.url + '/rest/v1/rpc/ghi', { method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', apikey: sb.key, Authorization: 'Bearer ' + sb.key },
        body: JSON.stringify({ rows: batch }) })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(v => done(v === 'ok'), () => done(false));
    } else {
      // text/plain + no-cors: cách gửi mà Apps Script nhận được từ web tĩnh (không biết được có lưu thành công hay không)
      fetch(CONFIG.sheetUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(batch), keepalive: true })
        .then(() => done(true), () => done(false));
    }
  }
};

/* 4a. Sfx – âm thanh tổng hợp bằng WebAudio */
const Sfx = {
  ctx: null,
  ac(){
    if (!Store.p.sound) return null;
    try { if (!this.ctx){ this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.out = this.ctx.createGain(); this.out.gain.value = CONFIG.volume; this.out.connect(this.ctx.destination); } if (this.ctx.state === 'suspended') this.ctx.resume(); } catch { return null; }
    return this.ctx;
  },
  tone(f, dur, type = 'sine', vol = .18, at = 0, to){
    const c = this.ac(); if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + .02);
  },
  noise(dur, vol = .2, at = 0, freq = 1800){
    const c = this.ac(); if (!c) return;
    const t = c.currentTime + at, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol;
    s.connect(f).connect(g).connect(this.out); s.start(t);
  },
  // Âm thanh dịu: chỉ dùng sóng tròn (sine/triangle), không tiếng rè, không tiếng bấm ở mọi nút
  boom(){ this.tone(110, .45, 'sine', .3, 0, 55); this.tone(330, .35, 'triangle', .1, .04, 880); },
  click(){ this.tone(520, .04, 'sine', .06); },
  place(p){ if (p === 'X'){ this.tone(170, .16, 'sine', .32, 0, 80); this.tone(340, .08, 'triangle', .08); } else { this.tone(520, .12, 'sine', .2, 0, 760); } },
  shoot(){ this.noise(.14, .1, 0, 1400); this.tone(620, .16, 'sine', .08, 0, 240); },
  miss(){ this.tone(260, .22, 'sine', .14, 0, 130); },
  vanish(){ this.tone(620, .18, 'sine', .06, 0, 240); },
  join(){ this.tone(523, .1, 'sine', .14); this.tone(784, .16, 'sine', .14, .1); },
  win(){ [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .2, 'triangle', .13, i * .11)); this.tone(1319, .45, 'sine', .12, .44); },
  lose(){ [392, 330, 262].forEach((f, i) => this.tone(f, .26, 'sine', .13, i * .2)); }
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

/* 4c. Music – nhạc nền cho teaser và sảnh (tắt khi vào trận) */
const Music = {
  el: null, cur: '',
  play(name){
    const src = CONFIG.music[name];
    if (!src){ this.stop(); return; }
    if (this.cur === name && this.el && !this.el.paused) return;
    if (this.cur !== name){ this.stop(); this.cur = name; this.el = new Audio(src); this.el.loop = name !== 'teaser'; this.el.volume = CONFIG.musicVolume; }
    if (Store.p.sound) this.el.play().catch(() => {});       // trình duyệt chỉ cho phát sau khi người chơi chạm màn hình
  },
  stop(){ if (this.el) this.el.pause(); this.el = null; this.cur = ''; },
  sync(){ if (!this.el) return; if (Store.p.sound && !document.hidden) this.el.play().catch(() => {}); else this.el.pause(); }
};

/* 4d. Board – bảng vàng X vs O: số trận thắng của mỗi phe trong ngày, lấy từ Google Sheet */
const Board = {
  data: null, at: 0,
  load(){
    const sb = CONFIG.supabase;
    if (!(sb.key || CONFIG.sheetUrl) || Date.now() - this.at < 60000) return;     // mỗi phút hỏi tối đa 1 lần
    this.at = Date.now();
    const req = sb.key
      ? fetch(sb.url + '/rest/v1/rpc/bang_vang_hom_nay', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: sb.key, Authorization: 'Bearer ' + sb.key }, body: '{}' })
      : fetch(CONFIG.sheetUrl + '?board=1');
    req.then(r => r.json()).then(d => {
      if (d && Number.isFinite(d.X) && Number.isFinite(d.O)){ this.data = { X: d.X, O: d.O }; this.show(); }
    }).catch(() => {});
  },
  bump(team){ if (this.data && (team === 'X' || team === 'O')){ this.data[team]++; this.show(); } },   // mình vừa thắng: cộng ngay cho thấy
  html(){
    const d = this.data, total = d ? d.X + d.O : 0, px = total ? Math.round(d.X / total * 100) : 50;
    const foot = !d ? '<div class="gold-foot one"><span>Phe nào sẽ dẫn đầu hôm nay?</span></div>'
      : !total ? '<div class="gold-foot one"><span>Hôm nay chưa có trận thắng nào. Mở màn đi!</span></div>'
      : `<div class="gold-foot"><span>Phe X · ${d.X} trận thắng</span><span>${d.O} trận thắng · Phe O</span></div>`;
    return `<div class="gold-top"><img src="${PIECE.X}" alt="Phe X"><b class="gx">${px}%</b><span class="gold-title">Cuộc chiến X vs O hôm nay</span><b class="go">${100 - px}%</b><img src="${PIECE.O}" alt="Phe O"></div>
      <div class="tug"><i style="width:${px}%"></i></div>${foot}`;
  },
  show(){
    $('goldIntro').innerHTML = this.html();
    const h = $('goldHome'); h.hidden = !this.data; if (this.data) h.innerHTML = this.html();   // ở sảnh: chỉ hiện khi đã có số thật
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
  // Bàn mở rộng: quân vừa đặt tạo đúng (k-1) quân liên tiếp mà ô nối tiếp ở ít nhất một đầu nằm ngoài mép
  nearWinAtEdge(board, n, k, i){
    const p = board[i], row = Math.floor(i / n), col = i % n, inside = (r, c) => r >= 0 && c >= 0 && r < n && c < n;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]){
      let count = 1; const ends = [];
      for (const s of [-1, 1]){
        let r = row + dr * s, c = col + dc * s;
        while (inside(r, c) && board[r * n + c] === p){ count++; r += dr * s; c += dc * s; }
        ends.push(inside(r, c));
      }
      if (count === k - 1 && ends.includes(false)) return true;
    }
    return false;
  },
  empty(board){ return board.map((v, i) => v ? null : i).filter(i => i !== null); }
};

/* 6. AI */
const AI = {
  move(g, level){
    if (level === 'easy' && Math.random() < 0.6) return this.random(g);
    if (g.vanish) return this.vanish(g, level === 'hard' ? 10 : 6);       // Khó: nhìn xa hơn 4 nước
    return level === 'hard' ? this.deep(g) : this.heuristic(g);
  },
  random(g){ const e = Rules.empty(g.board); return e[Math.floor(Math.random() * e.length)]; },

  // Bàn 3×3 "không hòa": tìm kiếm có giới hạn độ sâu, tính cả quân sắp biến mất
  vanish(g, DEPTH = 6){
    const me = g.turn, b = [...g.board], q = { X: [...g.q.X], O: [...g.q.O] };
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

  // Giá trị của việc đặt quân p vào ô i (bàn lớn): chuỗi càng dài, càng thoáng 2 đầu thì điểm càng cao
  lineVal(board, n, k, i, p){
    const r = Math.floor(i / n), c = i % n; let total = 0;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]){
      let cnt = 1, open = 0;
      for (const s of [1, -1]){
        let rr = r + dr * s, cc = c + dc * s;
        while (rr >= 0 && rr < n && cc >= 0 && cc < n && board[rr * n + cc] === p){ cnt++; rr += dr * s; cc += dc * s; }
        if (rr >= 0 && rr < n && cc >= 0 && cc < n && !board[rr * n + cc]) open++;
      }
      if (cnt >= k) total += 1e6; else total += Math.pow(10, cnt) * (open || 0.1);
    }
    return total;
  },
  center(n, i){ return n / 2 - Math.abs(Math.floor(i / n) - (n - 1) / 2) - Math.abs(i % n - (n - 1) / 2) * 0.5; },
  // Cấp Vừa: chấm điểm từng ô, có chút ngẫu nhiên
  heuristic(g){
    const { n, k, board } = g, me = g.turn, op = other(me);
    let best = null, bestV = -1;
    for (const i of Rules.empty(board)){
      const v = this.lineVal(board, n, k, i, me) * 1.1 + this.lineVal(board, n, k, i, op) + this.center(n, i) + Math.random() * .5;
      if (v > bestV){ bestV = v; best = i; }
    }
    return best;
  },
  // Điểm theo "cửa sổ" k ô liên tiếp chứa ô i mà chưa bị đối thủ chặn: bắt được cả chuỗi đứt quãng (X X _ X)
  windowVal(board, n, k, i, p){
    const r = Math.floor(i / n), c = i % n; let total = 0;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) for (let off = 1 - k; off <= 0; off++){
      let own = 0, ok = true;
      for (let t = 0; t < k; t++){
        const rr = r + (off + t) * dr, cc = c + (off + t) * dc;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n){ ok = false; break; }
        const v = rr === r && cc === c ? p : board[rr * n + cc];
        if (v === p) own++; else if (v){ ok = false; break; }
      }
      if (ok) total += own >= k ? 1e6 : Math.pow(7, own - 1);
    }
    return total;
  },
  // các ô mà p đặt vào là thắng ngay
  winsFor(board, n, k, p, cells){ return cells.filter(i => !board[i] && this.lineVal(board, n, k, i, p) >= 1e6); },
  // Chấm cả thế cờ theo góc nhìn của `me`: cộng các cửa sổ chỉ có quân mình, trừ các cửa sổ chỉ có quân đối thủ
  evalBoard(b, n, k, me){
    let total = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]){
      const er = r + (k - 1) * dr, ec = c + (k - 1) * dc;
      if (er < 0 || er >= n || ec < 0 || ec >= n) continue;
      let mine = 0, theirs = 0;
      for (let t = 0; t < k; t++){ const v = b[(r + t * dr) * n + c + t * dc]; if (v === me) mine++; else if (v) theirs++; }
      if (mine && !theirs) total += Math.pow(8, mine - 1); else if (theirs && !mine) total -= Math.pow(8, theirs - 1) * 1.05;
    }
    return total;
  },
  // Cấp Khó (bàn lớn): tính trước 4 nước (mình, đối thủ, mình, đối thủ), mỗi lượt xét 8 nước hứa hẹn nhất
  deep(g){
    const { n, k } = g, me = g.turn, b = [...g.board], DEPTH = 4, WIDE = 8;
    const cand = () => {
      const out = [];
      for (let i = 0; i < b.length; i++){
        if (b[i]) continue; const r = Math.floor(i / n), c = i % n; let ok = false;
        for (let dr = -2; dr <= 2 && !ok; dr++) for (let dc = -2; dc <= 2; dc++){ const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < n && cc < n && b[rr * n + cc]){ ok = true; break; } }
        if (ok) out.push(i);
      }
      return out.length ? out : [Math.floor(n / 2) * n + Math.floor(n / 2)];
    };
    const order = (cells, p) => { const o = other(p);
      return cells.map(i => ({ i, v: this.windowVal(b, n, k, i, p) * 1.1 + this.windowVal(b, n, k, i, o) + this.center(n, i) * .3 })).sort((x, y) => y.v - x.v); };
    const search = (p, depth, alpha, beta) => {
      const cells = cand(), mine = p === me;
      if (this.winsFor(b, n, k, p, cells).length) return mine ? 1e9 + depth : -1e9 - depth;      // người đang đi thắng ngay
      if (depth === 0) return this.evalBoard(b, n, k, me);
      const must = this.winsFor(b, n, k, other(p), cells);                                        // buộc phải chặn
      const moves = must.length ? must.slice(0, 2) : order(cells, p).slice(0, WIDE).map(x => x.i);
      let best = mine ? -Infinity : Infinity;
      for (const i of moves){
        b[i] = p; const v = search(other(p), depth - 1, alpha, beta); b[i] = null;
        if (mine){ if (v > best) best = v; if (v > alpha) alpha = v; } else { if (v < best) best = v; if (v < beta) beta = v; }
        if (beta <= alpha) break;
      }
      return best;
    };
    const cells = cand();
    let w = this.winsFor(b, n, k, me, cells); if (w.length) return w[0];
    w = this.winsFor(b, n, k, other(me), cells);
    const moves = w.length ? w : order(cells, me).slice(0, WIDE + 2).map(x => x.i);
    let best = moves[0], bestV = -Infinity;
    for (const i of moves){ b[i] = me; const v = search(other(me), DEPTH - 1, -Infinity, Infinity); b[i] = null; if (v > bestV){ bestV = v; best = i; } }
    return best;
  }
};

/* 7. Game */
const Game = {
  n: 3, k: 3, vanish: true, grow: false, arena: 'classic',
  mode: 'bot', level: 'hard', remote: false,   // mode: bot | local | online ; remote = máy khách trong phòng online
  board: [], q: { X: [], O: [] }, turn: 'X', my: 'X', history: [], over: false, result: null,
  score: { X: 0, O: 0 }, starter: 'X', moves: 0, t0: 0, botTimer: null,

  setup(opts){ Object.assign(this, opts); this.n0 = this.n; this.vanish = this.n === 3; this.score = { X: 0, O: 0 }; this.starter = 'X'; },
  start(){
    clearTimeout(this.botTimer); Arena.stop();
    if (this.n0) this.n = this.n0;
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
    this.moves++;
    let r = Rules.check(this.board, this.n, this.k), grew = false, at = i;
    if (!r?.winner && this.grow && this.n < CONFIG.growMax && Rules.nearWinAtEdge(this.board, this.n, this.k, i)){
      at = this.resize(1, i); grew = 'edge'; r = null;     // thêm 1 vòng ô ở cả bốn phía, đối thủ đi tiếp để chặn
    } else if (r?.draw){
      at = this.resize(1, i); grew = 'full'; r = null;     // kín bàn mà chưa ai thắng: mở rộng tiếp, không có hòa
    }
    this.history.push({ i, p, removed, grew });
    if (r){
      this.over = true; this.result = r;
      if (r.winner) this.score[r.winner]++;
      this.starter = other(this.starter);
    } else this.turn = other(p);
    this.commit({ type: 'move', i: at, p, removed, grew });
    return true;
  },
  // d = 1: thêm một vòng ô quanh bàn; d = -1: bỏ vòng ngoài (khi đi lại). Trả về vị trí mới của ô i
  resize(d, i){
    const o = this.n, n = o + 2 * d, map = x => (Math.floor(x / o) + d) * n + (x % o) + d;
    const nb = Array(n * n).fill(null);
    this.board.forEach((v, x) => { if (!v) return; const r = Math.floor(x / o) + d, c = x % o + d; if (r >= 0 && c >= 0 && r < n && c < n) nb[r * n + c] = v; });
    this.board = nb; this.n = n; this.q = { X: this.q.X.map(map), O: this.q.O.map(map) };
    return i === undefined ? -1 : map(i);
  },
  miss(){ const p = this.turn; this.turn = other(p); this.commit({ type: 'miss', p }); },
  undo(){
    if (this.over || !this.history.length || this.mode === 'online' || this.arena !== 'classic') return;
    clearTimeout(this.botTimer);
    const steps = this.mode === 'local' ? 1 : (this.turn === this.my ? 2 : 1);
    for (let s = 0; s < steps && this.history.length; s++){
      const { i, p, removed, grew } = this.history.pop();
      if (grew) this.resize(-1);
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
  snap(){ const { n, k, vanish, grow, arena, level, board, q, turn, over, result, score, moves, my } = this; return { n, k, vanish, grow, arena, level, board, q, turn, over, result, score, moves, host: my }; },
  load(s){ const { host, ...rest } = s; Object.assign(this, rest); this.mode = 'online'; this.remote = true; this.my = other(host); },

  show(ev){
    UI.render(ev.type === 'move' ? ev.i : undefined, ev.grew);
    if (ev.type === 'move'){
      if (ev.grew){ const b = $('board').getBoundingClientRect(); Fx.pop('MỞ RỘNG!', b.left + b.width / 2, b.top + b.height / 2); Sfx.join(); UI.toast(ev.grew === 'full' ? `Kín bàn rồi! Bàn mở thành ${this.n}×${this.n}, đấu tiếp nào.` : `4 quân sát mép! Bàn mở thành ${this.n}×${this.n}, chặn lại đi nào.`); }
      Sfx.place(ev.p);
      const c = UI.cellCenter(ev.i); Fx.burst(c.x, c.y, ev.p); Fx.shake($('board'), ev.p === 'X');
      if (ev.removed !== null) setTimeout(() => Sfx.vanish(), 160);
      if (this.result) this.finish();
    } else if (ev.type === 'miss'){
      Sfx.miss(); const r = $('board').getBoundingClientRect(); Fx.pop('TRƯỢT!', r.left + r.width / 2, r.top + r.height / 2);
    } else if (ev.type === 'start'){ $('result').hidden = true; $('winFx').hidden = true; if (this.t0 === 0) this.t0 = Date.now(); }
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
    p.plays++; p.points += gain; if (outcome === 'win'){ p.wins++; Board.bump(p.team); }
    Store.save();
    Track.send('van_dau', { mode: this.mode === 'bot' ? 'may_' + this.level : this.mode, arena: this.arena, size: (this.grow ? 'morong_' : '') + this.n + 'x' + this.n,
      result: outcome, winner: r.winner || '', moves: this.moves, seconds: Math.round((Date.now() - (this.t0 || Date.now())) / 1000), plays: p.plays, streak: p.streak });
    // 1) chữ X hoặc O của bên thắng phóng to giữa màn hình  2) rồi mới hiện bảng kết quả
    setTimeout(() => {
      if (Game.result !== r) return;
      UI.winFx(r.winner); Sfx.boom();
      if (outcome === 'lose') setTimeout(() => Sfx.lose(), 500); else { setTimeout(() => Sfx.win(), 350); Fx.confetti(); }
    }, 500);
    setTimeout(() => { if (Game.result === r){ UI.result(outcome, r, gain); if (!$('game').hidden) UI.surveyMaybe(); } }, 2900);
  }
};

/* 8. Arena – sân bắn cung, góc nhìn người bắn.
   Bàn cờ dựng ở xa. Chạm giữ rồi kéo xuống để giương cung: kéo trái/phải canh hướng, kéo càng sâu mũi tên càng lên cao.
   Tay rung nhẹ và có gió, nên phải canh rồi mới thả. Trúng ô trống thì đặt quân; ra ngoài hoặc trúng ô đã có quân là mất lượt.
   Cấp Khó: bia quay tròn quanh trục đứng và chơi được cả 2 mặt. Mặt sau là chính bàn cờ đó nhìn từ phía sau (đảo trái phải);
   bia quay nghiêng thì hẹp lại, quay ngang cạnh thì bắn không trúng. Mũi tên bay mất nửa giây nên phải bắn đón. */
const Arena = {
  busy: false, on: false, drag: null, raf: 0, u: .5, v: .5, pull: 0, wind: 0, windKey: '', misses: 0,
  spin: false, spin0: 0, spinRaf: 0,
  sync(){
    const archery = Game.arena === 'archery';
    $('game').dataset.arena = Game.arena;
    $('board').classList.toggle('aiming', archery);
    this.setSpin(archery && Game.level === 'hard' && !Game.over);          // mức Khó: bia quay, kể cả khi chơi với bạn
    if (!archery){ this.stop(); return; }
    $('nock').src = PIECE[Game.turn];
    if (!UI.ratioOk) $('bow').style.height = $('bow').offsetWidth * 150 / 240 + 'px';
    if (!Game.over && Game.canAct()) this.enable(); else if (!this.busy) this.stop();
  },
  // --- bia xoay ---
  setSpin(on){
    if (on === this.spin) return;
    this.spin = on; cancelAnimationFrame(this.spinRaf);
    const w = $('boardWrap');
    if (!on){ w.style.transform = ''; w.classList.remove('back'); return; }
    this.spin0 = performance.now();
    const loop = now => { if (!this.spin) return; const c = this.cos(now); w.style.transform = `rotateY(${this.deg(now)}deg)`; w.classList.toggle('back', c < 0); this.spinRaf = requestAnimationFrame(loop); };
    this.spinRaf = requestAnimationFrame(loop);
  },
  deg(now){ return this.spin ? ((now - this.spin0) / 1000 * 360 / CONFIG.spinSeconds) % 360 : 0; },
  cos(now){ return Math.cos(this.deg(now) * Math.PI / 180); },
  // --- khung ngắm cố định trên màn hình (vị trí bàn cờ khi chưa xoay) ---
  ref(){
    const sc = $('scene'), r = sc.getBoundingClientRect(), w = $('boardWrap'), b = $('board');
    const x = sc.clientLeft + w.offsetLeft + b.offsetLeft, y = sc.clientTop + w.offsetTop + b.offsetTop;
    return { x, y, left: r.left + x, top: r.top + y, width: b.offsetWidth, height: b.offsetHeight };
  },
  enable(){
    this.on = true;
    const key = Game.moves + Game.turn + this.misses;      // mỗi lượt bốc gió một lần
    if (key !== this.windKey){
      this.windKey = key;
      const max = Game.moves < 2 ? 0 : CONFIG.wind[Game.level] || .5;
      this.wind = Math.round((Math.random() * 2 - 1) * max * 10) / 10;
    }
    const w = this.wind, t = $('wind');
    t.textContent = w === 0 ? 'Lặng gió' : `Gió ${w > 0 ? '→' : '←'} ${Math.abs(w).toFixed(1)} ô`;
    $('dragHint').hidden = !!Store.p.taught;          // lần đầu: chỉ cách kéo cung
    t.hidden = false;
  },
  stop(){ this.on = false; this.drag = null; cancelAnimationFrame(this.raf); $('aim').hidden = true; $('wind').hidden = true; $('dragHint').hidden = true; this.pose(.5, 0); },
  // vẽ cung: xoay theo hướng ngắm, dây căng theo lực kéo
  pose(u, pull){
    const bow = $('bow'), nock = $('nock'), y = 62 + pull * 66;
    bow.style.transform = `rotate(${(u - .5) * 46}deg)`;
    $('bowString').setAttribute('points', `22,62 120,${y} 218,62`);
    nock.style.transform = `translate(-50%, ${y * bow.clientWidth / 240 - nock.clientHeight * .78}px)`;
  },
  sway(now){ const a = (.16 + Math.min(.2, Game.moves * .015)) / Game.n, t = now / 1000; return [a * Math.sin(t * 2.3), a * Math.sin(t * 1.7 + 1)]; },
  aimAt(u, v){
    const f = this.ref(), aim = $('aim');
    aim.style.setProperty('--s', Math.max(18, Math.min(38, f.width / Game.n * .85)) + 'px');
    aim.style.transform = `translate(${f.x + u * f.width}px,${f.y + v * f.height}px)`;
  },
  down(e){
    if (!this.on || this.busy || !Game.canAct()) return;
    this.drag = { x: e.clientX, y: e.clientY }; this.pull = 0; this.u = .5;
    try { $('scene').setPointerCapture(e.pointerId); } catch {}
    const aim = $('aim'); aim.classList.remove('bot');
    const loop = now => {
      if (!this.drag) return;
      const [sx, sy] = this.sway(now);
      aim.hidden = this.pull < .1; this.aimAt(this.u + sx, this.v + sy); this.pose(this.u, this.pull);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  },
  move(e){
    if (!this.drag) return;
    const sc = $('scene'), maxPull = Math.min(170, sc.clientHeight * .3);
    this.pull = Math.max(0, Math.min(1.12, (e.clientY - this.drag.y) / maxPull));
    this.u = .5 - (e.clientX - this.drag.x) / (sc.clientWidth * .75);   // kéo sang trái thì ngắm sang phải, như ná
    this.v = 1.12 - this.pull * 1.24;
  },
  up(){
    if (!this.drag) return;
    this.drag = null; cancelAnimationFrame(this.raf);
    if (this.pull < .1){ $('aim').hidden = true; this.pose(.5, 0); return; }   // kéo chưa đủ: hủy
    const [sx, sy] = this.sway(performance.now());
    this.fire(this.u + sx + this.wind / Game.n, this.v + sy);
  },
  // Điểm (u, v) trên màn hình rơi vào ô nào của bàn cờ, tính cả góc bia đang xoay. -1 nếu trượt.
  cellAt(u, v, now){
    const c = this.cos(now);
    if (Math.abs(c) < .15) return -1;                       // bia đang quay ngang cạnh
    const bu = .5 + (u - .5) / c;                           // c âm = mặt sau = đảo trái phải
    if (bu < 0 || bu > 1 || v < 0 || v > 1) return -1;
    const b = $('board'), x = bu * b.offsetWidth, y = v * b.offsetHeight;
    let best = -1, bd = Infinity;
    [...b.children].forEach((el, i) => { const d = Math.hypot(el.offsetLeft + el.offsetWidth / 2 - x, el.offsetTop + el.offsetHeight / 2 - y); if (d < bd){ bd = d; best = i; } });
    return best;
  },
  // ngược lại: tâm ô i đang nằm ở đâu trên màn hình tại thời điểm now
  screenOf(i, now){
    const b = $('board'), el = b.children[i];
    const bu = (el.offsetLeft + el.offsetWidth / 2) / b.offsetWidth, bv = (el.offsetTop + el.offsetHeight / 2) / b.offsetHeight;
    return [.5 + (bu - .5) * this.cos(now), bv];
  },
  flight(){ return Fx.still() ? 1 : 560; },
  fly(u, v, piece){
    const f = this.ref(), n = $('nock').getBoundingClientRect(), a = $('arrow');
    const sx = n.left + n.width / 2, sy = n.top + n.height / 2, tx = f.left + u * f.width, ty = f.top + v * f.height, end = Math.max(.28, f.width / Game.n / 80);
    a.src = PIECE[piece]; a.hidden = false; $('nock').style.visibility = 'hidden'; Sfx.shoot(); this.pose(this.u, 0);
    const anim = a.animate([
      { transform: `translate(${sx}px,${sy}px) scale(1) rotate(0deg)` },
      { transform: `translate(${(sx + tx) / 2}px,${Math.min(sy, ty) - 70}px) scale(${(1 + end) / 2}) rotate(200deg)`, offset: .55 },
      { transform: `translate(${tx}px,${ty}px) scale(${end}) rotate(360deg)` }], { duration: this.flight(), easing: 'cubic-bezier(.3,.6,.5,1)' });
    return new Promise(res => { anim.onfinish = anim.oncancel = () => { a.hidden = true; $('nock').style.visibility = ''; res(); }; });
  },
  async fire(u, v){
    this.busy = true; this.on = false; $('wind').hidden = true; $('dragHint').hidden = true;
    if (!Store.p.taught){ Store.p.taught = true; Store.save(); }
    await this.fly(u, v, Game.turn);
    const i = this.cellAt(u, v, performance.now());        // tính lúc mũi tên chạm bia, không phải lúc thả tay
    this.busy = false; $('aim').hidden = true; this.pose(.5, 0);
    if (i < 0 || Game.board[i]){ this.misses++; Game.requestMiss(); } else Game.request(i);
  },
  async botShoot(target){
    const n = Game.n; let i = target;
    if (Math.random() > CONFIG.aim[Game.level]){   // máy bắn lệch sang ô kế bên
      const r = Math.floor(target / n), c = target % n, near = [];
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]){ const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < n && cc >= 0 && cc < n) near.push(rr * n + cc); }
      i = near[Math.floor(Math.random() * near.length)];
    }
    this.busy = true;
    const T = 800, lead = T + this.flight();
    // bia đang xoay: máy đợi tới lúc mặt bia đủ rộng rồi mới bắn đón
    while (this.spin && Math.abs(this.cos(performance.now() + lead)) < .5) await new Promise(r => setTimeout(r, 60));
    const s0 = performance.now(), [tu, tv] = this.screenOf(i, s0 + lead);
    const aim = $('aim'), power = Math.min(1, (1.12 - tv) / 1.24);
    aim.hidden = false; aim.classList.add('bot'); this.u = tu;
    await new Promise(res => { const step = now => { const k = Math.min(1, (now - s0) / T), e = 1 - Math.pow(1 - k, 3);
      this.aimAt(.5 + (tu - .5) * e, .5 + (tv - .5) * e); this.pose(.5 + (tu - .5) * e, power * e); k < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step); });
    await this.fly(tu, tv, Game.turn);
    this.busy = false; aim.hidden = true; this.pose(.5, 0);
    if (Game.over || !Game.isBotTurn()) return;    // ván đã đổi trong lúc bắn
    if (Game.board[i]){ this.misses++; Game.miss(); } else Game.play(i);
  }
};

/* 9. Net – chơi với bạn qua link. Chủ phòng giữ trạng thái ván, máy khách gửi nước đi */
const Net = {
  peer: null, conn: null, code: '', isHost: false, lib: null, last: 0, beat: 0,
  loadLib(){ if (this.lib) return this.lib; return this.lib = new Promise((res, rej) => { if (window.Peer) return res(); const s = document.createElement('script'); s.src = 'vendor/peerjs.min.js'; s.onload = res; s.onerror = () => { this.lib = null; rej(new Error('lib')); }; document.head.appendChild(s); }); },
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
  opts: { mode: 'bot', level: 'medium', arena: 'archery', size: '3-3' },
  surveyAsked: false,
  toastTimer: 0,
  ratioOk: !!(window.CSS && CSS.supports && CSS.supports('aspect-ratio', '1')),
  toast(text, ms = 3200){ const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { t.hidden = true; }, ms); },
  seg(id, val){ const box = $(id); box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === val));
    box.style.display = 'none'; void box.offsetHeight; box.style.display = ''; },   // ép vẽ lại cả cụm, tránh sót mảng màu cũ trên iOS
  closeOverlays(){ ['friend', 'result', 'teamPick'].forEach(id => { $(id).hidden = true; }); $('toast').hidden = true; },

  home(){
    clearTimeout(Game.botTimer); Arena.stop(); Arena.setSpin(false); Game.over = true;
    $('game').hidden = true; $('home').hidden = false; $('result').hidden = true; $('winFx').hidden = true;
    const p = Store.p, t = p.team || 'X';
    document.body.dataset.team = t;
    $('meImg').src = PACK[t]; $('meTeam').textContent = 'Phe ' + t;
    $('meStats').textContent = `${p.points} điểm · ${p.wins} trận thắng` + (p.streak > 1 ? ` · 🔥 ${p.streak} ngày liên tiếp` : '');
    this.seg('optArena', this.opts.arena); this.seg('optSize', this.opts.size); this.seg('optLevel', this.opts.level);
    $('optMode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === this.opts.mode));
    const o = this.opts;
    $('startBtn').textContent = o.mode === 'bot' ? 'Vào trận' : 'Vào trận · mời bạn';
    Board.load(); Board.show(); if (Intro.done) Music.play('lobby');
    $('sizeHint').textContent = this.opts.size === '3-3' ? 'Mỗi người chỉ giữ 3 quân. Đặt quân thứ 4 thì quân cũ nhất biến mất.'
      : this.opts.size === '8-5-grow' ? 'Nối 5 quân để thắng. Có 4 quân vướng mép hoặc kín bàn thì bàn tự thêm 1 ô ở cả bốn phía. Không có hòa.'
      : 'Kín bàn mà chưa ai thắng thì bàn tự mở rộng. Không có hòa.';
    this.sound();
    if (!p.team) $('teamPick').hidden = false;
  },
  sound(){ const on = Store.p.sound; $('soundText').textContent = on ? 'Âm thanh: bật' : 'Âm thanh: tắt'; $('soundHome').classList.toggle('off', !on); $('soundGame').classList.toggle('off', !on); },
  startMatch(o){
    const [n, k, g] = this.opts.size.split('-'), grow = g === 'grow';
    Game.setup(Object.assign({ n: +n, k: +k, grow, level: this.opts.level, arena: this.opts.arena, remote: false, my: Store.p.team || 'X' }, o));
    this.showGame(); Game.start();
  },
  showGame(){ $('home').hidden = true; $('game').hidden = false; this.closeOverlays(); Music.stop(); },
  openFriend(){ this.friendMenu(); $('friend').hidden = false; },

  names(){
    const my = Game.my, op = other(my);
    if (Game.mode === 'local') return { X: 'Người X', O: 'Người O' };
    return { [my]: 'Bạn', [op]: Game.mode === 'bot' ? 'Máy' : 'Bạn bè' };
  },
  render(last, grew){
    const { n, board, result } = Game, el = $('board');
    el.style.gridTemplate = `repeat(${n},minmax(0,1fr)) / repeat(${n},minmax(0,1fr))`;
    el.style.gap = n > 9 ? '2px' : n > 5 ? '4px' : n > 3 ? '6px' : '8px';
    el.style.padding = n > 5 ? '7px' : '10px';
    el.classList.toggle('over', !!result);
    $('game').dataset.big = n > 9 ? 2 : n > 5 ? 1 : 0;   // bàn lớn thì dựng to hơn ở sân bắn cung
    // quân sắp biến mất ở lượt này
    const fading = Game.vanish && !result && Game.q[Game.turn].length >= CONFIG.keep ? Game.q[Game.turn][0] : -1;
    el.innerHTML = '';
    board.forEach((v, i) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'cell' + (v ? ` filled ${v}` : '') + (result?.line?.includes(i) ? ' win' : '') + (i === last ? ' pop' : '') + (i === fading ? ' fade' : '')
        + (grew && (i < n || i >= n * (n - 1) || i % n === 0 || i % n === n - 1) ? ' fresh' : '');
      c.style.borderRadius = n > 9 ? '5px' : n > 5 ? '8px' : n > 3 ? '10px' : '14px';
      c.setAttribute('aria-label', `Ô ${Math.floor(i / n) + 1}-${i % n + 1}${v ? ': ' + v : ''}`);
      if (v) c.innerHTML = `<img src="${PIECE[v]}" alt="${v}">`;
      c.onclick = () => { if (Game.arena === 'classic') Game.request(i); };
      el.appendChild(c);
    });
    if (!UI.ratioOk) el.style.height = el.offsetWidth + 'px';      // máy đời cũ không hiểu aspect-ratio
    const names = this.names(), icon = p => `<img src="${PIECE[p]}" alt="${p}">`;
    $('nX').textContent = names.X; $('nO').textContent = names.O;
    $('sX').textContent = Game.score.X; $('sO').textContent = Game.score.O;
    $('cX').classList.toggle('turn', !result && Game.turn === 'X');
    $('cO').classList.toggle('turn', !result && Game.turn === 'O');
    $('arenaName').textContent = Game.arena === 'archery' ? 'Bắn cung' : 'Cổ điển';
    $('roomTag').textContent = Game.mode === 'online' ? 'Phòng ' + Net.code : Game.mode === 'local' ? 'Chung 1 máy' : ({ easy: 'Máy dễ', medium: 'Máy vừa', hard: 'Máy khó' })[Game.level];
    const st = $('status'); st.classList.toggle('end', !!result);
    st.innerHTML = result?.winner ? `${icon(result.winner)} ${names[result.winner]} thắng!` : result?.draw ? 'Hòa rồi!' : `Lượt của ${icon(Game.turn)} ${names[Game.turn]}`;
    const archery = Game.arena === 'archery', mine = !result && (Game.mode === 'local' || Game.turn === Game.my);
    $('undo').hidden = archery || Game.mode === 'online';
    $('undo').disabled = Game.over || !Game.history.length;
    $('gameHint').textContent = result ? '' : archery ? (mine ? (Arena.spin ? 'Bia đang quay, mặt sau đảo trái phải. Bắn đón lúc bia quay ngang mặt.' : 'Chạm giữ, kéo xuống để giương cung. Canh hướng rồi thả tay để bắn.') : 'Đợi đối thủ bắn…')
      : fading >= 0 && mine ? 'Quân đang nhấp nháy sẽ biến mất khi bạn đặt quân mới.' : '';
  },
  winFx(winner){
    const el = $('winFx'); el.hidden = true; el.dataset.w = winner; $('winFxImg').src = PIECE[winner]; $('winFxPack').src = PACK[winner];
    void el.offsetWidth; el.hidden = false;                 // bật lại để hoạt cảnh chạy từ đầu
    clearTimeout(this.winTimer); this.winTimer = setTimeout(() => { el.hidden = true; }, 2550);
    setTimeout(() => { if (!el.hidden) Sfx.place(winner); }, 1700);      // tiếng chữ rơi vào gói
  },
  cellCenter(i){ const c = $('board').children[i]; if (!c) return { x: innerWidth / 2, y: innerHeight / 2 }; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },

  result(outcome, r, gain){
    if ($('game').hidden) return;
    const team = Store.p.team || 'X';
    $('resultImg').src = PACK[r.winner || team]; $('resultImg').classList.add('pack');
    $('resultTitle').textContent = outcome === 'win' ? 'Bạn thắng!' : outcome === 'lose' ? (Game.mode === 'bot' ? 'Máy thắng rồi' : 'Bạn bè thắng rồi') : outcome === 'draw' ? 'Hòa rồi!' : `Người ${r.winner} thắng!`;
    $('resultSub').textContent = outcome === 'win' ? `+${gain} điểm cho Phe ${team}` : outcome === 'lose' ? 'Làm ván nữa gỡ lại nha!' : outcome === 'local' ? 'Đổi lượt đi trước, làm ván nữa nha!' : '';
    $('result').hidden = false;
  },

  friendMenu(){ $('friendMenu').hidden = false; $('friendWait').hidden = true; },
  friendWait(code, link){ $('toast').hidden = true; $('friend').hidden = false; $('friendMenu').hidden = true; $('friendWait').hidden = false; $('roomCode').textContent = code; $('roomLink').textContent = link; },

  /* Khảo sát: tuổi, giới tính, chấm điểm Tayo X và Tayo O */
  ans: {},
  // Hiện ngay khi ván vừa xong (từ ván đầu tiên). Bấm "Để sau" thì ván sau hỏi lại, tối đa 2 lần bỏ qua.
  // Mỗi lần vào game chỉ hỏi 1 lần, sau ván đầu tiên của lần đó. Ai đã trả lời rồi thì không hỏi lại.
  surveyMaybe(){ if (Store.p.survey === 'done' || this.surveyAsked) return false; this.surveyAsked = true; this.surveyOpen(); return true; },
  surveyOpen(){ this.ans = {}; $('survey').querySelectorAll('.chips button').forEach(b => b.setAttribute('aria-pressed', 'false')); $('surveySend').disabled = true; $('survey').hidden = false; },
  surveyPick(q, v){
    this.ans[q] = v; const a = this.ans;
    $('surveySend').disabled = !(a.age && a.gender && a.rateX && a.rateO);
  },
  surveySend(){
    const a = this.ans, p = Store.p;
    Track.send('khao_sat', { age: a.age, gender: a.gender, rateX: a.rateX, rateO: a.rateO }, KID_AGES.includes(a.age));
    p.survey = 'done'; p.points += CONFIG.points.survey; Store.save();
    $('survey').hidden = true; Sfx.win(); Fx.confetti();
    this.toast(`Cảm ơn bạn! +${CONFIG.points.survey} điểm cho Phe ${p.team || 'X'}`);
    if (!$('home').hidden) this.home();
  }
};

/* Teaser mở đầu: chạm 1 lần để vào, rồi 6 cảnh tự chạy trong 15 giây, kết thúc ở nút "Chơi ngay". Có nút "Bỏ qua" ở góc trên. */
const Intro = {
  step: 0, timers: [], done: false,
  CUES: [0, 2000, 3500, 5000, 9000, 12000],        // mốc bắt đầu của cảnh 1..6 (mili giây)
  at(ms, fn){ this.timers.push(setTimeout(fn, ms)); },
  go(n){ this.step = n; $('intro').dataset.step = n; },
  start(){
    if (this.step !== 0 || this.done) return;
    Music.play('teaser'); Board.show();
    this.CUES.forEach((ms, i) => this.at(ms, () => { this.go(i + 1); this.cue(i + 1); }));
    const bar = $('introBar'); bar.style.transition = 'width 15s linear'; requestAnimationFrame(() => { bar.style.width = '100%'; });
  },
  cue(n){
    if (n <= 3) Sfx.boom();
    if (n === 4) this.demo();
    if (n === 5){ Sfx.win(); this.at(2150, () => Sfx.place('X')); }
    if (n === 6) Sfx.join();
  },
  // cảnh 4: giương cung bắn quân X vào ô, rồi O bắn lại
  demo(){
    const st = $('tzScene'), cells = [...$('tzBoard').children], str = $('tzString'), nock = $('tzNock'), aim = $('tzAim'), arrow = $('tzArrow');
    cells.forEach((c, i) => { const v = i === 1 ? 'O' : i === 4 ? 'X' : ''; c.className = v ? 'f' : ''; c.innerHTML = v ? `<img src="${PIECE[v]}" alt="">` : ''; });
    const center = el => { const r = el.getBoundingClientRect(), s = st.getBoundingClientRect(); return [r.left + r.width / 2 - s.left, r.top + r.height / 2 - s.top]; };
    const shoot = (i, p, delay, pullMs) => this.at(delay, () => {
      const s0 = performance.now(), [tx, ty] = center(cells[i]);
      nock.src = PIECE[p]; nock.style.visibility = ''; aim.hidden = false;
      const fire = () => {
        const [sx, sy] = center(nock);
        str.setAttribute('points', '22,62 120,62 218,62'); nock.style.visibility = 'hidden'; nock.style.transform = 'translate(-50%,0)';
        arrow.src = PIECE[p]; arrow.hidden = false; Sfx.shoot();
        const a = arrow.animate([{ transform: `translate(${sx}px,${sy}px) scale(1) rotate(0deg)` }, { transform: `translate(${tx}px,${ty}px) scale(.4) rotate(360deg)` }], { duration: Fx.still() ? 1 : 420, easing: 'cubic-bezier(.3,.6,.5,1)' });
        a.onfinish = a.oncancel = () => { arrow.hidden = true; aim.hidden = true; cells[i].className = 'f pop'; cells[i].innerHTML = `<img src="${PIECE[p]}" alt="">`; Sfx.place(p); };
      };
      const step = now => {
        if (this.done || this.step !== 4) return;
        const k = Math.min(1, (now - s0) / pullMs), wob = 5 * (1 - k);
        str.setAttribute('points', `22,62 120,${62 + k * 42} 218,62`); nock.style.transform = `translate(-50%,${k * 62}%)`;
        aim.style.transform = `translate(${tx + Math.sin(now / 140) * wob}px,${ty + Math.cos(now / 170) * wob}px)`;
        if (k < 1) requestAnimationFrame(step); else fire();
      };
      requestAnimationFrame(step);
    });
    shoot(2, 'X', 150, 1200); shoot(6, 'O', 2100, 900);
  },
  end(how){
    if (this.done) return; this.done = true; this.timers.forEach(clearTimeout);
    $('intro').hidden = true; Track.send('mo_dau', { role: how }); Music.play('lobby');
  },
  wire(){ $('intro').onclick = e => { if (e.target.closest('#introSkip')) return this.end('bo_qua'); if (e.target.closest('#introPlay')) return this.end('xem_het'); this.start(); }; }
};

/* Gắn sự kiện */
function wire(){
  document.addEventListener('click', e => { if (e.target.closest('.btn, .team, .seg button')) Sfx.click(); }, true);
  $('optArena').onclick = e => { const b = e.target.closest('button'); if (b){ UI.opts.arena = b.dataset.v; UI.home(); } };
  $('optSize').onclick = e => { const b = e.target.closest('button'); if (b){ UI.opts.size = b.dataset.v; UI.home(); } };
  $('optMode').onclick = e => { const b = e.target.closest('button'); if (b){ UI.opts.mode = b.dataset.v; Sfx.click(); UI.home(); } };
  $('optLevel').onclick = e => { const b = e.target.closest('button'); if (b){ UI.opts.level = b.dataset.v; UI.home(); } };
  $('startBtn').onclick = () => { if (UI.opts.mode === 'bot') UI.startMatch({ mode: 'bot' }); else UI.openFriend(); };
  $('changeTeam').onclick = () => { $('teamPick').hidden = false; };
  $('teamPick').onclick = e => { const b = e.target.closest('.team'); if (!b) return; const first = !Store.p.team; Store.p.team = b.dataset.team; Store.save(); $('teamPick').hidden = true; Sfx.join(); UI.home(); Track.send(first ? 'chon_phe' : 'doi_phe', {}); };
  const toggleSound = () => { Store.p.sound = !Store.p.sound; Store.save(); UI.sound(); Sfx.click(); Music.sync(); };
  document.addEventListener('visibilitychange', () => Music.sync());
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

  $('back').onclick = () => { if (Game.mode === 'online') Net.close(true); UI.home(); };
  $('undo').onclick = () => Game.undo();
  const again = () => { $('result').hidden = true; if (Game.remote) Net.send({ t: 'again' }); else Game.start(); };
  $('restart').onclick = again;
  $('resultAgain').onclick = again;
  $('resultHome').onclick = () => { if (Game.mode === 'online') Net.close(true); UI.home(); };
  const sc = $('scene');
  sc.addEventListener('pointerdown', e => { if (Game.arena === 'archery'){ e.preventDefault(); Arena.down(e); } });
  sc.addEventListener('pointermove', e => Arena.move(e));
  sc.addEventListener('pointerup', () => Arena.up());
  sc.addEventListener('pointercancel', () => { Arena.drag = null; Arena.stop(); Arena.sync(); });

  $('survey').onclick = e => { const b = e.target.closest('.chips button'); if (!b) return; const box = b.parentElement;
    box.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); UI.surveyPick(box.dataset.q, b.dataset.v); };
  $('surveySkip').onclick = () => { $('survey').hidden = true; };
  $('surveySend').onclick = () => UI.surveySend();
  addEventListener('pagehide', () => { Track.flush(); Net.send({ t: 'bye' }); });
  addEventListener('online', () => Track.flush());
}

/* Khởi động */
Store.load(); Fx.init(); wire(); Intro.wire(); UI.home(); Track.flush(); Board.show();
(() => {  // vào bằng link mời: ?room=ABCD
  const q = new URLSearchParams(location.search), room = q.get('room');
  if (!room) return;
  Intro.end('link_moi');         // vào bằng link mời thì bỏ qua phần mở đầu
  history.replaceState(null, '', location.pathname);
  $('teamPick').hidden = true;   // khách vào chơi liền, chọn phe sau khi về sảnh
  Net.join(room);
})();
