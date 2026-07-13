/**
 * ════════════════════════════════════════════════════════════════
 *  Phase Path B — Global Consensus Layer
 *  ────────────────────────────────────────────────────────────
 *  ฟังก์ชันสำหรับ apply overlay แบบ global (ทุกคนเห็นเหมือนกัน)
 *  
 *  - phxGetAllActiveOverlaysForMonth(monthId) — public, ดึง overlays
 *    ทั้งหมดของเดือน
 *  - _phxApplyOverlaysGlobally(shifts, overlays) — pure function
 *    apply overlays แบบ consensus (สลับเจ้าของในเซลล์)
 *  - testGlobalApply — manual test
 *
 *  ⚠️ ไม่กระทบ ICS feed (ยังใช้ _applyOverlays per-user เหมือนเดิม)
 *     ใช้สำหรับ frontend grid view เท่านั้น
 * ════════════════════════════════════════════════════════════════
 */


// ════════════════════════════════════════════════════════════
// 1. Public: ดึง overlays ทั้งหมดของเดือน (ไม่ filter name)
// ════════════════════════════════════════════════════════════
//
// monthId format: 'm_<thai_month>_<year_BE>' เช่น 'm_มิถุนายน_2569'
//
// Returns:
//   { ok: true, overlays: [...], count: N }
//   { ok: false, error: '...' }
//
function phxGetAllActiveOverlaysForMonth(monthId) {
  if (!monthId) return { ok: false, error: 'missing monthId' };
  
  try {
    var ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
    var sh = ss.getSheetByName('PHX_Overlays_v2');
    if (!sh || sh.getLastRow() < 2) {
      return { ok: true, overlays: [], count: 0 };
    }
    
    var data = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
    var overlays = [];
    
    data.forEach(function(r) {
      var actionId = String(r[0] || '').trim();
      if (!actionId) return;
      
      // กรองเฉพาะเดือนนี้
      var rowMonth = String(r[2] || '').trim();
      if (rowMonth !== monthId) return;
      
      var payload = {};
      try { payload = JSON.parse(r[4] || '{}'); } catch (e) { return; }
      
      // skip ถ้า payload mark deleted
      if (String(payload.status || '').trim() === 'deleted') return;
      
      overlays.push({
        actionId: actionId,
        // v3.43: retro chains push actions with `viewerName` != authenticated pusher.
        //        Trust the payload viewerName if present; fall back to the auth column.
        viewerName: (payload.viewerName ? String(payload.viewerName).trim() : String(r[1] || '').trim()),
        monthId: rowMonth,
        action: String(payload.action || payload.type || r[3] || '').trim(),
        shiftKey: String(payload.shiftKey || ''),
        partnerShiftKey: String(payload.partnerShiftKey || ''),
        partnerName: String(payload.partnerName || '').trim(),
        originalOwner: String(payload.originalOwner || '').trim(),
        createdAt: payload.createdAt || '',
        // v3.43: pass through Draft/Publish + Retro fields so all viewers see the retro badge
        _visibility: payload._visibility || 'public',
        _retroBy: payload._retroBy || null,
        _retroAt: payload._retroAt || null,
        // v3.43: retro override — the recorder pinned this hop's receiver as the current holder
        //        (earlier chain unknown). Kept so every viewer resolves the same current holder.
        _retroFinal: payload._retroFinal || false,
        // v3.44: admin override audit — pass through so every viewer sees the ⚖️ badge (who/when/why)
        _overrideBy: payload._overrideBy || null,
        _overrideAt: payload._overrideAt || null,
        _overrideReason: payload._overrideReason || null
      });
    });
    
    return { ok: true, overlays: overlays, count: overlays.length };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}


// ════════════════════════════════════════════════════════════
// 2. Pure function: apply overlays globally
// ════════════════════════════════════════════════════════════
//
// Input:
//   shifts:   array ของ shift จาก master {date, pos, name, range, ...}
//   overlays: array จาก phxGetAllActiveOverlaysForMonth
//
// Output:
//   shifts ใหม่ (immutable — ไม่แตะ input)
//   พร้อม overlay apply: เซลล์ที่ swap/give/add แล้ว เจ้าของจะเปลี่ยน
//
// หลักการ:
//   - 'give' viewer→partner: shift ของ viewer → เจ้าของใหม่ = partner
//   - 'add' viewer มาจาก partner: shift ของ partner → เจ้าของใหม่ = viewer
//   - 'swap' viewer↔partner: 2 shifts สลับเจ้าของ
//
function _phxApplyOverlaysGlobally(shifts, overlays) {
  if (!Array.isArray(shifts)) return [];
  if (!Array.isArray(overlays) || overlays.length === 0) return shifts.slice();
  
  // สร้าง map ของ shifts ด้วย composite key (date|pos|name|range)
  // เพื่อให้ override ได้รวดเร็ว
  var map = {};
  shifts.forEach(function(s) {
    var key = _phxPBKey(s.date, s.pos, s.name, s.range);
    map[key] = _phxPBClone(s);
  });
  
  // apply ทีละ overlay
  overlays.forEach(function(ov) {
    var act = String(ov.action || '').trim();
    
    if (act === 'give') {
      // shiftKey = "date|pos|viewerName|range"
      // ผล: shift ของ viewer → เจ้าของใหม่ = partner
      var parts = String(ov.shiftKey).split('|');
      if (parts.length < 4) return;
      var d = parts[0], p = parts[1], oldOwner = parts[2], r = parts[3];
      var newOwner = ov.partnerName;
      if (!newOwner) return;
      
      var oldKey = _phxPBKey(d, p, oldOwner, r);
      var newKey = _phxPBKey(d, p, newOwner, r);
      
      var existing = map[oldKey];
      if (existing) {
        // ลบ key เก่า
        delete map[oldKey];
        // สร้าง entry ใหม่ — เปลี่ยน name
        var modified = _phxPBClone(existing);
        modified.name = newOwner;
        modified._origOwner = oldOwner;
        modified._overlayAction = 'give';
        modified._overlayActionId = ov.actionId;
        modified._ghostLabel = '(จาก ' + oldOwner + ')';
        map[newKey] = modified;
      }
      // ถ้า master ไม่มี shift นี้ — skip (overlay อ้างถึง shift ที่หายไป)
    }
    else if (act === 'add') {
      // shiftKey = "date|pos|partnerName|range" (partner = เจ้าของเดิม)
      // ผล: shift ของ partner → เจ้าของใหม่ = viewer
      var parts2 = String(ov.shiftKey).split('|');
      if (parts2.length < 4) return;
      var d2 = parts2[0], p2 = parts2[1], partner = parts2[2], r2 = parts2[3];
      var viewer = ov.viewerName;
      if (!viewer) return;
      
      var oldKey2 = _phxPBKey(d2, p2, partner, r2);
      var newKey2 = _phxPBKey(d2, p2, viewer, r2);
      
      var existing2 = map[oldKey2];
      if (existing2) {
        delete map[oldKey2];
        var modified2 = _phxPBClone(existing2);
        modified2.name = viewer;
        modified2._origOwner = partner;
        modified2._overlayAction = 'add';
        modified2._overlayActionId = ov.actionId;
        modified2._ghostLabel = '(จาก ' + partner + ')';
        map[newKey2] = modified2;
      }
    }
    else if (act === 'swap') {
      // 2 shifts สลับเจ้าของ:
      //   shiftKey         = "date|pos|viewer|range" (เวรของ viewer เดิม)
      //   partnerShiftKey  = "date|pos|partner|range" (เวรของ partner เดิม)
      var s1 = String(ov.shiftKey).split('|');
      var s2 = String(ov.partnerShiftKey).split('|');
      if (s1.length < 4) return;
      
      var viewer3 = ov.viewerName;
      var partner3 = ov.partnerName;
      if (!viewer3 || !partner3) return;
      
      // ขา 1: viewer's shift → partner
      var k1Old = _phxPBKey(s1[0], s1[1], viewer3, s1[3]);
      var k1New = _phxPBKey(s1[0], s1[1], partner3, s1[3]);
      var e1 = map[k1Old];
      if (e1) {
        delete map[k1Old];
        var m1 = _phxPBClone(e1);
        m1.name = partner3;
        m1._origOwner = viewer3;
        m1._overlayAction = 'swap';
        m1._overlayActionId = ov.actionId;
        m1._ghostLabel = '(แลกกับ ' + viewer3 + ')';
        map[k1New] = m1;
      }
      
      // ขา 2: partner's shift → viewer (เฉพาะถ้า partnerShiftKey มีครบ)
      if (s2.length >= 4) {
        var k2Old = _phxPBKey(s2[0], s2[1], partner3, s2[3]);
        var k2New = _phxPBKey(s2[0], s2[1], viewer3, s2[3]);
        var e2 = map[k2Old];
        if (e2) {
          delete map[k2Old];
          var m2 = _phxPBClone(e2);
          m2.name = viewer3;
          m2._origOwner = partner3;
          m2._overlayAction = 'swap';
          m2._overlayActionId = ov.actionId;
          m2._ghostLabel = '(แลกกับ ' + partner3 + ')';
          map[k2New] = m2;
        }
      }
    }
    // ignore action types อื่น ๆ (test, console-*, etc.)
  });
  
  // แปลง map กลับเป็น array
  var out = [];
  for (var k in map) {
    if (Object.prototype.hasOwnProperty.call(map, k)) out.push(map[k]);
  }
  return out;
}


// ─── helpers ────────────────────────────────────────────────

function _phxPBKey(date, pos, name, range) {
  return [date || '', pos || '', name || '', range || ''].join('|');
}

function _phxPBClone(obj) {
  // shallow clone
  var out = {};
  for (var k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  }
  return out;
}


// ════════════════════════════════════════════════════════════
// 3. Manual tests
// ════════════════════════════════════════════════════════════

function testGlobalApply_loadOverlays() {
  var monthId = 'm_มิถุนายน_2569';  // ★ แก้เดือนถ้าจำเป็น
  var r = phxGetAllActiveOverlaysForMonth(monthId);
  
  Logger.log('=== overlays ของ ' + monthId + ' ===');
  Logger.log('ok: ' + r.ok);
  if (!r.ok) { Logger.log('error: ' + r.error); return; }
  Logger.log('count: ' + r.count);
  Logger.log('');
  
  r.overlays.forEach(function(ov, i) {
    Logger.log((i+1) + '. action=' + ov.action + 
               ' | viewer=' + ov.viewerName + 
               ' | partner=' + ov.partnerName +
               ' | shiftKey=' + ov.shiftKey);
  });
}

function testGlobalApply_endToEnd() {
  var monthId = 'm_มิถุนายน_2569';  // ★ แก้
  
  // 1. โหลด master schedule
  var schedData = getScheduleData(_phxPBFindMonthIdFromLabel(monthId));
  if (!schedData || !schedData.schedule) {
    Logger.log('❌ load master schedule fail');
    return;
  }
  var masterShifts = schedData.schedule;
  Logger.log('master shifts: ' + masterShifts.length);
  
  // 2. โหลด overlays
  var ovRes = phxGetAllActiveOverlaysForMonth(monthId);
  if (!ovRes.ok) { Logger.log('❌ load overlays fail'); return; }
  Logger.log('overlays: ' + ovRes.count);
  
  // 3. apply globally
  var consensus = _phxApplyOverlaysGlobally(masterShifts, ovRes.overlays);
  Logger.log('consensus shifts: ' + consensus.length);
  
  // 4. แสดง entries ที่ถูก overlay (มี _origOwner)
  var changed = consensus.filter(function(s) { return s._overlayAction; });
  Logger.log('\n=== shifts ที่ overlay เปลี่ยนเจ้าของ (' + changed.length + ' รายการ) ===');
  changed.forEach(function(s, i) {
    Logger.log((i+1) + '. ' + s.date + ' ' + s.pos + ' ' + s.range +
               ' | now=' + s.name + ' (was=' + s._origOwner + ') | ' + s._ghostLabel);
  });
}

// helper: หา MONTH_LIST id จาก label format (m_<thai>_<year>)
function _phxPBFindMonthIdFromLabel(firebaseMonthId) {
  // firebaseMonthId = 'm_มิถุนายน_2569' → label 'มิถุนายน 2569'
  var m = String(firebaseMonthId).match(/^m_(.+?)_(\d{4})$/);
  if (!m) return firebaseMonthId; // fallback
  var label = m[1] + ' ' + m[2];
  var list = getAvailableMonths();
  for (var i = 0; i < list.length; i++) {
    if (list[i].label === label) return list[i].id;
  }
  return firebaseMonthId; // fallback
}