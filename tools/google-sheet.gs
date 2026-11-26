/**
 * XO Game → Google Sheet
 * Dán toàn bộ file này vào Apps Script của Google Sheet (xem HUONG-DAN-GOOGLE-SHEET.md).
 * Mỗi sự kiện từ game là 1 dòng. Có 3 tab: khao_sat, van_dau, khac.
 * Tab bang_vang: số trận thắng mỗi ngày của phe X và phe O, game đọc để hiện bảng vàng.
 */
var COLS = {
  khao_sat: ['ts', 'uid', 'src', 'team', 'device', 'age', 'gender', 'rateX', 'rateO'],
  van_dau:  ['ts', 'uid', 'src', 'team', 'device', 'mode', 'arena', 'size', 'result', 'winner', 'moves', 'seconds', 'plays', 'streak'],
  khac:     ['ts', 'uid', 'src', 'team', 'device', 'event', 'role']
};

var TZ = 'Asia/Ho_Chi_Minh';
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }

/** Tab bang_vang: mỗi ngày 1 dòng [ngay, X, O] = số trận thắng của mỗi phe trong ngày. */
function boardSheet_(ss) {
  var sh = ss.getSheetByName('bang_vang');
  if (!sh) { sh = ss.insertSheet('bang_vang'); sh.getRange('A:A').setNumberFormat('@'); sh.appendRow(['ngay', 'X', 'O']); }
  return sh;
}
function boardToday_(ss) {
  var sh = boardSheet_(ss), last = sh.getLastRow(), d = today_();
  if (last > 1 && sh.getRange(last, 1).getDisplayValue() === d) {
    var v = sh.getRange(last, 2, 1, 2).getValues()[0];
    return { row: last, X: Number(v[0]) || 0, O: Number(v[1]) || 0 };
  }
  return { row: 0, X: 0, O: 0 };
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var rows = JSON.parse(e.postData.contents);
    if (!Array.isArray(rows)) rows = [rows];
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var add = { X: 0, O: 0 };
    rows.slice(0, 200).forEach(function (r) {
      var tab = COLS[r.event] ? r.event : 'khac';
      var sh = ss.getSheetByName(tab) || ss.insertSheet(tab);
      if (sh.getLastRow() === 0) sh.appendRow(COLS[tab]);
      sh.appendRow(COLS[tab].map(function (c) {
        var v = r[c] === undefined || r[c] === null ? '' : String(r[c]).slice(0, 100);
        return /^[=+\-@]/.test(v) ? "'" + v : v;   // chặn công thức lạ
      }));
      if (r.event === 'van_dau' && r.result === 'win' && (r.team === 'X' || r.team === 'O')) add[r.team]++;
    });
    if (add.X || add.O) {          // cộng vào bảng vàng của hôm nay
      var t = boardToday_(ss), sh2 = boardSheet_(ss);
      if (t.row) sh2.getRange(t.row, 2, 1, 2).setValues([[t.X + add.X, t.O + add.O]]);
      else sh2.appendRow([today_(), add.X, add.O]);
      CacheService.getScriptCache().remove('board');
    }
    return ContentService.createTextOutput('ok');
  } finally {
    lock.releaseLock();
  }
}

/** ...?board=1 trả về số trận thắng hôm nay của hai phe: {"day":"2026-11-11","X":12,"O":9} */
function doGet(e) {
  if (e && e.parameter && e.parameter.board) {
    var cache = CacheService.getScriptCache(), out = cache.get('board');
    if (!out) {
      var t = boardToday_(SpreadsheetApp.getActiveSpreadsheet());
      out = JSON.stringify({ day: today_(), X: t.X, O: t.O });
      cache.put('board', out, 20);
    }
    return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput('XO Game sheet is running');
}
