/**
 * XO Game → Google Sheet
 * Dán toàn bộ file này vào Apps Script của Google Sheet (xem HUONG-DAN-GOOGLE-SHEET.md).
 * Mỗi sự kiện từ game là 1 dòng. Có 3 tab: khao_sat, van_dau, khac.
 */
var COLS = {
  khao_sat: ['ts', 'uid', 'src', 'team', 'device', 'age', 'gender', 'rateX', 'rateO'],
  van_dau:  ['ts', 'uid', 'src', 'team', 'device', 'mode', 'arena', 'size', 'result', 'winner', 'moves', 'seconds', 'plays', 'streak'],
  khac:     ['ts', 'uid', 'src', 'team', 'device', 'event', 'role']
};

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var rows = JSON.parse(e.postData.contents);
    if (!Array.isArray(rows)) rows = [rows];
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    rows.slice(0, 200).forEach(function (r) {
      var tab = COLS[r.event] ? r.event : 'khac';
      var sh = ss.getSheetByName(tab) || ss.insertSheet(tab);
      if (sh.getLastRow() === 0) sh.appendRow(COLS[tab]);
      sh.appendRow(COLS[tab].map(function (c) {
        var v = r[c] === undefined || r[c] === null ? '' : String(r[c]).slice(0, 100);
        return /^[=+\-@]/.test(v) ? "'" + v : v;   // chặn công thức lạ
      }));
    });
    return ContentService.createTextOutput('ok');
  } finally {
    lock.releaseLock();
  }
}

function doGet() { return ContentService.createTextOutput('XO Game sheet is running'); }
