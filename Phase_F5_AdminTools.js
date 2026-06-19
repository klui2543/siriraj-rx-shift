/**
 * Phase F5: Admin Tools — Diagnostic + Per-month Cleanup
 *
 * Functions:
 *   - devDiagnoseLastUpload — debug ปัญหา data ไม่ขึ้น
 *   - devClearMasterCache    — ล้าง Master cache (กรณี cache มีปัญหา)
 *   - phxAdminListMonths     — list ทุกเดือนที่มี (admin only)
 *   - phxAdminDeleteMonth    — ลบเดือนที่ระบุ ทุก storage tier (admin only)
 */

// ════════════════════════════════════════════════════════════
// DIAGNOSTIC: ดูสถานะหลัง upload
// ════════════════════════════════════════════════════════════
function devDiagnoseLastUpload() {
  Logger.log('═══════════ UPLOAD DIAGNOSTIC ═══════════');

  // [1] MONTH_LIST
  var list = (typeof getAvailableMonths === 'function') ? getAvailableMonths() : [];
  Logger.log('\n📋 MONTH_LIST (' + list.length + ' entries):');
  list.slice(0, 8).forEach(function(m) {
    Logger.log('  • ' + m.label + '  [id=' + m.id + ', updated=' + m.updated + ']');
  });

  // [2] Schedule_Index
  Logger.log('\n📊 Schedule_Index:');
  try {
    var ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
    var idx = ss.getSheetByName('Schedule_Index');
    if (!idx) {
      Logger.log('  ❌ Schedule_Index tab not found');
    } else if (idx.getLastRow() < 2) {
      Logger.log('  ⚠️ Schedule_Index is empty');
    } else {
      var data = idx.getDataRange().getValues();
      data.slice(1).forEach(function(r) {
        Logger.log('  • "' + r[1] + '" → tab="' + r[2] + '" v' + r[3] +
                   ' rows=' + r[5] + ' status=' + r[8]);
      });
    }
  } catch(e) { Logger.log('  ❌ ' + e.message); }

  // [3] Latest month deep-dive
  if (list.length > 0) {
    var latest = list[0];
    Logger.log('\n🗂️ Latest month detail: "' + latest.label + '"');
    Logger.log('  monthId:  ' + latest.id);
    Logger.log('  fileId:   ' + latest.fileId);

    // [3a] Sheet read
    try {
      var sched = readScheduleFromSheet_(latest.id);
      Logger.log('  Sheet rows: ' + (sched === null ? 'null (no tab found)' : sched.length));
      if (sched && sched.length > 0) {
        Logger.log('  Sample (first 3):');
        sched.slice(0, 3).forEach(function(s) {
          Logger.log('    name="' + s.name + '" date="' + s.date + '" pos="' + s.pos + '"');
        });
        // Count unique names
        var uniqueNames = new Set();
        sched.forEach(function(s) { uniqueNames.add(s.name); });
        Logger.log('  Unique names in sheet: ' + uniqueNames.size);
      } else if (sched && sched.length === 0) {
        Logger.log('  ⚠️ Sheet exists but has 0 rows — transformBlobData returned empty');
      }
    } catch(e) { Logger.log('  ❌ Sheet read: ' + e.message); }

    // [3b] JSON file
    if (latest.fileId) {
      try {
        var jsonRaw = DriveApp.getFileById(latest.fileId).getBlob().getDataAsString();
        var json = JSON.parse(jsonRaw);
        var jdata = Array.isArray(json) ? json : json.data;
        Logger.log('  JSON rows: ' + (jdata ? jdata.length : 'null'));
      } catch(e) { Logger.log('  ❌ JSON read: ' + e.message); }
    }

    // [3c] Firebase
    try {
      if (typeof FIREBASE_DB_URL !== 'undefined' && FIREBASE_DB_URL) {
        var fbId = 'm_' + latest.label.replace(/\s+/g, '_');
        var url = FIREBASE_DB_URL + '/schedules/' + encodeURIComponent(fbId) + '/data.json?shallow=true';
        var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        Logger.log('  Firebase /schedules/' + fbId + ': HTTP ' + res.getResponseCode());
        if (res.getResponseCode() === 200) {
          var txt = res.getContentText();
          Logger.log('  Firebase response size: ' + txt.length + ' bytes');
          if (txt === 'null') Logger.log('  ⚠️ Firebase has no data for this month');
        }
      }
    } catch(e) { Logger.log('  ❌ Firebase: ' + e.message); }
  }

  // [4] Master cache
  Logger.log('\n💾 Master cache:');
  try {
    var cached = CacheService.getScriptCache().get('MASTER_DATA_CACHE');
    if (cached) {
      var parsed = JSON.parse(cached);
      Logger.log('  Status: cached');
      Logger.log('  People count: ' + (parsed.name ? parsed.name.length : 0));
      Logger.log('  Time entries: ' + (parsed.master ? parsed.master.length : 0));
    } else {
      Logger.log('  Status: NOT cached (will re-fetch from People sheet on next upload)');
    }
  } catch(e) { Logger.log('  ❌ ' + e.message); }

  Logger.log('\n═══════════ END ═══════════');
}

/**
 * ล้าง Master cache — แก้ปัญหาเมื่อ People sheet update แล้วแต่ระบบยังใช้ข้อมูลเก่า
 */
function devClearMasterCache() {
  try {
    CacheService.getScriptCache().remove('MASTER_DATA_CACHE');
    Logger.log('✅ Master cache cleared — next upload จะดึงสด');
  } catch(e) {
    Logger.log('❌ ' + e.message);
  }
}

// ════════════════════════════════════════════════════════════
// ADMIN: List months (for cleanup UI)
// ════════════════════════════════════════════════════════════
function phxAdminListMonths(adminName, hash) {
  var role = (typeof _phxGetRole === 'function') ? _phxGetRole(adminName, hash) : null;
  if (role !== 'admin') return { ok: false, error: 'admin only' };

  var monthList = (typeof getAvailableMonths === 'function') ? getAvailableMonths() : [];
  var months = monthList.map(function(m) {
    var rowCount = 0, fbStatus = 'unknown';
    try {
      var sched = readScheduleFromSheet_(m.id);
      rowCount = sched ? sched.length : 0;
    } catch(_) {}
    return {
      id: m.id,
      label: m.label,
      firebaseId: 'm_' + m.label.replace(/\s+/g, '_'),
      updated: m.updated || '',
      rowCount: rowCount
    };
  });

  return { ok: true, months: months };
}

// ════════════════════════════════════════════════════════════
// ADMIN: Delete a specific month — all storage tiers
// ════════════════════════════════════════════════════════════
function phxAdminDeleteMonth(adminName, hash, monthId) {
  var role = (typeof _phxGetRole === 'function') ? _phxGetRole(adminName, hash) : null;
  if (role !== 'admin') return { ok: false, error: 'admin only' };
  if (!monthId) return { ok: false, error: 'monthId required' };

  var monthList = (typeof getAvailableMonths === 'function') ? getAvailableMonths() : [];
  var m = null;
  for (var i = 0; i < monthList.length; i++) {
    if (monthList[i].id === monthId) { m = monthList[i]; break; }
  }
  if (!m) return { ok: false, error: 'month not found in MONTH_LIST' };

  var fbId = 'm_' + m.label.replace(/\s+/g, '_');
  var result = {
    label: m.label,
    monthId: monthId,
    deleted: {
      driveFile: false,
      sheetTabs: 0,
      indexRows: 0,
      firebaseKeys: 0,
      overlayRows: 0,
      monthListEntry: false
    },
    errors: []
  };

  // [1] Drive JSON file
  try {
    if (m.fileId) {
      DriveApp.getFileById(m.fileId).setTrashed(true);
      result.deleted.driveFile = true;
    }
  } catch(e) {
    result.errors.push('Drive: ' + e.message);
  }

  // [2] Sheet tabs (Schedule_<id>_v*)
  try {
    var ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
    var prefix = 'Schedule_' + m.id;
    ss.getSheets().forEach(function(sh) {
      var name = sh.getName();
      if (name === prefix || name.indexOf(prefix + '_v') === 0) {
        if (ss.getSheets().length > 1) {
          ss.deleteSheet(sh);
          result.deleted.sheetTabs++;
        }
      }
    });
  } catch(e) {
    result.errors.push('Sheet tabs: ' + e.message);
  }

  // [3] Schedule_Index row
  try {
    var idxSh = SpreadsheetApp.openById(SCHEDULE_SHEET_ID).getSheetByName('Schedule_Index');
    if (idxSh && idxSh.getLastRow() >= 2) {
      var data = idxSh.getRange(2, 1, idxSh.getLastRow() - 1, idxSh.getLastColumn()).getValues();
      for (var j = data.length - 1; j >= 0; j--) {
        if (data[j][0] === m.id) {
          idxSh.deleteRow(j + 2);
          result.deleted.indexRows++;
        }
      }
    }
  } catch(e) {
    result.errors.push('Index: ' + e.message);
  }

  // [4] Firebase
  try {
    if (typeof FIREBASE_DB_URL !== 'undefined' && FIREBASE_DB_URL) {
      var url = FIREBASE_DB_URL + '/schedules/' + encodeURIComponent(fbId) + '.json';
      var res = UrlFetchApp.fetch(url, { method: 'delete', muteHttpExceptions: true });
      var code = res.getResponseCode();
      if (code >= 200 && code < 300) {
        result.deleted.firebaseKeys++;
      } else {
        result.errors.push('Firebase HTTP ' + code);
      }
    }
  } catch(e) {
    result.errors.push('Firebase: ' + e.message);
  }

  // [5] User_Overlays & PHX_Overlays_v2 (swap/give data)
  ['User_Overlays', 'PHX_Overlays_v2'].forEach(function(sheetName) {
    try {
      var n = _phxF5CleanupOverlaysForMonth(sheetName, fbId);
      result.deleted.overlayRows += n;
    } catch(e) {
      result.errors.push('Overlay ' + sheetName + ': ' + e.message);
    }
  });

  // [6] MONTH_LIST
  try {
    var newList = monthList.filter(function(x) { return x.id !== monthId; });
    PropertiesService.getScriptProperties().setProperty('MONTH_LIST', JSON.stringify(newList));
    result.deleted.monthListEntry = true;
  } catch(e) {
    result.errors.push('MONTH_LIST: ' + e.message);
  }

  result.ok = true;
  return result;
}

function _phxF5CleanupOverlaysForMonth(sheetName, monthId) {
  var ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
  var sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return 0;

  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function(h) { return String(h || '').toLowerCase().trim(); });

  var monthCol = -1;
  ['month_id', 'monthid'].forEach(function(name) {
    if (monthCol < 0) monthCol = headers.indexOf(name);
  });
  if (monthCol < 0) return 0;

  var data = sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getValues();
  var deleted = 0;
  for (var i = data.length - 1; i >= 0; i--) {
    if (String(data[i][monthCol]) === monthId) {
      sh.deleteRow(i + 2);
      deleted++;
    }
  }
  return deleted;
}