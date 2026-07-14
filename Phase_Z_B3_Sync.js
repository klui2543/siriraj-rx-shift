/**
 * ════════════════════════════════════════════════════════════
 * 🔄 PHASE Z STAGE B3 — Action Sync
 * ════════════════════════════════════════════════════════════
 *
 * Public API (auth = name + passwordHash from localStorage):
 *   phxPushActions(name, pwHash, actionsArrayOrJson)  — sync local actions → server
 *   phxPullAll(name, pwHash)                          — get all server actions for user
 *   phxRemoveAction(name, pwHash, actionId)           — delete single action
 *   phxClearMonth(name, pwHash, monthId)              — bulk delete actions for a month
 *
 * Sheet: PHX_Overlays_v2
 *   Columns: actionId | name | monthId | type | payload | createdAt
 *
 * Requires: Phase_Z_B1_Auth.gs (uses _phxHashPassword, _phxFindPharmacistRow, _phxGetSheet)
 *
 * ════════════════════════════════════════════════════════════
 * วิธี Apply
 * ════════════════════════════════════════════════════════════
 *
 * 1. ตรวจ PHX_Overlays_v2 sheet → row 1 ต้องเป็น header 6 columns ตามนี้:
 *      actionId | name | monthId | type | payload | createdAt
 *    ถ้าไม่ตรง: รัน devB3CheckSchema → จะบอก fix อะไร
 *
 * 2. สร้างไฟล์ใหม่ `Phase_Z_B3_Sync.gs` → paste ฉบับนี้
 *
 * 3. Save (ไม่ต้อง deploy ใหม่ — ไม่ได้แก้ doGet)
 *
 * 4. Test:
 *    - testB3RoundTrip — push 3 actions → pull → ต้องเห็น 3
 *                       → remove 1 → pull → 2
 *                       → clearMonth → pull → 0
 */


// ════════════════════════════════════════════════════════════
// 🔧 Constants
// ════════════════════════════════════════════════════════════
const _B3_TAB = 'PHX_Overlays_v2';
const _B3_COL_COUNT = 6;
const _B3_AUTH_ERROR = 'auth failed — กรุณา login ใหม่';
// v3.47: a deleted action is TOMBSTONED (its `type` column set to this sentinel) instead of being
//   physically removed. Pull filters tombstones out; push refuses to overwrite one. This stops a
//   stale device from resurrecting a cancelled/deleted shift by re-pushing its old local copy.
const _B3_TOMBSTONE = '__deleted__';


// ════════════════════════════════════════════════════════════
// 🌐 Public: Push actions (local → server)
// ════════════════════════════════════════════════════════════
function phxPushActions(rawName, pwHash, actionsArg, actingAs) {
  try {
    const auth = _phxVerifyAuth(rawName, pwHash);
    if (!auth) return { success: false, error: _B3_AUTH_ERROR };
 
    // 🆕 C1: determine target user (admin can act on others)
    const targetName = _phxResolveTarget(auth, actingAs);
    if (!targetName) return { success: false, error: 'permission denied — admin only' };
 
    let actions;
    if (typeof actionsArg === 'string') {
      try { actions = JSON.parse(actionsArg); } catch (e) {
        return { success: false, error: 'JSON parse error: ' + e.message };
      }
    } else {
      actions = actionsArg;
    }
    if (!Array.isArray(actions)) return { success: false, error: 'actions ต้องเป็น array' };
    if (actions.length === 0) return { success: true, added: 0, skipped: 0 };
 
    const sh = _phxGetSheet(_B3_TAB);

    // v3.44 UPSERT — snapshot existing rows for the target user: actionId → { row, payload }.
    //   Old behaviour skipped any actionId already on the server, so a draft→public flip
    //   (or any edit) could never propagate. Now we overwrite the stored payload in place.
    const existing = {};   // id → { row, payload, deleted }
    if (sh.getLastRow() >= 2) {
      const all = sh.getRange(2, 1, sh.getLastRow() - 1, _B3_COL_COUNT).getValues();
      for (let i = 0; i < all.length; i++) {
        if (String(all[i][1]).trim() === targetName) {
          existing[String(all[i][0]).trim()] = {
            row: i + 2,
            payload: String(all[i][4]),
            deleted: String(all[i][3]).trim() === _B3_TOMBSTONE   // type col == tombstone
          };
        }
      }
    }

    const rows = [];        // new actions → append at the bottom
    let updated = 0;        // existing actions whose payload changed → overwritten in place
    let unchanged = 0;      // existing actions with identical payload → left untouched (no sheet write)
    let tombstoned = 0;     // v3.47: incoming actions that were deleted server-side → refused (no resurrect)
    let skipped = 0;        // malformed actions
    const now = new Date();
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (!a || typeof a !== 'object' || !a.id) { skipped++; continue; }
      const id = String(a.id).trim();
      const payloadStr = JSON.stringify(a);
      const ex = existing[id];
      if (ex) {
        // v3.47: this id was deleted on another device — do NOT bring it back to life.
        //   (actionIds are unique-per-creation, so a tombstoned id is never a legit new action.)
        if (ex.deleted) { tombstoned++; continue; }
        // Only rewrite when the payload actually differs — keeps steady-state refreshes
        // (which re-push every unchanged action) from hammering the sheet.
        if (ex.payload === payloadStr) { unchanged++; continue; }
        // Overwrite cols 3-5 (monthId, type, payload); leave actionId/name/createdAt intact.
        sh.getRange(ex.row, 3, 1, 3).setValues([[
          String(a.monthId || ''),
          String(a.type || ''),
          payloadStr
        ]]);
        updated++;
      } else {
        rows.push([
          id,
          targetName,                    // 🆕 ใช้ target ไม่ใช่ auth.name
          String(a.monthId || ''),
          String(a.type || ''),
          payloadStr,
          now
        ]);
      }
    }

    if (rows.length > 0) {
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, _B3_COL_COUNT).setValues(rows);
    }

    _phxTouchLastSeen(auth.row.rowIndex);

    return {
      success: true,
      added: rows.length,
      updated: updated,
      unchanged: unchanged,
      tombstoned: tombstoned,
      skipped: skipped,
      actedAs: targetName !== auth.name ? targetName : undefined
    };
  } catch (e) {
    console.error('phxPushActions error: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}

// ════════════════════════════════════════════════════════════
// 🌐 Public: Pull all actions for user (server → local)
// ════════════════════════════════════════════════════════════
function phxPullAll(rawName, pwHash, actingAs) {
  try {
    const auth = _phxVerifyAuth(rawName, pwHash);
    if (!auth) return { success: false, error: _B3_AUTH_ERROR };
 
    const targetName = _phxResolveTarget(auth, actingAs);
    if (!targetName) return { success: false, error: 'permission denied — admin only' };
 
    const sh = _phxGetSheet(_B3_TAB);
    if (sh.getLastRow() < 2) {
      _phxTouchLastSeen(auth.row.rowIndex);
      return { success: true, actions: [], count: 0 };
    }
 
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, _B3_COL_COUNT).getValues();
    const actions = [];
    let malformed = 0;
 
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][1]).trim() !== targetName) continue;
      if (String(data[i][3]).trim() === _B3_TOMBSTONE) continue;   // v3.47: skip tombstoned deletions
      try {
        actions.push(JSON.parse(String(data[i][4])));
      } catch (e) {
        malformed++;
      }
    }
 
    _phxTouchLastSeen(auth.row.rowIndex);
    return {
      success: true,
      actions: actions,
      count: actions.length,
      malformed: malformed,
      actedAs: targetName !== auth.name ? targetName : undefined
    };
  } catch (e) {
    console.error('phxPullAll error: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}


// ════════════════════════════════════════════════════════════
// 🌐 Public: Remove single action by actionId
// ════════════════════════════════════════════════════════════
function phxRemoveAction(rawName, pwHash, actionId, actingAs) {
  try {
    const auth = _phxVerifyAuth(rawName, pwHash);
    if (!auth) return { success: false, error: _B3_AUTH_ERROR };
 
    const targetName = _phxResolveTarget(auth, actingAs);
    if (!targetName) return { success: false, error: 'permission denied — admin only' };
 
    const targetId = String(actionId || '').trim();
    if (!targetId) return { success: false, error: 'actionId required' };
 
    const sh = _phxGetSheet(_B3_TAB);
    if (sh.getLastRow() < 2) return { success: true, removed: 0 };

    // read actionId + name + type so we can tell live rows from already-tombstoned ones
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
    let removed = 0;

    // v3.47: TOMBSTONE (mark type col) instead of deleteRow, so a stale replica that still holds
    //   this action can't resurrect it on its next upsert push. Pull filters tombstones out.
    for (let i = data.length - 1; i >= 0; i--) {
      if (String(data[i][0]).trim() === targetId &&
          String(data[i][1]).trim() === targetName) {
        if (String(data[i][3]).trim() !== _B3_TOMBSTONE) {   // already tombstoned → skip re-write
          sh.getRange(i + 2, 4).setValue(_B3_TOMBSTONE);     // col 4 = type
          removed++;
        }
      }
    }

    _phxTouchLastSeen(auth.row.rowIndex);
    return {
      success: true,
      removed: removed,
      actedAs: targetName !== auth.name ? targetName : undefined
    };
  } catch (e) {
    console.error('phxRemoveAction error: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}

// ════════════════════════════════════════════════════════════
// 🌐 Public: Clear all actions for a specific month
// ════════════════════════════════════════════════════════════
function phxClearMonth(rawName, pwHash, monthId, actingAs) {
  try {
    const auth = _phxVerifyAuth(rawName, pwHash);
    if (!auth) return { success: false, error: _B3_AUTH_ERROR };
 
    const targetName = _phxResolveTarget(auth, actingAs);
    if (!targetName) return { success: false, error: 'permission denied — admin only' };
 
    const target = String(monthId || '').trim();
    if (!target) return { success: false, error: 'monthId required' };
 
    const sh = _phxGetSheet(_B3_TAB);
    if (sh.getLastRow() < 2) return { success: true, removed: 0 };
 
    const data = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
    let removed = 0;
 
    for (let i = data.length - 1; i >= 0; i--) {
      if (String(data[i][1]).trim() === targetName &&
          String(data[i][2]).trim() === target) {
        sh.deleteRow(i + 2);
        removed++;
      }
    }
 
    _phxTouchLastSeen(auth.row.rowIndex);
    return {
      success: true,
      removed: removed,
      actedAs: targetName !== auth.name ? targetName : undefined
    };
  } catch (e) {
    console.error('phxClearMonth error: ' + e.message);
    return { success: false, error: 'เกิดข้อผิดพลาด: ' + e.message };
  }
}


// ════════════════════════════════════════════════════════════
// 🔧 Helpers (B3-specific)
// ════════════════════════════════════════════════════════════

/**
 * Verify auth — returns { name, row } on success, null on fail
 * Vague error (no leak of which field is wrong)
 */
function _phxVerifyAuth(rawName, pwHash) {
  const name = String(rawName || '').trim();
  const hash = String(pwHash || '').trim();
  if (!name || !hash) return null;

  const row = _phxFindPharmacistRow(name);  // from B1
  if (!row) return null;
  if (row.passwordHash !== hash) return null;

  return { name: name, row: row };
}

/**
 * Update lastSeen for user (best-effort, non-throwing)
 */
function _phxTouchLastSeen(rowIndex) {
  try {
    _phxGetSheet('PHX_Pharmacists').getRange(rowIndex, 4).setValue(new Date());
  } catch (e) { /* non-critical */ }
}


// ════════════════════════════════════════════════════════════
// 🧪 Test functions
// ════════════════════════════════════════════════════════════

/**
 * Schema check — verify PHX_Overlays_v2 has expected columns
 */
function devB3CheckSchema() {
  const sh = _phxGetSheet(_B3_TAB);
  const lastCol = sh.getLastColumn();
  const headers = lastCol >= 1 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const expected = ['actionId', 'name', 'monthId', 'type', 'payload', 'createdAt'];

  Logger.log('Sheet: ' + _B3_TAB);
  Logger.log('Headers found: [' + headers.join(', ') + ']');
  Logger.log('Expected:      [' + expected.join(', ') + ']');

  let ok = true;
  for (let i = 0; i < expected.length; i++) {
    const found = String(headers[i] || '').trim();
    const match = found === expected[i];
    Logger.log('  col ' + (i + 1) + ': ' + (match ? '✅' : '❌') +
               ' "' + found + '"' + (match ? '' : ' (expected "' + expected[i] + '")'));
    if (!match) ok = false;
  }
  Logger.log(ok ? '✅ Schema OK' : '❌ Schema mismatch — แก้ headers ใน row 1 ก่อน');
}

/**
 * Full round-trip test: push → pull → remove → clear → pull
 * ★ แก้ TEST_NAME + TEST_PW ก่อนรัน (ต้องเป็น user ที่ register แล้ว)
 */
function testB3RoundTrip() {
  // ★★★ แก้รหัสตรงนี้ก่อนรัน — ใช้ devB3FindPassword ช่วยหาก่อนได้
  const TEST_NAME = 'ณรพล';
  const TEST_PW = 'klui2543';
 
  // Pre-check auth — fail fast แทนรันทุก step แล้วพัง
  const pwHash = _phxHashPassword(TEST_NAME, TEST_PW);
  const auth = _phxVerifyAuth(TEST_NAME, pwHash);
  if (!auth) {
    Logger.log('❌ Auth failed ก่อนเริ่ม test');
    Logger.log('   เหตุที่เป็นได้:');
    Logger.log('   - ' + TEST_NAME + ' ยังไม่ได้ register (เช็ค devCheckUser)');
    Logger.log('   - รหัสปัจจุบันไม่ใช่ "' + TEST_PW + '"');
    Logger.log('   → รัน devB3FindPassword("' + TEST_NAME + '") เพื่อหารหัสปัจจุบัน');
    return;
  }
  Logger.log('✅ Pre-check OK — start round-trip\n');
 
  const monthId = 'm_พฤษภาคม_2569';
  const fakeActions = [
    { id: 'test_act_001', type: 'swap', monthId: monthId, withWhom: 'A', from: 'shift1', to: 'shift2' },
    { id: 'test_act_002', type: 'giveaway', monthId: monthId, toWhom: 'B', shift: 'shift3' },
    { id: 'test_act_003', type: 'add', monthId: monthId, shift: 'shift4' }
  ];
 
  let r;
  let passed = true;
 
  // 1. Push
  Logger.log('[1] PUSH 3 actions...');
  r = phxPushActions(TEST_NAME, pwHash, fakeActions);
  Logger.log('    ' + JSON.stringify(r));
  if (!r.success) { Logger.log('    ❌ FAIL — abort'); return; }
  if (r.added !== 3) { Logger.log('    ⚠️ expected added=3, got=' + r.added); passed = false; }
 
  // 2. Pull
  Logger.log('\n[2] PULL...');
  r = phxPullAll(TEST_NAME, pwHash);
  if (!r.success) { Logger.log('    ❌ FAIL — abort'); return; }
  const testActions1 = (r.actions || []).filter(function(a) { return String(a.id).indexOf('test_act_') === 0; });
  Logger.log('    found ' + testActions1.length + ' test actions (expect 3)');
  if (testActions1.length !== 3) passed = false;
 
  // 3. Push again, identical (dedup test — v3.44: now "unchanged", not "skipped")
  Logger.log('\n[3] PUSH ซ้ำ (test dedup / no-op)...');
  r = phxPushActions(TEST_NAME, pwHash, fakeActions);
  Logger.log('    ' + JSON.stringify(r));
  if (r.added !== 0 || r.unchanged !== 3) {
    Logger.log('    ⚠️ expected added=0, unchanged=3 (dedup not working)'); passed = false;
  }

  // 3b. Push again with a CHANGED payload (v3.44 upsert test — the draft→public flip)
  Logger.log('\n[3b] PUSH ทับ (test upsert — พลิก _visibility)...');
  const flipped = fakeActions.map(function(a) { return Object.assign({}, a, { _visibility: 'public' }); });
  r = phxPushActions(TEST_NAME, pwHash, flipped);
  Logger.log('    ' + JSON.stringify(r));
  if (r.added !== 0 || r.updated !== 3) {
    Logger.log('    ⚠️ expected added=0, updated=3 (upsert not working)'); passed = false;
  }
  // verify the new payload actually landed
  r = phxPullAll(TEST_NAME, pwHash);
  const flippedBack = (r.actions || []).filter(function(a) {
    return String(a.id).indexOf('test_act_') === 0 && a._visibility === 'public';
  });
  Logger.log('    public after upsert: ' + flippedBack.length + ' (expect 3)');
  if (flippedBack.length !== 3) passed = false;
 
  // 4. Remove
  Logger.log('\n[4] REMOVE test_act_002...');
  r = phxRemoveAction(TEST_NAME, pwHash, 'test_act_002');
  Logger.log('    ' + JSON.stringify(r));
  if (r.removed !== 1) { Logger.log('    ⚠️ expected removed=1'); passed = false; }
 
  // 5. Pull again
  Logger.log('\n[5] PULL...');
  r = phxPullAll(TEST_NAME, pwHash);
  if (!r.success) { Logger.log('    ❌ FAIL — abort'); return; }
  const testActions2 = (r.actions || []).filter(function(a) { return String(a.id).indexOf('test_act_') === 0; });
  const ids = testActions2.map(function(a) { return a.id; });
  Logger.log('    remaining test ids: [' + ids.join(', ') + ']');
  if (testActions2.length !== 2) passed = false;

  // 5b. v3.47: re-push the deleted id (simulates a stale device) → tombstone must BLOCK resurrection
  Logger.log('\n[5b] PUSH test_act_002 ซ้ำหลังลบ (test anti-resurrection)...');
  r = phxPushActions(TEST_NAME, pwHash, [fakeActions[1]]);
  Logger.log('    ' + JSON.stringify(r) + ' (expect added=0, tombstoned=1)');
  if (r.added !== 0 || r.tombstoned !== 1) passed = false;
  r = phxPullAll(TEST_NAME, pwHash);
  const resurrected = (r.actions || []).some(function(a) { return String(a.id) === 'test_act_002'; });
  Logger.log('    act2 resurrected? ' + resurrected + ' (expect false)');
  if (resurrected) passed = false;

  // 6. Clear month — physically purges live rows AND the tombstone (3 rows: act1, act2†, act3)
  Logger.log('\n[6] CLEAR month ' + monthId + '...');
  r = phxClearMonth(TEST_NAME, pwHash, monthId);
  Logger.log('    ' + JSON.stringify(r));
  if (r.removed !== 3) { Logger.log('    ⚠️ expected removed=3 (2 live + 1 tombstone)'); passed = false; }
 
  // 7. Final pull
  Logger.log('\n[7] PULL (final)...');
  r = phxPullAll(TEST_NAME, pwHash);
  if (!r.success) { Logger.log('    ❌ FAIL'); return; }
  const remaining = (r.actions || []).filter(function(a) { return String(a.id).indexOf('test_act_') === 0; });
  Logger.log('    test actions remaining: ' + remaining.length + ' (expect 0)');
  if (remaining.length !== 0) passed = false;
 
  Logger.log('\n' + (passed ? '✅ Round-trip PASSED — Stage B3 ทำงานครบ' : '❌ Round-trip FAILED — ดู ⚠️ ข้างบน'));
}

/**
 * Test auth rejection — should fail with various invalid inputs
 */
function testB3AuthRejection() {
  const tests = [
    { name: '', pwHash: 'x', desc: 'empty name' },
    { name: 'ณรพล', pwHash: '', desc: 'empty hash' },
    { name: 'ไม่มีในระบบ', pwHash: 'x', desc: 'unknown user' },
    { name: 'ณรพล', pwHash: 'wronghash', desc: 'wrong hash' }
  ];

  tests.forEach(function(t) {
    const r = phxPullAll(t.name, t.pwHash);
    const ok = !r.success;
    Logger.log((ok ? '✅' : '❌') + ' ' + t.desc + ' → ' +
               (r.success ? 'WRONGLY ALLOWED' : 'correctly rejected'));
  });
}