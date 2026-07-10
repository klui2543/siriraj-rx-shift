/**
 * ════════════════════════════════════════════════════════════
 * 🏷️ PHASE Z — Nicknames fallback store (Sheet mirror of Firebase RTDB)
 * ════════════════════════════════════════════════════════════
 * Firebase RTDB `nicknames/` is the PRIMARY, real-time store. This Sheet is a
 * COPY so the client can fall back to GAS polling when Firebase is unreachable.
 * The client writes to BOTH on save (success if either lands); it only READS
 * from here when Firebase is NOT connected.
 *
 * Sheet PHX_Nicknames (auto-created on first use):
 *   1 type | 2 owner | 3 target | 4 nickname | 5 updatedAt
 *   public  : type=public,  owner=<name>, target='',       nickname='โต้ง'
 *   private : type=private, owner=<me>,   target=<friend>, nickname='ปิ๊กเพื่อนเรา'
 *
 * Public API (called from Index.html via google.script.run):
 *   nkGetAllFromSheet(name, hash)                 → {success, public:{owner:nick}, private:{target:nick}}
 *   nkSaveToSheet(name, hash, type, target, nick) → {success}   (owner is ALWAYS the authed name)
 *
 * Requires B1: SCHEDULE_SHEET_ID, _phxFindPharmacistRow, _phxTouchLastSeen, _phxHashPassword
 */

const _NK_SHEET = 'PHX_Nicknames';
const _NK_MAX_LEN = 40;

function _nkGetOrCreateSheet_() {
  const ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
  let sh = ss.getSheetByName(_NK_SHEET);
  if (!sh) {
    sh = ss.insertSheet(_NK_SHEET);
    sh.getRange(1, 1, 1, 5).setValues([['type', 'owner', 'target', 'nickname', 'updatedAt']]);
  }
  return sh;
}

function _nkAuthOk_(name, hash) {
  if (!name || !hash) return false;
  const row = _phxFindPharmacistRow(name);
  if (!row) return false;
  return String(row.passwordHash) === String(hash);
}

// ── READ: everyone's public nicknames + the caller's OWN private aliases ──
function nkGetAllFromSheet(name, hash) {
  try {
    const sh = _nkGetOrCreateSheet_();
    const pub = {}, priv = {};
    const last = sh.getLastRow();
    if (last >= 2) {
      const rows = sh.getRange(2, 1, last - 1, 4).getValues();
      const authed = _nkAuthOk_(name, hash) ? String(name).trim() : null;
      rows.forEach(function (r) {
        const type = String(r[0] || '').trim();
        const owner = String(r[1] || '').trim();
        const target = String(r[2] || '').trim();
        const nick = String(r[3] || '').trim();
        if (!nick) return;
        if (type === 'public' && owner) {
          pub[owner] = nick;
        } else if (type === 'private' && authed && owner === authed && target) {
          priv[target] = nick;   // only the caller's own private aliases leave the server
        }
      });
    }
    return { success: true, public: pub, private: priv };
  } catch (e) {
    return { success: false, error: e.message, public: {}, private: {} };
  }
}

// ── WRITE: upsert ONE entry; owner is ALWAYS the authenticated name (no spoofing) ──
function nkSaveToSheet(name, hash, type, target, nickname) {
  try {
    if (!_nkAuthOk_(name, hash)) return { success: false, error: 'auth failed' };
    type = (type === 'private') ? 'private' : 'public';
    const owner = String(name).trim();
    const tgt = (type === 'private') ? String(target || '').trim() : '';
    if (type === 'private' && !tgt) return { success: false, error: 'missing target' };
    let nick = String(nickname == null ? '' : nickname).trim();
    if (nick.length > _NK_MAX_LEN) nick = nick.slice(0, _NK_MAX_LEN);
    if (typeof _phxTouchLastSeen === 'function') { try { _phxTouchLastSeen(owner); } catch (e) {} }

    const sh = _nkGetOrCreateSheet_();
    const last = sh.getLastRow();
    let foundRow = -1;
    if (last >= 2) {
      const rows = sh.getRange(2, 1, last - 1, 3).getValues();
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][0]).trim() === type &&
            String(rows[i][1]).trim() === owner &&
            String(rows[i][2]).trim() === tgt) { foundRow = i + 2; break; }
      }
    }
    const stamp = new Date().toISOString();
    if (!nick) {                                  // empty nickname = clear
      if (foundRow > 0) sh.deleteRow(foundRow);
      return { success: true, deleted: true };
    }
    if (foundRow > 0) {
      sh.getRange(foundRow, 4, 1, 2).setValues([[nick, stamp]]);
    } else {
      sh.appendRow([type, owner, tgt, nick, stamp]);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ════════════════════════════════════════════════════════════
// 🧪 Test (edit NAME + password, run once)
// ════════════════════════════════════════════════════════════
function testNkRoundtrip() {
  const NAME = 'ณรพล';
  const HASH = _phxHashPassword(NAME, 'klui2543');
  Logger.log('save public : ' + JSON.stringify(nkSaveToSheet(NAME, HASH, 'public', '', 'โต้ง')));
  Logger.log('save private: ' + JSON.stringify(nkSaveToSheet(NAME, HASH, 'private', 'ปิยะ', 'ปิ๊กเพื่อนเรา')));
  Logger.log('get all     : ' + JSON.stringify(nkGetAllFromSheet(NAME, HASH), null, 2));
  Logger.log('clear public: ' + JSON.stringify(nkSaveToSheet(NAME, HASH, 'public', '', '')));
}
