function testE1_Round3Logic() {
  Logger.log('=== E1 Round 3 Logic Verification ===\n');

  // Test 1: _phxIsRound3Shift detection
  Logger.log('--- Test 1: _phxIsRound3Shift ---');
  const samples = [
    { shift: 'รอบ 3 2:30-8:30' },     // ✓ should detect
    { shift: 'รอบ3' },                  // ✓ should detect
    { shift: 'รอบ 1 16:30-21:30' },    // ✗ no
    { shift: 'รอบกลางวัน' },             // ✗ no
    { shift: '' },                       // ✗ no
    { /* no shift field */ }            // ✗ no
  ];
  samples.forEach(function(s, i) {
    Logger.log('  [' + i + '] shift="' + (s.shift || '<none>') + '" → ' + _phxIsRound3Shift(s));
  });

  // Test 2: _phxParseShiftStartTime — Round 3 should shift +1 day
  Logger.log('\n--- Test 2: _phxParseShiftStartTime ---');
  const tsTests = [
    { name: 'รอบ 3', shift: { timestamp: 20260620, range: '02:30-08:30', shift: 'รอบ 3 2:30-8:30' } },
    { name: 'รอบ 2', shift: { timestamp: 20260620, range: '21:30-02:30', shift: 'รอบ 2 21:30-2:30' } },
    { name: 'รอบ 1', shift: { timestamp: 20260620, range: '16:30-21:30', shift: 'รอบ 1 16:30-21:30' } },
    { name: 'รอบกลางวัน', shift: { timestamp: 20260620, range: '08:30-16:30', shift: 'รอบกลางวัน' } }
  ];
  tsTests.forEach(function(t) {
    const dt = _phxParseShiftStartTime(t.shift);
    const dayShifted = dt ? (dt.getDate() !== 20 ? '✓ shifted to ' + dt.getDate() : 'same day') : 'null';
    Logger.log('  ' + t.name + ' (ts=20260620): startTime=' + (dt ? dt.toString().substring(0, 24) : 'null') + ' → ' + dayShifted);
  });

  // Test 3: Email content — Round 3 should show both dates
  Logger.log('\n--- Test 3: Email content for Round 3 ---');
  const r3Sample = {
    name: 'ณรพล',
    date: '20/06 (ศ.)',
    timestamp: 20260620,
    pos: 'O11',
    range: '02:30-08:30',
    room: 'NM5',
    shift: 'รอบ 3 2:30-8:30'
  };
  const normalSample = {
    name: 'ณรพล',
    date: '20/06 (ศ.)',
    timestamp: 20260620,
    pos: 'A',
    range: '16:30-21:30',
    room: 'IPD',
    shift: 'รอบ 1'
  };

  Logger.log('  >>> Evening (Round 3):');
  Logger.log(JSON.stringify(_phxBuildEveningEmailContent('ณรพล', [r3Sample]), null, 2));

  Logger.log('  >>> Evening (Normal):');
  Logger.log(JSON.stringify(_phxBuildEveningEmailContent('ณรพล', [normalSample]), null, 2));

  Logger.log('  >>> Evening (Mixed Round 3 + Normal):');
  Logger.log(JSON.stringify(_phxBuildEveningEmailContent('ณรพล', [r3Sample, normalSample]), null, 2));

  Logger.log('  >>> Hours-before (Round 3, 5h lead):');
  Logger.log(JSON.stringify(_phxBuildHoursBeforeEmailContent('ณรพล', r3Sample, 5), null, 2));

  Logger.log('  >>> Hours-before (Normal, 5h lead):');
  Logger.log(JSON.stringify(_phxBuildHoursBeforeEmailContent('ณรพล', normalSample, 5), null, 2));

  Logger.log('\n=== END ===');
}

function devTraceB3bSkip() {
  const myName = 'ณรพล';
  
  Logger.log('=== TRACE B3b for ' + myName + ' ===');
  Logger.log('Now: ' + new Date().toString());

  // 1. ดู settings
  if (typeof _phxGetUserReminderSettings === 'function') {
    const settings = _phxGetUserReminderSettings(myName);
    Logger.log('Settings: ' + JSON.stringify(settings));
  } else {
    Logger.log('⚠️ _phxGetUserReminderSettings not found');
  }

  // 2. Test scan สำหรับ "วันพรุ่งนี้" (Evening reminder logic)
  Logger.log('---');
  Logger.log('Evening scan — เวรพรุ่งนี้:');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (typeof _phxScanShiftsByUserForDate === 'function') {
    const byUser = _phxScanShiftsByUserForDate(tomorrow);
    const userCount = Object.keys(byUser).length;
    Logger.log('  Total users with shifts: ' + userCount);
    if (byUser[myName]) {
      Logger.log('  ✅ ' + myName + ' เวรพรุ่งนี้: ' + JSON.stringify(byUser[myName]));
    } else {
      Logger.log('  ⚠️ ' + myName + ' ไม่มีเวรพรุ่งนี้ — เลย skip evening');
    }
  } else {
    Logger.log('  ⚠️ _phxScanShiftsByUserForDate not found');
  }

  // 3. Test scan สำหรับเวรในอนาคต 24 ชม. (Hours-before logic)
  Logger.log('---');
  Logger.log('Hours-before scan — เวรในอีก 24 ชม.:');
  const now = new Date();
  const future = new Date(now.getTime() + 24 * 3600000);
  if (typeof _phxScanShiftsInTimeWindow === 'function') {
    const shifts = _phxScanShiftsInTimeWindow(now, future);
    Logger.log('  Total shifts: ' + (shifts ? shifts.length : 0));
    const myShifts = (shifts || []).filter(function(s) { return s.name === myName; });
    Logger.log('  ' + myName + ' shifts: ' + myShifts.length);
    myShifts.forEach(function(s) {
      Logger.log('    ' + JSON.stringify({ date: s.date, range: s.range, pos: s.pos }));
    });
  } else {
    Logger.log('  ⚠️ _phxScanShiftsInTimeWindow not found');
  }

  Logger.log('=== END TRACE ===');
}

// ============================================================
// devCheckOverlays — Map-A Full Diagnostic (v1)
// ============================================================
// สำรวจระบบทั้งหมด → export JSON ลง Drive สำหรับสร้าง System Map
//   [A] Sheets — schema + row count + sample 2 rows ของทุก sheet
//   [B] Firebase — top-level keys + second-level keys (shallow)
//   [C] Functions — เช็ค ~30 ฟังก์ชันสำคัญว่ามีจริงไหม
//   [D] Script Properties — อ่านทั้งหมด (redact token/hash/password)
//   [E] Export — เขียน JSON ลง Drive → คืน URL
// วิธีใช้: เปิด GAS Editor → เลือกฟังก์ชัน devCheckOverlays → Run
//          → เปิด URL ใน log → ส่ง JSON กลับให้ Claude
// ============================================================
function devCheckOverlays() {
  var startTime = new Date();
  var SPREADSHEET_ID = "1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM";
  var report = {
    metadata: {
      version: "Map-A v1",
      runAt: startTime.toISOString(),
      runBy: (function() { try { return Session.getActiveUser().getEmail(); } catch(e) { return "(unknown)"; } })(),
      spreadsheetId: SPREADSHEET_ID,
      firebaseUrl: (typeof FIREBASE_DB_URL !== "undefined" ? FIREBASE_DB_URL : "(FIREBASE_DB_URL not defined in scope)")
    },
    sheets: [],
    firebase: { topLevelKeys: [], keyDetails: {}, errors: [] },
    functions: {},
    scriptProperties: { keys: [], values: {} },
    errors: []
  };

  console.log("=== Map-A Diagnostic Started ===");
  console.log("Run at: " + startTime.toISOString());
  console.log("");

  // ========== [A] SHEETS SURVEY ==========
  console.log("[A] Surveying sheets...");
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var allSheets = ss.getSheets();
    console.log("  Found " + allSheets.length + " sheet(s)");
    allSheets.forEach(function(sh) {
      var info = { name: sh.getName(), rows: sh.getLastRow(), cols: sh.getLastColumn(), headers: [], samples: [] };
      try {
        if (info.rows >= 1 && info.cols >= 1) {
          info.headers = sh.getRange(1, 1, 1, info.cols).getValues()[0].map(function(v) {
            return String(v).substring(0, 40);
          });
          if (info.rows >= 2) {
            var sampleCount = Math.min(2, info.rows - 1);
            var sampleData = sh.getRange(2, 1, sampleCount, info.cols).getValues();
            info.samples = sampleData.map(function(row) {
              return row.map(function(v) {
                var s = String(v);
                if (s.length > 40 && /^[a-f0-9]+$/i.test(s)) return s.substring(0, 8) + "...(hash)";
                return s.length > 80 ? s.substring(0, 80) + "..." : s;
              });
            });
          }
        }
      } catch(e) { info.error = e.message; }
      report.sheets.push(info);
      console.log("  - " + info.name + " (" + info.rows + " × " + info.cols + ")");
    });
  } catch(e) {
    report.errors.push("Sheets: " + e.message);
    console.log("  ERROR: " + e.message);
  }
  console.log("");

  // ========== [B] FIREBASE PROBE (v2: OAuth + known paths) ==========
  console.log("[B] Probing Firebase (shallow, with auth)...");
  // Paths ที่ code จริงใช้ (จาก grep):
  //   schedules (code.js), user_bindings/user_overlays/pharmacist_names (Phase2B),
  //   positionNotes (Phase_J), scheduleNotes/scheduleNotesParsed (Phase_I)
  var KNOWN_FB_PATHS = [
    "schedules", "user_bindings", "user_overlays", "pharmacist_names",
    "positionNotes", "scheduleNotes", "scheduleNotesParsed"
  ];
  report.firebase.probedPaths = {};
  report.firebase.rootProbe = {};
  try {
    var fbUrl = report.metadata.firebaseUrl;
    if (!fbUrl || fbUrl.indexOf("http") !== 0) {
      report.firebase.errors.push("FIREBASE_DB_URL not usable: " + fbUrl);
      console.log("  Skipped — Firebase URL not available");
    } else {
      // เตรียม fetch options 2 แบบ: no-auth และ with-OAuth
      var noAuthOpts = { muteHttpExceptions: true };
      var authOpts = null;
      try {
        var token = ScriptApp.getOAuthToken();
        authOpts = { muteHttpExceptions: true, headers: { "Authorization": "Bearer " + token } };
      } catch(e) {
        report.firebase.errors.push("cannot get OAuth token: " + e.message);
      }
      // Helper: try no-auth then auth
      function fbFetch(url) {
        var r = UrlFetchApp.fetch(url, noAuthOpts);
        if (r.getResponseCode() !== 200 && authOpts) {
          var r2 = UrlFetchApp.fetch(url, authOpts);
          return { res: r2, usedAuth: true, firstCode: r.getResponseCode() };
        }
        return { res: r, usedAuth: false, firstCode: r.getResponseCode() };
      }
      // Root probe (attempt both)
      var rootTry = fbFetch(fbUrl + "/.json?shallow=true");
      var rootCode = rootTry.res.getResponseCode();
      report.firebase.rootProbe = { code: rootCode, usedAuth: rootTry.usedAuth, firstCode: rootTry.firstCode };
      if (rootCode === 200) {
        var topObj = JSON.parse(rootTry.res.getContentText() || "{}");
        var topKeys = (topObj && typeof topObj === "object") ? Object.keys(topObj) : [];
        report.firebase.topLevelKeys = topKeys;
        console.log("  ✅ Root OK (usedAuth=" + rootTry.usedAuth + "): " + topKeys.join(", "));
      } else {
        report.firebase.topLevelKeys = "(root blocked — see probedPaths for known-path results)";
        report.firebase.errors.push("root HTTP " + rootCode + " (auth also failed) — falling back");
        console.log("  ⚠️ Root blocked (no-auth=" + rootTry.firstCode + ", with-auth=" + rootCode + ")");
      }
      // Always probe known paths (uses same helper)
      console.log("  Probing " + KNOWN_FB_PATHS.length + " known paths...");
      KNOWN_FB_PATHS.forEach(function(path) {
        try {
          var t = fbFetch(fbUrl + "/" + path + ".json?shallow=true");
          var code = t.res.getResponseCode();
          if (code === 200) {
            var body = t.res.getContentText() || "null";
            var obj = JSON.parse(body);
            if (obj === null) {
              report.firebase.probedPaths[path] = { status: "empty", usedAuth: t.usedAuth };
              console.log("    " + path + ": empty (usedAuth=" + t.usedAuth + ")");
            } else if (typeof obj === "object") {
              var keys = Object.keys(obj);
              report.firebase.probedPaths[path] = {
                status: "ok", usedAuth: t.usedAuth, count: keys.length,
                sample: keys.slice(0, 30), truncated: keys.length > 30
              };
              console.log("    " + path + ": " + keys.length + " subkey(s) (usedAuth=" + t.usedAuth + ")");
            } else {
              report.firebase.probedPaths[path] = { status: "scalar", usedAuth: t.usedAuth, value: String(obj).substring(0, 100) };
              console.log("    " + path + ": scalar");
            }
          } else {
            report.firebase.probedPaths[path] = {
              status: "HTTP " + code, firstCode: t.firstCode,
              body: t.res.getContentText().substring(0, 150)
            };
            console.log("    " + path + ": HTTP " + code);
          }
        } catch(e) {
          report.firebase.probedPaths[path] = { status: "ERROR", error: e.message };
          console.log("    " + path + ": ERROR " + e.message);
        }
      });
    }
  } catch(e) {
    report.firebase.errors.push("probe failed: " + e.message);
    console.log("  ERROR: " + e.message);
  }
  console.log("");

  // ========== [C] FUNCTION EXISTENCE ==========
  console.log("[C] Checking key functions...");
  var functionsToCheck = [
    // Web entry
    "doGet", "getScriptUrl",
    // Schedule
    "getScheduleData", "getAvailableMonths", "getScheduleIndexSheet_",
    "listScheduleMonthsFromSheet_", "monthIdToLabel_",
    "readScheduleFromSheet_", "writeScheduleToSheet_",
    // Overlays
    "getUserOverlays", "getUserOverlaysSheet_",
    "appendUserOverlay", "appendUserOverlaysBatch", "clearUserOverlaysForMonth",
    "phxGetAllActiveOverlaysForMonth", "_phxApplyOverlaysGlobally",
    "_phxGetUserOverlayShifts", "debugDumpUserOverlays",
    // Auth
    "verifyGoogleIdToken", "verifyAdminLogin", "isAdminEmail_",
    // Email/Reminder
    "phxQueueEmail", "phxShowQueueStatus",
    "_phxScanShiftsByUserForDate", "_phxScanShiftsInTimeWindow",
    "_phxGetUserReminderSettings", "phxDisableTestMode",
    // Cloud Sync
    "pushToFirebase_", "syncAllSchedulesToFirebase", "syncMonthToFirebase",
    // Diagnostic
    "devCheckToggles", "debugPeopleMatching", "debugScheduleMapping"
  ];
  functionsToCheck.forEach(function(fnName) {
    try {
      var fn = eval(fnName);
      if (typeof fn === "function") {
        var srcLen = 0;
        try { srcLen = fn.toString().length; } catch(e) {}
        report.functions[fnName] = { exists: true, argsCount: fn.length, sourceLen: srcLen };
      } else {
        report.functions[fnName] = { exists: false, note: "not a function (typeof=" + typeof fn + ")" };
      }
    } catch(e) {
      report.functions[fnName] = { exists: false, error: String(e.message || e).substring(0, 100) };
    }
  });
  var existingCount = Object.keys(report.functions).filter(function(k) { return report.functions[k].exists; }).length;
  console.log("  " + existingCount + "/" + functionsToCheck.length + " functions exist");
  console.log("");

  // ========== [D] SCRIPT PROPERTIES (REDACTED) ==========
  console.log("[D] Reading Script Properties (redacted)...");
  try {
    var props = PropertiesService.getScriptProperties().getProperties();
    var keys = Object.keys(props).sort();
    report.scriptProperties.keys = keys;
    keys.forEach(function(k) {
      var v = String(props[k] || "");
      if (/token|hash|password|secret|apikey|auth|salt/i.test(k)) {
        report.scriptProperties.values[k] = "***REDACTED*** (len=" + v.length + ")";
      } else if (v.length > 60 && /^[a-zA-Z0-9\-_.=+/]+$/.test(v)) {
        report.scriptProperties.values[k] = v.substring(0, 12) + "...(truncated, len=" + v.length + ")";
      } else {
        report.scriptProperties.values[k] = v.length > 200 ? v.substring(0, 200) + "..." : v;
      }
    });
    console.log("  " + keys.length + " properties found");
  } catch(e) {
    report.errors.push("ScriptProperties: " + e.message);
    console.log("  ERROR: " + e.message);
  }
  console.log("");

  // ========== [E] EXPORT JSON TO DRIVE ==========
  console.log("[E] Exporting JSON to Drive...");
  try {
    var fileName = "MapA_diagnostic_" + Utilities.formatDate(startTime, "Asia/Bangkok", "yyyyMMdd_HHmmss") + ".json";
    var blob = Utilities.newBlob(JSON.stringify(report, null, 2), "application/json", fileName);
    var file = DriveApp.createFile(blob);
    var fileUrl = file.getUrl();
    console.log("  ✅ Saved: " + fileName);
    console.log("  URL: " + fileUrl);
    console.log("");
    console.log("=== เสร็จแล้ว — เปิด URL ด้านบน → ดาวน์โหลด JSON → ส่งกลับให้ Claude ===");
    return fileUrl;
  } catch(e) {
    console.log("  ⚠️ Drive write failed: " + e.message);
    console.log("  Fallback: JSON dumped ด้านล่าง (copy จาก log)");
    console.log("--- BEGIN JSON ---");
    console.log(JSON.stringify(report, null, 2));
    console.log("--- END JSON ---");
    return null;
  }
}