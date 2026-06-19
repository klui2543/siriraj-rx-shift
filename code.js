// ==========================================
// ⚙️ 1. ตั้งค่าหลัก (Settings)
// ==========================================
const MASTER_TIME_SHEET_ID = "1bxlaH1JAQ3RZtJsBVEqdMn4-dIjxX236wNOsTRRmijc";
const SCHEDULE_SHEET_ID = "1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM";
const INPUT_FOLDER_ID = "1zTvCcqGLOfF_DnhLX7kTyl6E24WgIoNz"; 
const STATS_SHEET_ID = "1ycH3nUqukYBhKRxh7Es4JYnE2H1yLThba1ZK3bVUMDk"; 
const ADMIN_EMAIL = "norapol.uttho@gmail.com";
const ADMIN_PASS_HASH = "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92"; 
const TARGET_EMAIL = "sih2o850@gmail.com"; 
const FILE_KEYWORD = "เวรเภสัชกร";

// บัตรผ่านพิเศษสำหรับหุ่นยนต์ Sync อัตโนมัติ
const SYSTEM_BOT_TOKEN = "INTERNAL_BOT_AUTO_SYNC";

// 🌟 เกณฑ์ความรุนแรงของ Hybrid Gate
const CATASTROPHIC_MISMATCH_PCT = 5;  // > 5% = ต้องบล็อกทิ้ง
const CATASTROPHIC_MISMATCH_ABS = 50; // หรือ > 50 records absolute

// 🌟 ลิงก์เชื่อมต่อ Firebase Realtime Database
const FIREBASE_DB_URL = "https://siriraj-rx-shift-default-rtdb.asia-southeast1.firebasedatabase.app";
// ==========================================
// 🌐 2. ระบบ Web Service (doGet & UI)
// ==========================================
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'verify') {
    return _phxHandleVerifyRoute(e);
  }
  // ★ B2: reset-link handler (เพิ่มตรงนี้)
  if (e && e.parameter && e.parameter.action === 'reset') {
    return _phxHandleResetRoute(e);
  }


    if (e && e.parameter && e.parameter.name && !e.parameter.admin) return serveICS(e);


 if (e.parameter.admin === 'true') {
    // 🔒 Stage F6: Auth guard — require admin role via name+hash in URL
    var _adminName = e.parameter.name || '';
    var _adminHash = e.parameter.hash || '';
    var _adminOk = false;
 
    if (_adminName && _adminHash && typeof _phxGetRole === 'function') {
      try {
        if (_phxGetRole(_adminName, _adminHash) === 'admin') _adminOk = true;
      } catch(_) {}
    }
 
    if (!_adminOk) {
      // Show "Access Denied" page
      var _backUrl = ScriptApp.getService().getUrl();
      return HtmlService.createHtmlOutput(
        '<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><base target="_top">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Access Denied</title>' +
        '<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600&display=swap" rel="stylesheet">' +
        '<style>' +
        'body{font-family:"Kanit",Tahoma,Arial,sans-serif;background:linear-gradient(135deg,#1e3a8a 0%,#3b82f6 100%);' +
        'padding:40px 20px;text-align:center;color:#fff;min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;}' +
        '.card{background:#fff;color:#334155;padding:40px 30px;border-radius:16px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);}' +
        '.icon{font-size:64px;margin-bottom:8px;}' +
        'h1{color:#1e3a8a;font-size:22px;margin:0 0 8px;font-weight:600;}' +
        'p{font-size:14px;margin:16px 0 24px;line-height:1.7;color:#64748b;}' +
        'a.btn{display:inline-block;background:#1e3a8a;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:500;font-size:14px;transition:all 0.2s;}' +
        'a.btn:hover{background:#1e40af;transform:translateY(-1px);box-shadow:0 4px 12px rgba(30,58,138,0.3);}' +
        '</style></head><body>' +
        '<div class="card">' +
        '<div class="icon">🔒</div>' +
        '<h1>Access Denied</h1>' +
        '<p>หน้านี้สำหรับแอดมินเท่านั้น<br>กรุณา login ผ่านหน้าหลักด้วยบัญชีแอดมินก่อน</p>' +
        '<a class="btn" href="' + _backUrl + '" target="_top">← กลับหน้าหลัก</a>' +
        '</div></body></html>'
      ).setTitle('Access Denied').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
 
    // ✅ Admin verified → serve Admin.html
    return HtmlService.createTemplateFromFile('Admin').evaluate()
      .setTitle('Admin Panel')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createTemplateFromFile('Index').evaluate().setTitle('ตารางเวรเภสัชกร').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getScriptUrl() { return ScriptApp.getService().getUrl(); }
// ==========================================
// 🤖 3. ระบบ Gmail Auto-Sync (ประหยัดพลังงาน)
// ==========================================
function processGmailSync_(isManual, token) {

  // 🆕 Phase G: ไม่มี time gate — controlled via trigger lifecycle
  // Hot polling เปิด → trigger เกิด → poll. ปิด → ไม่มี trigger → ไม่ poll
  // Safety net: auto-disable ถ้า hot polling ค้างเกิน 24 ชม.
  if (!isManual) {
    try {
      const props = PropertiesService.getScriptProperties();
      if (props.getProperty(HOT_POLLING_FLAG) === 'true') {
        const startedAt = new Date(props.getProperty(HOT_POLLING_STARTED));
        const hoursAgo = (Date.now() - startedAt.getTime()) / 3600000;
        if (hoursAgo > HOT_POLLING_MAX_HOURS) {
          console.log('⏰ Hot polling expired (' + hoursAgo.toFixed(1) + 'h) — auto-disabling');
          disableHotPolling();
          return "AUTO_REVERTED";
        }
      }
    } catch(e) { console.log('safety net error: ' + e.message); }
  }

  const query = `is:unread subject:"${FILE_KEYWORD}"`;
  const threads = GmailApp.search(query, 0, 1); 

  if (threads.length === 0) return isManual ? "❌ ไม่พบอีเมลใหม่ที่ยังไม่ได้อ่าน" : "NO_NEW_MAIL";

  const message = threads[0].getMessages()[threads[0].getMessageCount() - 1]; 
  const attachments = message.getAttachments();

  for (let i = 0; i < attachments.length; i++) {
    const attachment = attachments[i];
    const fileName = attachment.getName();

      if (fileName.includes(".xlsx") || fileName.includes(".xls")) {
      const base64 = Utilities.base64Encode(attachment.getBytes());
      // 🔔 Phase H: ตั้ง flag บอก uploadLocalFile ว่าเรียกผ่าน Gmail path
      PropertiesService.getScriptProperties().setProperty('_PHX_UPLOAD_CTX', isManual ? 'manualSync' : 'hotPolling');
      let resultLabel;
      try {
        resultLabel = uploadLocalFile(base64, fileName, token);
      } finally {
        PropertiesService.getScriptProperties().deleteProperty('_PHX_UPLOAD_CTX');
      }
      threads[0].markRead();
      
      // 🆕 Phase G: upload สำเร็จ → ปิด hot polling auto
      try { 
        disableHotPolling(); 
        console.log('🎯 Upload success → Hot polling auto-disabled');
      } catch(e) {}
      
      return `✅ อัปเดตตารางรอบ ${resultLabel} สำเร็จ!`;
    }
  }
  return "❌ พบอีเมลแต่ไม่พบไฟล์ Excel แนบมาด้วย";
}

function autoUpdateFromGmail_Automatic() {
  const result = processGmailSync_(false, SYSTEM_BOT_TOKEN);
  if (result !== "OUT_OF_TIME" && result !== "NO_NEW_MAIL") console.log(result);
}

function autoUpdateFromGmail_Manual(token) {
  guardCheck_(token);
  const result = processGmailSync_(true, token);
  if (result.includes("❌")) throw new Error(result);
  return result;
}
// ==========================================
// 📊 4. ระบบจัดการข้อมูล (Data Management)
// ==========================================
function getAvailableMonths() {
  try {
    const props = PropertiesService.getScriptProperties();
    const listStr = props.getProperty('MONTH_LIST');
    return listStr ? sortMonthsByDate(JSON.parse(listStr)) : [];
  } catch(e) { return []; }
}

function getLatestDiagnostics() { 
  return PropertiesService.getScriptProperties().getProperty('LATEST_DIAG'); 
}

function getScheduleData(monthId) {
  let schedule = null;
  let label = "";
  let sheetUrl = "";
  
  // 🌟 ขั้น 1: ลองอ่าน Sheet ตรงๆ ด้วย monthId
  try {
    schedule = readScheduleFromSheet_(monthId);
    if (schedule && schedule.length > 0) {
      const indexSh = getScheduleIndexSheet_();
      const indexData = indexSh.getDataRange().getValues();
      for (let i = 1; i < indexData.length; i++) {
        if (indexData[i][0] === monthId) {
          label = indexData[i][1] || "";
          sheetUrl = indexData[i][2] || "";
          break;
        }
      }
    }
  } catch (e) {
    console.warn("Sheet read by monthId failed:", e.message);
    schedule = null;
  }

  // 🌟 ขั้น 2: ถ้า monthId ไม่ตรง → ค้นด้วย label จาก MONTH_LIST เก่า
  if (!schedule || schedule.length === 0) {
    const oldList = getAvailableMonths();
    const oldMonth = oldList.find(m => m.id === monthId);
    if (oldMonth && oldMonth.label) {
      try {
        const indexSh = getScheduleIndexSheet_();
        const indexData = indexSh.getDataRange().getValues();
        for (let i = 1; i < indexData.length; i++) {
          if (indexData[i][1] === oldMonth.label && indexData[i][5] !== 'archived') {
            const sheetMonthId = indexData[i][0];
            schedule = readScheduleFromSheet_(sheetMonthId);
            if (schedule && schedule.length > 0) {
              label = indexData[i][1];
              sheetUrl = indexData[i][2] || oldMonth.sheetUrl || "";
              break;
            }
          }
        }
      } catch (e) {
        console.warn("Sheet read by label failed:", e.message);
      }
    }
  }

  // 🟡 ขั้น 3: Fallback สุดท้าย → อ่าน JSON เดิม
  if (!schedule || schedule.length === 0) {
    const list = getAvailableMonths();
    const m = list.find(m => m.id === monthId);
    if (!m || !m.fileId) return { error: "ไม่พบข้อมูล (ทั้ง Sheet และ JSON)" };
    try {
      const raw = DriveApp.getFileById(m.fileId).getBlob().getDataAsString();
      const parsed = JSON.parse(raw);
      schedule = Array.isArray(parsed) ? parsed : parsed.data;
      label = m.label;
      sheetUrl = m.sheetUrl;
    } catch (e) {
      return { error: "ไฟล์หาย: " + e.message };
    }
  }

  return {
    schedule: schedule,
    sheets: ["103", "NM5", "IPD", "clinic"],
    sheetUrl: sheetUrl,
    diagnostics: {},
    audit: null
  };
}

function saveMonthToDatabase_(label, jsonData, sheetUrl, diag, providedMonthId) {
  let list = getAvailableMonths();
  const existingIdx = list.findIndex(m => m.label === label);
  
  // 🔧 FIX: ใช้ providedMonthId จาก uploadLocalFile (consistent กับ Sheet) > existing > new
  const monthId = providedMonthId 
    || (existingIdx !== -1 ? list[existingIdx].id : "m_" + new Date().getTime() + Math.floor(Math.random()*1000));
  
  if (existingIdx !== -1) { 
    try { DriveApp.getFileById(list[existingIdx].fileId).setTrashed(true); } catch(e) {} 
    list.splice(existingIdx, 1); 
  }
  
  const dbFile = DriveApp.getFolderById(INPUT_FOLDER_ID).createFile(
    Utilities.newBlob(jsonData, MimeType.PLAIN_TEXT, `DB_${label.replace(/\s+/g, '_')}.json`)
  );
  list.unshift({ 
    id: monthId, 
    label: label, 
    updated: Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yy HH:mm"), 
    fileId: dbFile.getId(), 
    sheetUrl: sheetUrl 
  });
  PropertiesService.getScriptProperties().setProperty('MONTH_LIST', JSON.stringify(list));
  PropertiesService.getScriptProperties().setProperty('LATEST_DIAG', JSON.stringify({ 
    label, time: new Date().toLocaleString('th-TH'), ...diag 
  }));
  return label;
}

// 🌟 สถาปัตยกรรมอัปโหลดระบบ Hybrid Gate (เชื่อมกับ FastFetch)
function uploadLocalFile(base64Data, filename, token) {
  guardCheck_(token);
  let blobData = Utilities.newBlob(Utilities.base64Decode(base64Data), MimeType.MICROSOFT_EXCEL, filename);
  let newFile = DriveApp.getFolderById(INPUT_FOLDER_ID).createFile(blobData);
  let conv = Drive.Files.copy({ name: "Public_" + filename, mimeType: MimeType.GOOGLE_SHEETS }, newFile.getId());
  DriveApp.getFileById(conv.id).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  try {
    // 🚀 ลำดับ 1: ดึงข้อมูลทั้งหมดด้วย FastFetch
    const blob = hydrateBlobFast_(conv.id);

    // 🛡️ ลำดับ 2: วิ่งผ่านด่านสแกน Triple Audit V3.3 แบบ In-Memory
    let auditResult;
    try {
      auditResult = typeof Validator_L3_Reconciliation === 'function' ? Validator_L3_Reconciliation(blob) : { passed: true };
    } catch (e) {
      auditResult = { passed: false, fatal: e.message };
    }

    // ⚙️ ลำดับ 3: ทำ Data Transformation (ดึง Master ด้วย API แล้ว)
    const result = transformBlobData_(blob);

    const severity = classifyAuditSeverity_(auditResult, result.data.length);
    
    // 🔴 Catastrophic → BLOCK ทันที
    if (severity.level === 'CATASTROPHIC') {
      try { sendAuditAlertEmail_(result.label, filename, auditResult, severity); } catch(e) {}
      throw new Error('🔴 Audit ไม่ผ่าน (ข้อผิดพลาดร้ายแรง): ' + severity.reason + '\n\n👉 กรุณาตรวจ Excel ต้นฉบับและอัปโหลดใหม่');
    }

    // ⚠️ Minor หรือ ✅ Passed → PUBLISH
    logStatisticsToSheet_("Manual (" + filename + ")", result.label, result.diagnostics);
    const sheetUrl = "https://docs.google.com/spreadsheets/d/" + conv.id;
    const payload = {
      data: result.data,
      sheets: result.diagnostics.sheetsProcessed,
      diagnostics: result.diagnostics,
      audit: {
        passed: !!auditResult.passed,
        severity: severity.level,
        verifiedAt: new Date().toISOString(),
        summary: auditResult.layers && auditResult.layers.L3 ? {
          coordinate: auditResult.layers.L3.coordinate.stats,
          population: auditResult.layers.L3.population
        } : null,
        issues: severity.level !== 'OK' ? severity.reason : null
      }
    };

  // 🔧 FIX: Generate ONE consistent monthId — used for BOTH Sheet write AND MONTH_LIST
      const oldList = getAvailableMonths();
      const existingMonth = oldList.find(function(x) { return x.label === result.label; });
      const _consistentMonthId = existingMonth 
        ? existingMonth.id 
        : ("m_" + new Date().getTime() + Math.floor(Math.random()*1000));

      // 🌟 R2: เขียนลง Schedule Sheet (versioned) - surface errors
      let sheetWriteStatus = "skipped";
      try {
        const schedMonthId = _consistentMonthId;  // ← reuse same ID
      
      console.log("📊 Attempting Sheet write — monthId: " + schedMonthId + " | label: " + result.label + " | existing: " + (existingMonth ? "yes" : "no"));
      
      const sheetResult = writeScheduleToSheet_(schedMonthId, result.data, result.label, sheetUrl, filename);
      sheetWriteStatus = "✅ " + sheetResult.tabName + " (v" + sheetResult.version + ", " + sheetResult.rowCount + " rows)";
      console.log("📊 Sheet write SUCCESS: " + sheetWriteStatus);
    } catch(e) {
      sheetWriteStatus = "❌ FAILED: " + e.message + " | Stack: " + (e.stack || "no stack");
      console.error("📊 " + sheetWriteStatus);
      // อย่ายกเลิกทั้งหมด แต่บันทึก error ให้เห็นชัด
      try {
        MailApp.sendEmail(ADMIN_EMAIL, "❌ Sheet write failed for " + result.label, sheetWriteStatus);
      } catch(e2) {}
    }

    const saved = saveMonthToDatabase_(result.label, JSON.stringify(payload), sheetUrl, result.diagnostics, _consistentMonthId);

    // 🚀 ยิงข้อมูลขึ้น Firebase คู่ขนานกันไปเลย!
    const monthIdForFirebase = "m_" + result.label.replace(/\s+/g, '_');
    pushToFirebase_(monthIdForFirebase, payload);

    // 🌟 Phase I — Note Block ingest (Tier 0 + 1 + 2)
    //  Non-fatal: any error just logs, doesn't break upload flow
    try {
      var _noteResult = runNoteIngestPipeline(conv.id, monthIdForFirebase);
      if (_noteResult.ok && _noteResult.approved) {
        console.log('[Phase I] Note ingest+validate ✓ ('
                    + _noteResult.durationMs + 'ms, '
                    + 'lines=' + _noteResult.stages.blob.lineCount
                    + ', items=' + _noteResult.stages.hydrate.itemCount + ')');
      } else {
        console.warn('[Phase I] Note pipeline issue: ' + JSON.stringify(_noteResult.stages));
      }
    } catch(_phxNoteErr) {
      console.warn('[Phase I] note ingest failed (non-fatal): ' + _phxNoteErr.message);
    }

    // 🌟 Phase J — Per-position notes + unusual sheet detection
    //  Non-fatal: any error just logs, doesn't break upload flow
    try {
      var _phaseJResult = runPositionNoteIngestPipeline(conv.id, monthIdForFirebase);
      console.log('[Phase J] result: ' + JSON.stringify({
        ok: _phaseJResult.ok,
        positionCount: _phaseJResult.stages.positionNotes.positionCount,
        unusualSheets: _phaseJResult.stages.unusualSheets.sheets,
        durationMs: _phaseJResult.durationMs
      }));

      if (_phaseJResult.stages.unusualSheets.hasUnusual) {
        _phxJPushUnusualBroadcast_(monthIdForFirebase, _phaseJResult.stages.unusualSheets.sheets);
      }
    } catch(_phxJErr) {
      console.warn('[Phase J] error (non-fatal): ' + String(_phxJErr));
    }


    // 🌟 Stage F3 + Phase H: Auto-announce ใช้ Phase H toggle เป็น gate (ลบ dedup ออก)
    // - Toggle ON → broadcast (admin ตัดสินใจเอง — ลบ dedup เพื่อให้ control ชัดเจน)
    // - Toggle OFF → skip
    // - ถ้า re-broadcast ไม่ต้องการ → toggle OFF ก่อน upload หรือใช้ manual button
    try {
      var _phxAction = (typeof _phxDetectUploadAction === 'function')
                       ? _phxDetectUploadAction(token)
                       : ((token === SYSTEM_BOT_TOKEN) ? 'hotPolling' : 'fileUpload');
      var _phxLineOK = (typeof _phxShouldNotifyLine === 'function')
                       ? _phxShouldNotifyLine(_phxAction)
                       : true;
      var _labelOK = result.label && result.label !== 'ไม่ระบุเดือน';

      if (!_labelOK) {
        console.log('📢 Skipped — label ไม่ระบุเดือน');
      } else if (!_phxLineOK) {
        console.log('📢 Skipped LINE — Phase H toggle OFF for action: ' + _phxAction);
      } else if (typeof phxAnnounceNewMonthInternal !== 'function') {
        console.log('📢 Skipped — phxAnnounceNewMonthInternal not deployed');
      } else {
        var _actor = (token === SYSTEM_BOT_TOKEN) ? 'auto-sync (Gmail)' : 'manual upload';
        var _ar = phxAnnounceNewMonthInternal(monthIdForFirebase, _actor);
        console.log('📢 Auto-announced "' + result.label + '" (action: ' + _phxAction + ') — LINE: ' +
                    _ar.lineSentCount + '/' + _ar.lineTotal +
                    (_ar.lineErrors && _ar.lineErrors.length ? ' | errors: ' + JSON.stringify(_ar.lineErrors) : ''));
      }
    } catch(_e) {
      console.error('📢 Auto-announce error (non-fatal): ' + _e.message);
    }
    // ════════════════════════════════════════════════════════════

    // 🔔 Phase H: post-upload hook (email admin + track last upload — always runs)
    try {
      if (typeof _phxAfterUploadHook === 'function') {
        var _hAction = (typeof _phxDetectUploadAction === 'function')
                       ? _phxDetectUploadAction(token)
                       : ((token === SYSTEM_BOT_TOKEN) ? 'hotPolling' : 'fileUpload');
        _phxAfterUploadHook(_hAction, result.label, monthIdForFirebase, result.data.length, filename);
      }
    } catch(_phxHookErr) { console.warn('[Phase H] hook error: ' + _phxHookErr.message); }
 

    if (severity.level === 'MINOR') {
      try { sendAuditAlertEmail_(result.label, filename, auditResult, severity); } catch(e) {}
      return saved + ' ⚠️ (ขึ้นระบบแล้ว แต่ตรวจพบ ' + severity.summary + ' โปรดเช็กอีเมล)';
    }
    return saved;

  } finally {
    newFile.setTrashed(true);
  }
}

function classifyAuditSeverity_(auditResult, totalRecords) {
  if (auditResult.fatal) return { level: 'CATASTROPHIC', reason: 'Audit fatal: ' + auditResult.fatal };
  const L1 = auditResult.layers && auditResult.layers.L1;
  const L3 = auditResult.layers && auditResult.layers.L3;
  if (L1 && !L1.passed && !L1.skipped) return { level: 'CATASTROPHIC', reason: 'L1 failed: ' + (L1.errors || []).map(e => e.code).join(', ') };
  if (auditResult.passed) return { level: 'OK', reason: null };
  if (L3) {
    const mismatchCount = L3.coordinate && L3.coordinate.stats ? (L3.coordinate.stats.mismatched || 0) + (L3.coordinate.stats.notFound || 0) : 0;
    const popDiffTotal = (L3.errors || []).reduce((s, e) => s + Math.abs(e.diff || 0), 0);
    const totalIssues = mismatchCount + popDiffTotal;
    const issuePct = totalRecords > 0 ? (totalIssues / totalRecords * 100) : 100;
    
    if (totalIssues > CATASTROPHIC_MISMATCH_ABS || issuePct > CATASTROPHIC_MISMATCH_PCT) {
      return { level: 'CATASTROPHIC', reason: 'พบความผิดพลาด ' + totalIssues + ' รายการ (' + issuePct.toFixed(2) + '%)', summary: totalIssues + ' issues' };
    }
    return { level: 'MINOR', reason: 'พบความผิดพลาดเล็กน้อย ' + totalIssues + ' รายการ', summary: totalIssues + ' issues (' + issuePct.toFixed(2) + '%)' };
  }
  return { level: 'CATASTROPHIC', reason: 'Unknown failure structure' };
}

function sendAuditAlertEmail_(label, filename, auditResult, severity) {
  const icon = severity.level === 'CATASTROPHIC' ? '🔴' : '⚠️';
  const status = severity.level === 'CATASTROPHIC' ? 'BLOCKED (ไม่ขึ้นระบบ)' : 'PUBLISHED with warnings (ขึ้นระบบแล้ว)';
  const subject = icon + ' Audit: ' + label + ' — ' + status;
  let body = '📁 ไฟล์: ' + filename + '\n📅 เดือน: ' + label + '\n⚡ สถานะ: ' + status + '\n🔍 ปัญหา: ' + severity.reason + '\n\n';
  const L3 = auditResult.layers && auditResult.layers.L3;
  if (L3 && L3.coordinate && L3.coordinate.mismatches && L3.coordinate.mismatches.length > 0) {
    body += '🔎 รายการที่เหลื่อมล้ำ (ตัวอย่าง):\n';
    L3.coordinate.mismatches.slice(0, 10).forEach(m => {
      body += '  • ' + (m.rec.date || '?') + ' | ' + (m.rec.pos || '?') + ' | JSON: "' + (m.rec.name || '?') + '" vs Excel: "' + (m.foundCellName || '-') + '"\n';
    });
  }
  body += '\n👉 แอดมินสามารถซ่อมตารางใน Excel ต้นฉบับ และอัปโหลดทับได้ทันทีเมื่อสะดวก';
  MailApp.sendEmail(ADMIN_EMAIL, subject, body);
}


function pushToFirebase_(monthId, payload) {
  if (!FIREBASE_DB_URL || !FIREBASE_DB_URL.startsWith("http")) return;
  
  // ✅ FIXED: ใช้ FIREBASE_DB_URL ที่ประกาศไว้ + encodeURIComponent สำหรับชื่อเดือนภาษาไทย
  const url = `${FIREBASE_DB_URL}/schedules/${encodeURIComponent(monthId)}.json`;
  const options = {
    method: "put", // ใช้ PUT เพื่อเขียนทับข้อมูลของเดือนนั้นๆ
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const res = UrlFetchApp.fetch(url, options);
    console.log("🔥 Firebase Sync: " + res.getResponseCode() + " | URL: " + url);
  } catch (e) {
    console.error("🔥 Firebase Sync Error: " + e.message);
  }
}

// ==========================================
// 🔍 5. Engine วิเคราะห์และ Transform ข้อมูล (In-Memory + API)
// ==========================================
function fullTrim_(str) { return str == null ? "" : String(str).replace(/[\u00A0\u200B\u2028\u2029\uFEFF]/g, " ").replace(/\s+/g, " ").trim(); }
function normalizePos_(raw) { return raw ? fullTrim_(String(raw).split("\n")[0]).replace(/MN/g, "NM") : ""; }
function normalizeName_(name) {
  if (!name) return "";
  let n = fullTrim_(name).replace(/^(ภก\.|ภญ\.|นาย|นางสาว|น\.ส\.|นาง)\s*/g, "");
  return n.replace(/\s*\(\s*/g, "(").replace(/\s*\)\s*/g, ")");
}
function lookupTime_(timeMap, posCode) {
  const p = posCode.replace(/_\(slot\d+\)$/, "").trim();
  if (timeMap[p]) return timeMap[p];
  let stripped = p.replace(/[\*\#]/g, "").trim();
  if (timeMap[stripped]) return timeMap[stripped];
  let nospaces = stripped.replace(/\s/g, "");
  return timeMap[nospaces] || null;
}
function processDate_(dObj) {
  if (!(dObj instanceof Date) || isNaN(dObj.getTime())) return { date: "-", ts: 0 };
  const days = ["อา.","จ.","อ.","พ.","พฤ.","ศ.","ส."];
  return { date: Utilities.formatDate(dObj, "GMT+7", "dd/MM") + " (" + days[dObj.getDay()] + ")", ts: parseInt(Utilities.formatDate(dObj, "GMT+7", "yyyyMMdd"), 10) };
}
function guessShiftFromTime_(timeStr) {
  if(!timeStr) return "รอบพิเศษ";
  let t = timeStr.replace(/:/g, ".");
  if(t.includes("8.30") && t.includes("16.30")) return "รอบกลางวัน";
  if(t.includes("16.30") && t.includes("20.30")) return "รอบ 1";
  if(t.includes("16.30")) return "รอบ 1";
  if(t.includes("21.30")) return "รอบ 2";
  if(t.includes("0.30")) return "รอบ 3";
  return "รอบพิเศษ";
}
function isValidPersonName_(n) {
  if (!n || n.length < 2 || n.length > 25) return false; 
  if (/[0-9]/.test(n)) return false; 
  const forbidden = ["หยุด", "พัก", "คลินิก", "เภสัช", "นาที", "ชั่วโมง", "ปิด", "เปิด", "เวลา"];
  for (let i = 0; i < forbidden.length; i++) { if (n.includes(forbidden[i])) return false; }
  return true;
}

function transformBlobData_(blob) {
  const timeMap = {}; const validNames = new Set();
  const foundNamesThisMonth = new Set(); const newNamesSet = new Set();
  
  const diag = { 
    masterStatus: "", sheetsProcessed: [], sheetsSkipped: [], allSheetNames: [],
    extraSheets: [], unmatchedPositions: new Set(), newNames: [], missingNames: [], 
    rejectedDates: 0, mergedHeaders: 0, totalRecords: 0, uniqueNames: 0 
  };
  
  // 🚀 อัปเกรดความเร็ว: ระบบ Cache จำ Master Data ไว้ 1 ชั่วโมง (ลดเวลาไป 2-3 วินาที)
  const cache = CacheService.getScriptCache();
  const cachedMaster = cache.get('MASTER_DATA_CACHE');
  
  let masterData = [], nameData = [];
  
  if (cachedMaster) {
    // ถ้าเคยจำไว้แล้ว ให้ดึงจากความจำมาใช้เลย (0.01 วินาที)
    const parsed = JSON.parse(cachedMaster);
    masterData = parsed.master;
    nameData = parsed.name;
  } else {
    // ถ้ายังไม่มี ค่อยวิ่งไปเปิดจากไฟล์จริง
    try {
      let masterResp;
    try {
      // 🌟 อ่านจากแท็บ People (เริ่ม A2 เพราะ A1 เป็น header)
      masterResp = Sheets.Spreadsheets.Values.batchGet(MASTER_TIME_SHEET_ID, {
        ranges: ["'Time'!A1:Z100", "'People'!A2:A500"],
        valueRenderOption: 'FORMATTED_VALUE'
      });
    } catch (e1) {
      // Fallback กรณี People ยังไม่มี → ลอง Name เก่า
      console.warn("People sheet not found, fallback to Name:", e1.message);
      masterResp = Sheets.Spreadsheets.Values.batchGet(MASTER_TIME_SHEET_ID, {
        ranges: ["'Time'!A1:Z100", "'People'!A2:A500"],
        valueRenderOption: 'FORMATTED_VALUE'
      });
    }
      masterData = (masterResp.valueRanges && masterResp.valueRanges[0].values) ? masterResp.valueRanges[0].values : [];
      nameData = (masterResp.valueRanges && masterResp.valueRanges[1].values) ? masterResp.valueRanges[1].values : [];
      
      // บันทึกความจำไว้ 1 ชั่วโมง (3600 วินาที)
      cache.put('MASTER_DATA_CACHE', JSON.stringify({master: masterData, name: nameData}), 3600);
    } catch(e) {
      console.error("Master Data Fetch Error:", e.message);
    }
  }

  let hIdx = -1;
  for (let i = 0; i < Math.min(10, masterData.length); i++) {
    if (masterData[i].some(c => { let t = fullTrim_(c); return t.includes("ตำแหน่ง") || t.includes("รหัส"); })) { hIdx = i; break; }
  }

  if (hIdx !== -1) {
    const headers = masterData[hIdx].map(h => fullTrim_(h));
    let posColsConfig = [];
    for (let j = 0; j < headers.length; j++) {
      if (headers[j].includes("ตำแหน่ง") || headers[j].includes("รหัส")) {
        let cfg = { pos: j, shift: -1, start: -1, end: -1 };
        for (let k = j + 1; k <= j + 5 && k < headers.length; k++) {
          let nextH = headers[k].toLowerCase();
          if (nextH.includes("ตำแหน่ง") || nextH.includes("รหัส")) break;
          if (nextH === "รอบ" || nextH.includes("รอบเวร")) cfg.shift = k;
          if (nextH.includes("start") || nextH.includes("เริ่ม")) cfg.start = k;
          if (nextH.includes("end") || nextH.includes("จบ") || nextH.includes("ถึง")) cfg.end = k;
        }
        posColsConfig.push(cfg);
      }
    }
    for (let r = hIdx + 1; r < masterData.length; r++) {
      posColsConfig.forEach(cfg => {
        let p = normalizePos_(masterData[r][cfg.pos]);
        if (p && !p.includes("ตำแหน่ง")) {
          let sVal = cfg.shift !== -1 ? fullTrim_(masterData[r][cfg.shift]) : "-";
          let tStart = cfg.start !== -1 ? fullTrim_(masterData[r][cfg.start]) : "";
          let tEnd = cfg.end !== -1 ? fullTrim_(masterData[r][cfg.end]) : "";
          let tRange = (tStart && tEnd) ? `${tStart}-${tEnd}` : (tStart || tEnd || "-");
          timeMap[p] = { shift: sVal, range: tRange };
        }
      });
    }
  }

  // แมปชื่อเข้า Set ด้วยข้อมูลจาก Sheets API
  nameData.forEach(r => { if (r[0]) validNames.add(normalizeName_(r[0])); });
  
  const final = []; let foundLabel = "";
  const standardSheets = ["103", "NM5", "IPD", "clinic"];
  const blacklistPatterns = [/summary/i, /ตั้งค่า/i, /^name$/i, /ไม่\s*ok/i, /สำรอง/i, /เก่า/i];

  blob.sheetOrder.forEach(room => {
    diag.allSheetNames.push(room);
    
    let isStandard = standardSheets.some(s => room.toLowerCase().includes(s.toLowerCase()));
    let isBlacklisted = blacklistPatterns.some(p => p.test(room));
    
    if (!isStandard && !isBlacklisted) { diag.extraSheets.push(room); }
    if (isBlacklisted) { diag.sheetsSkipped.push(room + " (ถูกยกเว้น)"); return; }

    try {
      const sheetObj = blob.sheets[room];
      if (sheetObj.empty) throw new Error("ชีทว่างเปล่า");

      const displayData = sheetObj.display;
      const data = sheetObj.values;
      
      let dateRowIdx = -1;
      for (let i = 0; i < Math.min(15, displayData.length); i++) { 
        if (displayData[i].some(c => c && c.toString().includes("วันที่"))) { dateRowIdx = i; break; } 
      }
      if (dateRowIdx === -1) { diag.sheetsSkipped.push(room + " (ไม่พบหัวตารางวันที่)"); return; }

      if (!foundLabel) {
        for (let i = 0; i < Math.min(10, displayData.length); i++) {
          let m = displayData[i].join(" ").match(/(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s+\d{4}/);
          if (m) { foundLabel = m[0]; break; }
        }
      }

      const isClinic = /clinic|คลินิก|คลีนิค/i.test(room);

      if (isClinic) {
        for (let r = dateRowIdx + 1; r < data.length; r++) {
          let posA = normalizePos_(displayData[r][0]); 
          let posB = displayData[r][1] ? fullTrim_(String(displayData[r][1])) : '';
          if (!posA || posA === "วัน") continue;
          let posCode = (posA === "เสริม") ? `เสริม (${room})` : posA;
          if (posB) posCode = posCode + posB;  // append marker from Column B (e.g., $, L)

          for (let c = 2; c < data[dateRowIdx].length; c++) {
            let name = normalizeName_(displayData[r][c]);
            if (name && name.toLowerCase() !== 'x' && isValidPersonName_(name) && data[dateRowIdx][c] instanceof Date) {
              let isNew = !validNames.has(name);
              if (isNew) newNamesSet.add(name); else foundNamesThisMonth.add(name);
              let dInfo = processDate_(data[dateRowIdx][c]);
              
              const shiftId = Utilities.base64Encode(dInfo.date + posCode + name).substring(0, 15);
              final.push({ 
                shift_id: shiftId, status: "active", originOwner: name,
                name, date: dInfo.date, timestamp: dInfo.ts, pos: posCode, 
                shift: "⚠️", range: "ตรวจสอบ", isNew, room 
              });
            }
          }
        }
      } else {
        let hRow = displayData[dateRowIdx];
        let timeRow = (dateRowIdx > 0) ? displayData[dateRowIdx - 1] : [];
        let fHead = []; let fTime = []; let lastP = ""; let lastT = "";

        for (let j = 0; j < hRow.length; j++) {
          let cur = normalizePos_(hRow[j]);
          if (cur) { lastP = (cur === "เสริม") ? `เสริม (${room})` : cur; fHead[j] = lastP; } 
          else if (lastP && j >= 2) { fHead[j] = lastP; diag.mergedHeaders++; }
          
          let cTime = timeRow[j] ? fullTrim_(timeRow[j]) : "";
          if (cTime) { lastT = cTime; fTime[j] = lastT; }
          else if (lastT && j >= 2) { fTime[j] = lastT; }
        }

        for (let i = dateRowIdx + 1; i < data.length; i++) {
          if (!(data[i][1] instanceof Date)) continue;
          for (let j = 2; j < data[i].length; j++) {
            let name = normalizeName_(displayData[i][j]);
            if (name && name.toLowerCase() !== 'x' && isValidPersonName_(name)) {
              let pFull = fHead[j];
              let pLookup = pFull.includes("เสริม (") ? "เสริม" : pFull;
              let tInfo = { shift: "-", range: "-" };
              
              if (pLookup === "เสริม") {
                let rawT = fTime[j];
                if(rawT) {
                  tInfo.range = rawT.replace(/ น\./g, "").replace(/\(8 ชม\.\)/g, "").trim();
                  tInfo.shift = guessShiftFromTime_(tInfo.range);
                }
              } else {
                tInfo = lookupTime_(timeMap, pLookup) || { shift: "-", range: "-" };
              }
              
              let isNew = !validNames.has(name);
              if (isNew) newNamesSet.add(name); else foundNamesThisMonth.add(name);
              let dInfo = processDate_(data[i][1]);
              
              const shiftId = Utilities.base64Encode(dInfo.date + pFull + name).substring(0, 15);
              final.push({ 
                shift_id: shiftId, status: "active", originOwner: name,
                name, date: dInfo.date, timestamp: dInfo.ts, pos: pFull, 
                shift: tInfo.shift, range: tInfo.range, isNew, room 
              });
            }
          }
        }
      }
      diag.sheetsProcessed.push(room);
    } catch(e) { diag.sheetsSkipped.push(room + " (Error: " + e.message + ")"); }
  });

  diag.newNames = Array.from(newNamesSet);
  diag.missingNames = Array.from(validNames).filter(n => !foundNamesThisMonth.has(n));
  diag.totalRecords = final.length;
  diag.uniqueNames = foundNamesThisMonth.size + newNamesSet.size;
  return { label: foundLabel || "ไม่ระบุเดือน", data: final, diagnostics: diag };
}

// ==========================================
// 🔐 6. ระบบรักษาความปลอดภัย (Security)
// ==========================================
const ADMIN_HASH_PROP_KEY = 'ADMIN_PASSWORD_HASH';

function getAdminHash_() {
  const fromProp = PropertiesService.getScriptProperties().getProperty(ADMIN_HASH_PROP_KEY);
  return fromProp || ADMIN_PASS_HASH;  // fallback constant ตอนยังไม่เคยตั้ง
}

function verifyAdminLogin(password) {
  if (!password) return { success: false, message: "กรุณาใส่รหัสผ่าน" };
  const inputHash = hashPassword_(String(password));
  if (inputHash !== getAdminHash_()) {
    return { success: false, message: "รหัสผ่านไม่ถูกต้อง" };
  }
  const t = Utilities.getUuid();
  CacheService.getScriptCache().put('ADMIN_TOKEN_' + t, 'VALID', 3600);
  return { success: true, token: t };
}

function changeAdminPassword(token, oldPassword, newPassword) {
  guardCheck_(token);
  if (!oldPassword || !newPassword) throw new Error("ข้อมูลไม่ครบ");
  if (String(newPassword).length < 6) throw new Error("รหัสใหม่ต้องมีอย่างน้อย 6 ตัวอักษร");
  if (hashPassword_(String(oldPassword)) !== getAdminHash_()) {
    throw new Error("รหัสเดิมไม่ถูกต้อง");
  }
  if (String(oldPassword) === String(newPassword)) {
    throw new Error("รหัสใหม่ต้องไม่เหมือนรหัสเดิม");
  }
  const newHash = hashPassword_(String(newPassword));
  PropertiesService.getScriptProperties().setProperty(ADMIN_HASH_PROP_KEY, newHash);
  return { success: true };
}

// 🛠️ Setup function (รันจาก editor): ตั้ง initial password ใหม่ ถ้าไม่จำรหัสเดิม
function setupAdminPasswordFromEditor() {
  const PASSWORD_HERE = "ChangeMeNow123";  // ⬅️ แก้ตัวนี้เป็นรหัสที่คุณอยากใช้ ก่อนกด Run
  if (PASSWORD_HERE === "ChangeMeNow123") throw new Error("⚠️ แก้ตัวแปร PASSWORD_HERE ก่อน Run");
  if (PASSWORD_HERE.length < 6) throw new Error("รหัสต้องอย่างน้อย 6 ตัว");
  PropertiesService.getScriptProperties().setProperty(ADMIN_HASH_PROP_KEY, hashPassword_(PASSWORD_HERE));
  console.log("✅ ตั้งรหัส admin ใหม่แล้ว — ลอง login ด้วยรหัสที่เพิ่งตั้งได้เลย");
}

function guardCheck_(t) { 
  if (t === SYSTEM_BOT_TOKEN) return; 
  if (!t || CacheService.getScriptCache().get('ADMIN_TOKEN_' + t) !== 'VALID') throw new Error("❌ ล็อกอินหมดอายุ"); 
}

function hashPassword_(t) {
  const r = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, t);
  let h = ''; for (let i=0; i<r.length; i++) { let v = r[i]; if(v<0) v+=256; if(v.toString(16).length==1) h+='0'; h+=v.toString(16); } return h;
}

function sortMonthsByDate(list) {
  const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  return list.sort((a, b) => {
    let pA = a.label.split(' '), pB = b.label.split(' ');
    let sA = (pA.length === 2) ? (parseInt(pA[1], 10) * 100) + (thaiMonths.indexOf(pA[0]) + 1) : 0;
    let sB = (pB.length === 2) ? (parseInt(pB[1], 10) * 100) + (thaiMonths.indexOf(pB[0]) + 1) : 0;
    return sB - sA; 
  });
}

function logStatisticsToSheet_(sourceName, label, diag) {
  try {
    const timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
    let unmatched = diag.unmatchedPositions && diag.unmatchedPositions.size > 0 ? Array.from(diag.unmatchedPositions).join(', ') : "-";
    let newN = diag.newNames && diag.newNames.length > 0 ? diag.newNames.join(', ') : "-";
    let missingN = diag.missingNames && diag.missingNames.length > 0 ? diag.missingNames.join(', ') : "-";
    
    // 🚀 บันทึก Row สถิติด้วย Sheets API
    const valueRange = Sheets.newValueRange();
    valueRange.values = [[timestamp, sourceName, label, diag.uniqueNames || 0, diag.totalRecords || 0, diag.rejectedDates || 0, unmatched, newN, missingN]];
    
    Sheets.Spreadsheets.Values.append(valueRange, STATS_SHEET_ID, "A1", { 
      valueInputOption: "USER_ENTERED" 
    });
  } catch(e) { console.error("Stats Log Error: " + e.message); }
}

function deleteAllData(token) {
  guardCheck_(token);
  let list = getAvailableMonths();
  list.forEach(m => { if (m.fileId) { try { DriveApp.getFileById(m.fileId).setTrashed(true); } catch(e) {} } });
  PropertiesService.getScriptProperties().deleteProperty('MONTH_LIST');
  PropertiesService.getScriptProperties().deleteProperty('LATEST_DIAG');
  return "ล้างฐานข้อมูลสำเร็จ";
}

function deleteMonth(monthId, token) {
  guardCheck_(token);
  let list = getAvailableMonths();
  const m = list.find(m => m.id === monthId);
  if (m && m.fileId) { try { DriveApp.getFileById(m.fileId).setTrashed(true); } catch(e) {} }
  list = list.filter(m => m.id !== monthId);
  PropertiesService.getScriptProperties().setProperty('MONTH_LIST', JSON.stringify(list));
  return "ลบข้อมูลสำเร็จ!";
}
// =================================================================
// 🛡️ ระบบ Multi-month Audit (สแกนตรวจสอบประวัติย้อนหลังทุกเดือน)
// =================================================================
function runAllMonthsAudit() {
  const token = CacheService.getScriptCache().get('ADMIN_TOKEN_' + SYSTEM_BOT_TOKEN) || "INTERNAL_PASS";
  const list = getAvailableMonths();
  if (!list || list.length === 0) throw new Error("ไม่มีข้อมูลเดือนในระบบให้ตรวจสอบ");

  let passedCount = 0;
  let failedCount = 0;

  list.forEach(m => {
    if (m.sheetUrl) {
      try {
        const sheetId = m.sheetUrl.split("/d/")[1].split("/")[0];
        const blob = hydrateBlobFast_(sheetId);
        const auditRes = typeof Validator_L3_Reconciliation === 'function' ? Validator_L3_Reconciliation(blob) : { passed: true };
        if (auditRes.passed) passedCount++;
        else { failedCount++; console.warn(`⚠️ Audit ไม่ผ่านสำหรับเดือน: ${m.label}`, auditRes); }
      } catch (e) {
        failedCount++; console.error(`❌ Audit Error (${m.label}): ${e.message}`);
      }
    }
  });
  return { totalMonths: list.length, passed: passedCount, failed: failedCount };
}

function debugPeopleMatching() {
  // ล้าง cache ก่อนทุกครั้งที่ debug
  CacheService.getScriptCache().remove('MASTER_DATA_CACHE');
  
  let result = { peopleStatus: "", peopleCount: 0, peopleExamples: [], 
                 scheduleCount: 0, matched: 0, missed: 0, 
                 missingExamples: [], matchedExamples: [] };
  
  // 1) อ่าน People
  let peopleNames = [];
  try {
    const resp = Sheets.Spreadsheets.Values.batchGet(MASTER_TIME_SHEET_ID, {
      ranges: ["'People'!A2:A500"],
      valueRenderOption: 'FORMATTED_VALUE'
    });
    peopleNames = ((resp.valueRanges && resp.valueRanges[0].values) || [])
                  .map(r => r[0]).filter(Boolean);
    result.peopleStatus = "✅ อ่าน People ได้";
  } catch(e) {
    result.peopleStatus = "❌ อ่าน People ไม่ได้: " + e.message;
    return result;
  }
  result.peopleCount = peopleNames.length;
  result.peopleExamples = peopleNames.slice(0, 5);
  
  // 2) เทียบกับตารางเวรเดือนล่าสุด
  const list = getAvailableMonths();
  if (list.length === 0) { result.peopleStatus += " | ไม่มีเดือนให้เทียบ"; return result; }
  
  const data = getScheduleData(list[0].id);
  if (!data.schedule) { result.peopleStatus += " | ดึงตารางเวรไม่ได้"; return result; }
  
  const scheduleNames = [...new Set(data.schedule.map(i => i.name))];
  result.scheduleCount = scheduleNames.length;
  
  // 3) Normalize เทียบกัน (ต้อง normalize ทั้ง 2 ฝั่งเหมือนกัน!)
  const peopleNormalized = new Set(peopleNames.map(n => normalizeName_(n)));
  const matches = [], misses = [];
  scheduleNames.forEach(n => {
    if (peopleNormalized.has(normalizeName_(n))) matches.push(n);
    else misses.push(n);
  });
  
  result.matched = matches.length;
  result.missed = misses.length;
  result.matchedExamples = matches.slice(0, 5);
  result.missingExamples = misses.slice(0, 15);  // ⚠️ ขึ้นกับชื่อพวกนี้
  
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
// ==========================================
// 📊 SCHEDULE STORAGE — Sheet-based (replaces JSON files)
// ==========================================
const SCHEDULE_INDEX_TAB = "Schedule_Index";

function getScheduleIndexSheet_() {
  const ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
  let sh = ss.getSheetByName(SCHEDULE_INDEX_TAB);
  if (!sh) {
    sh = ss.insertSheet(SCHEDULE_INDEX_TAB);
    sh.getRange(1, 1, 1, 6).setValues([[
      "month_id", "label", "sheet_url", "row_count", "last_modified", "status"
    ]]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * อ่าน schedule จาก Sheet tab
 */

function listScheduleMonthsFromSheet_() {
  const sh = getScheduleIndexSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const data = sh.getRange(2, 1, lastRow - 1, 6).getValues();
  return data
    .filter(r => r[0] && r[5] !== "archived")
    .map(r => ({
      id: r[0],
      label: r[1],
      sheetUrl: r[2],
      rowCount: r[3],
      lastModified: r[4]
    }));
}

function monthIdToLabel_(monthId) {
  // "2569_06" → "มิถุนายน 2569"
  const monthsTh = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const m = monthId.match(/(\d{4})[_-]?(\d{1,2})/);
  if (!m) return monthId;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  if (month < 0 || month > 11) return monthId;
  return monthsTh[month] + " " + year;
}

function debugScheduleMapping() {
  // 1. ดู Schedule_Index (Sheet ใหม่)
  Logger.log("=== Schedule_Index ===");
  try {
    const ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
    const sh = ss.getSheetByName("Schedule_Index");
    if (!sh) { Logger.log("❌ ไม่มี Schedule_Index"); }
    else {
      const data = sh.getDataRange().getValues();
      data.forEach((r, i) => Logger.log("Row " + i + ": " + JSON.stringify(r)));
    }
    
    // แสดง tab ทั้งหมด
    Logger.log("\n=== All tabs in Schedule Sheet ===");
    ss.getSheets().forEach(s => Logger.log("  " + s.getName()));
  } catch(e) { Logger.log("❌ " + e.message); }
  
  // 2. ดู MONTH_LIST (ระบบเก่า)
  Logger.log("\n=== MONTH_LIST (old system) ===");
  const list = getAvailableMonths();
  list.forEach(m => Logger.log("  id=" + m.id + " | label=" + m.label));
  
  // 3. ดูว่า label ตรงกันไหม
  Logger.log("\n=== Matching attempt ===");
  if (list.length > 0) {
    const firstMonth = list[0];
    Logger.log("Frontend sends monthId: " + firstMonth.id);
    Logger.log("Looking for label: " + firstMonth.label);
    
    try {
      const sh = SpreadsheetApp.openById(SCHEDULE_SHEET_ID).getSheetByName("Schedule_Index");
      if (sh) {
        const idx = sh.getDataRange().getValues();
        let found = false;
        for (let i = 1; i < idx.length; i++) {
          if (idx[i][1] === firstMonth.label) {
            Logger.log("✅ MATCH at row " + i + ": sheetMonthId=" + idx[i][0]);
            found = true;
            break;
          }
        }
        if (!found) {
          Logger.log("❌ NO MATCH — labels in index:");
          for (let i = 1; i < idx.length; i++) {
            Logger.log("  index label: '" + idx[i][1] + "' vs old label: '" + firstMonth.label + "'");
          }
        }
      }
    } catch(e) { Logger.log("❌ " + e.message); }
  }
}
// ==========================================
// 🧹 Step 1: ลบ tab เก่าที่ label ผิด
// ==========================================
function cleanupBadMigration() {
  const ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
  const sheets = ss.getSheets();
  const deleted = [];
  
  sheets.forEach(sh => {
    const name = sh.getName();
    // ลบทุก tab ที่ขึ้นต้นด้วย Schedule_ (รวม Schedule_Index)
    if (name.startsWith("Schedule")) {
      // กันไม่ให้ลบ sheet สุดท้าย (Sheet ต้องมีอย่างน้อย 1 tab)
      if (ss.getSheets().length > 1) {
        ss.deleteSheet(sh);
        deleted.push(name);
      }
    }
  });
  
  Logger.log("🧹 ลบ " + deleted.length + " tabs: " + deleted.join(", "));
  return deleted;
}
// ==========================================
// 🔄 Step 2: Migration v2 — ใช้ monthId + label จาก MONTH_LIST ตรงๆ
// ==========================================
function migrateJSONtoSheets_v2() {
  const oldList = getAvailableMonths();
  if (oldList.length === 0) {
    Logger.log("❌ MONTH_LIST ว่าง ไม่มีข้อมูลให้ migrate");
    return [];
  }
  
  const results = [];
  
  oldList.forEach(function(m) {
    try {
      const raw = DriveApp.getFileById(m.fileId).getBlob().getDataAsString();
      const parsed = JSON.parse(raw);
      const schedule = Array.isArray(parsed) ? parsed : (parsed.data || parsed.schedule);
      
      if (!schedule || !Array.isArray(schedule)) {
        results.push({ label: m.label, status: '⚠️ skipped', reason: 'no data array' });
        return;
      }
      
      // 🌟 ใช้ monthId เดียวกับ MONTH_LIST → frontend ส่ง ID นี้มา → หาเจอทันที
      writeScheduleToSheet_(m.id, schedule, m.label, m.sheetUrl || "");
      results.push({ label: m.label, monthId: m.id, status: '✅ migrated', rows: schedule.length });
    } catch(e) {
      results.push({ label: m.label, status: '❌ ' + e.message });
    }
  });
  
  Logger.log("=== MIGRATION v2 COMPLETE ===");
  results.forEach(function(r) { Logger.log(JSON.stringify(r)); });
  return results;
}

/**
 * 🔄 Sync ข้อมูลจาก Schedule Sheet → Firebase (รันหลังแก้ Sheet ด้วยมือ)
 * รันจาก dropdown ได้เลย หรือจะเรียกจาก trigger ก็ได้
 */
function syncAllSchedulesToFirebase() {
  const oldList = getAvailableMonths();
  const results = [];
  
  oldList.forEach(function(m) {
    try {
      // อ่านจาก Sheet (ผ่าน getScheduleData)
      const data = getScheduleData(m.id);
      if (data.error) {
        results.push({ label: m.label, status: '⚠️ ' + data.error });
        return;
      }
      
      // Push ไป Firebase ด้วย monthId format เดียวกับ uploadLocalFile
      const firebaseMonthId = "m_" + m.label.replace(/\s+/g, '_');
      const payload = {
        data: data.schedule,
        sheets: data.sheets,
        diagnostics: data.diagnostics || {},
        audit: data.audit || null,
        _syncedFromSheet: true,
        _syncedAt: new Date().toISOString()
      };
      pushToFirebase_(firebaseMonthId, payload);
      updateJSONFile_(m.label, data.schedule);
      results.push({ label: m.label, firebaseId: firebaseMonthId, status: '✅ synced', rows: data.schedule.length });
    } catch(e) {
      results.push({ label: m.label, status: '❌ ' + e.message });
    }
  });
  
  Logger.log("=== FIREBASE SYNC COMPLETE ===");
  results.forEach(function(r) { Logger.log(JSON.stringify(r)); });
  return results;
}

/**
 * 🔄 Sync เฉพาะเดือนเดียว (เร็วกว่า)
 * ใช้ตอนแก้ Sheet เดือนเดียวแล้วอยาก push
 */
function syncMonthToFirebase(monthLabel) {
  const oldList = getAvailableMonths();
  const m = oldList.find(function(x) { return x.label === monthLabel; });
  if (!m) throw new Error("ไม่พบเดือน: " + monthLabel);
  
  const data = getScheduleData(m.id);
  if (data.error) throw new Error(data.error);
  
  const firebaseMonthId = "m_" + m.label.replace(/\s+/g, '_');
  const payload = {
    data: data.schedule,
    sheets: data.sheets,
    diagnostics: data.diagnostics || {},
    audit: data.audit || null,
    _syncedFromSheet: true,
    _syncedAt: new Date().toISOString()
  };
  pushToFirebase_(firebaseMonthId, payload);
  Logger.log("✅ Synced " + m.label + " → Firebase (" + data.schedule.length + " rows)");
  return "✅ " + m.label + " synced!";
}
// ==========================================
// 📊 SCHEDULE STORAGE v2 — Versioning + Auto-sync
// ==========================================

/**
 * หา version ถัดไปสำหรับเดือนนี้
 */
function getNextVersion_(monthId) {
  const ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
  const sheets = ss.getSheets();
  const prefix = "Schedule_" + monthId;
  let maxVer = 0;
  
  sheets.forEach(function(sh) {
    const name = sh.getName();
    if (name === prefix) maxVer = Math.max(maxVer, 1); // tab เก่าไม่มี _v
    const m = name.match(new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "_v(\\d+)$"));
    if (m) maxVer = Math.max(maxVer, parseInt(m[1], 10));
  });
  
  return maxVer + 1;
}

/**
 * ซ่อน tab versions เก่าของเดือนนี้ (เก็บไว้ไม่ลบ)
 */
function hideOldVersions_(monthId, keepTabName) {
  const ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
  const prefix = "Schedule_" + monthId;
  
  ss.getSheets().forEach(function(sh) {
    const name = sh.getName();
    if (name === keepTabName) return; // ไม่ซ่อน active tab
    if (name === "Schedule_Index") return;
    if (name.startsWith(prefix)) {
      try { sh.hideSheet(); } catch(e) { /* อาจเป็น tab เดียวที่เหลือ */ }
    }
  });
}

/**
 * เขียน schedule ลง Sheet tab แบบ versioned
 * คืน { tabName, version, rowCount }
 */
function writeScheduleToSheet_(monthId, schedule, label, sheetUrl, sourceFile) {
  if (!Array.isArray(schedule)) throw new Error("schedule ต้องเป็น array");
  
  const ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
  const nextVer = getNextVersion_(monthId);
  const tabName = "Schedule_" + monthId + "_v" + nextVer;
  
  // สร้าง tab ใหม่
  let sh = ss.insertSheet(tabName);
  sh.getRange(1, 1, 1, 12).setValues([[
    "shift_id", "name", "date", "timestamp", "pos", "shift", "range",
    "room", "isNew", "originOwner", "status", "last_modified"
  ]]);
  sh.setFrozenRows(1);
  
  if (schedule.length > 0) {
    const now = new Date().toISOString();
    const rows = schedule.map(function(s) {
      return [
        s.shift_id || "", s.name || "", s.date || "", s.timestamp || 0,
        s.pos || "", s.shift || "", s.range || "", s.room || "",
        s.isNew === true, s.originOwner || s.name || "",
        s.status || "active", now
      ];
    });
    sh.getRange(2, 1, rows.length, 12).setValues(rows);
  }
  
  // ซ่อน versions เก่า
  hideOldVersions_(monthId, tabName);
  
  // อัปเดต Schedule_Index
  updateScheduleIndex_(monthId, label, tabName, nextVer, sheetUrl, schedule.length, sourceFile);
  
  return { tabName: tabName, version: nextVer, rowCount: schedule.length };
}

/**
 * อัปเดต Schedule_Index (ขยายเป็น 9 columns)
 */

function updateScheduleIndex_(monthId, label, activeTab, version, sheetUrl, rowCount, sourceFile) {
  const sh = getScheduleIndexSheet_();
  
  // อัปเกรด header ถ้ายังเป็นแบบเก่า (6 cols)
  const currentHeaders = sh.getRange(1, 1, 1, 9).getValues()[0];
  if (currentHeaders[2] !== "active_tab") {
    sh.getRange(1, 1, 1, 9).setValues([[
      "month_id", "label", "active_tab", "version", "sheet_url", "row_count", "last_modified", "source_file", "status"
    ]]);
  }
  
  const data = sh.getDataRange().getValues();
  const now = new Date().toISOString();
  const newRow = [monthId, label || "", activeTab || "", version || 1, sheetUrl || "", rowCount || 0, now, sourceFile || "", "active"];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === monthId) {
      sh.getRange(i + 1, 1, 1, 9).setValues([newRow]);
      return;
    }
  }
  sh.appendRow(newRow);
}

function readScheduleFromSheet_(monthId) {
  const ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
  
  let tabName = null;
  try {
    const indexSh = ss.getSheetByName("Schedule_Index");
    if (indexSh) {
      const data = indexSh.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === monthId) {
          tabName = data[i][2];
          break;
        }
      }
    }
  } catch(e) {}
  
  if (!tabName) tabName = "Schedule_" + monthId;
  
  const sh = ss.getSheetByName(tabName);
  if (!sh) return null;
  
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  
  const data = sh.getRange(2, 1, lastRow - 1, 12).getValues();
  return data
    .filter(function(r) { return r[0]; })
    .map(function(r) {
      return {
        shift_id: String(r[0] || ''),
        name: String(r[1] || ''),
        date: String(r[2] || ''),
        timestamp: Number(r[3]) || 0,
        pos: String(r[4] || ''),
        shift: String(r[5] || ''),
        range: String(r[6] || ''),
        room: String(r[7] || ''),
        isNew: r[8] === true || r[8] === "TRUE",
        originOwner: String(r[9] || ''),
        status: String(r[10] || '')
      };
    });
}
function updateJSONFile_(monthLabel, scheduleData) {
  const list = getAvailableMonths();
  const m = list.find(function(x) { return x.label === monthLabel; });
  if (!m || !m.fileId) return false;
  
  try {
    const file = DriveApp.getFileById(m.fileId);
    const payload = {
      data: scheduleData,
      sheets: ["103", "NM5", "IPD", "clinic"],
      _updatedFromSheet: true,
      _updatedAt: new Date().toISOString()
    };
    file.setContent(JSON.stringify(payload));
    console.log("📁 JSON updated: " + monthLabel);
    return true;
  } catch(e) {
    console.warn("📁 JSON update failed: " + e.message);
    return false;
  }
}

// ==========================================
// 🎨 USER OVERLAYS — Personal edits per user per month
// ==========================================
// User_Overlays sheet stores "personal edits" (add/remove/edit) of each pharmacist.
// Anonymous users keep edits in LocalStorage only; logged-in users sync to this sheet
// for cross-device retrieve. Master schedule is read-only — overlays apply on top.
//
// month_id convention: label-based (e.g. "m_มิถุนายน_2569") to match Firebase keys.
//
// action_type values:
//   "add"    — user added a new shift not in master (received from someone)
//   "remove" — user removed a shift from their personal view (gave away)
//   "edit"   — user changed details of an existing shift (time, pos, etc.)

const USER_OVERLAYS_TAB = "User_Overlays";

function getUserOverlaysSheet_() {
  const ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
  let sh = ss.getSheetByName(USER_OVERLAYS_TAB);
  if (!sh) {
    sh = ss.insertSheet(USER_OVERLAYS_TAB);
    sh.getRange(1, 1, 1, 7).setValues([[
      "user_email", "month_id", "action_type", "shift_id",
      "payload_json", "created_at", "source_device"
    ]]);
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 240);
    sh.setColumnWidth(2, 180);
    sh.setColumnWidth(3, 100);
    sh.setColumnWidth(4, 140);
    sh.setColumnWidth(5, 420);
    sh.setColumnWidth(6, 170);
    sh.setColumnWidth(7, 100);
  }
  return sh;
}

/**
 * Read all overlay actions for a user (optionally filtered by month).
 * Returns chronological array of { action_type, shift_id, payload, created_at }.
 */
function getUserOverlays(userEmail, monthId) {
  if (!userEmail) return [];
  const email = String(userEmail).toLowerCase().trim();
  const month = String(monthId || '').trim();

  const sh = getUserOverlaysSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const data = sh.getRange(2, 1, lastRow - 1, 7).getValues();
  return data
    .filter(function(r) {
      if (String(r[0]).toLowerCase().trim() !== email) return false;
      if (month && String(r[1]).trim() !== month) return false;
      return true;
    })
    .map(function(r) {
      let payload = {};
      try { payload = r[4] ? JSON.parse(r[4]) : {}; } catch(e) { payload = {}; }
      return {
        action_type: String(r[2] || ''),
        shift_id: String(r[3] || ''),
        payload: payload,
        created_at: r[5] instanceof Date ? r[5].toISOString() : String(r[5] || ''),
        source_device: String(r[6] || '')
      };
    })
    .sort(function(a, b) {
      return (a.created_at || '').localeCompare(b.created_at || '');
    });
}

/**
 * Append a single overlay action.
 * action = { action_type, shift_id, payload, source_device? }
 */
function appendUserOverlay(userEmail, monthId, action) {
  if (!userEmail) throw new Error('appendUserOverlay: userEmail required');
  if (!monthId) throw new Error('appendUserOverlay: monthId required');
  if (!action || !action.action_type) throw new Error('appendUserOverlay: action.action_type required');

  const validTypes = ['add', 'remove', 'edit'];
  if (validTypes.indexOf(action.action_type) === -1) {
    throw new Error('appendUserOverlay: invalid action_type: ' + action.action_type);
  }

  const sh = getUserOverlaysSheet_();
  const now = new Date().toISOString();
  sh.appendRow([
    String(userEmail).toLowerCase().trim(),
    String(monthId).trim(),
    action.action_type,
    String(action.shift_id || ''),
    JSON.stringify(action.payload || {}),
    now,
    String(action.source_device || 'unknown')
  ]);
  return { ok: true, created_at: now };
}

/**
 * Bulk append — used at first login to sync LocalStorage edits to cloud.
 * actions = array of action objects.
 */
function appendUserOverlaysBatch(userEmail, monthId, actions) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return { ok: true, count: 0 };
  }
  const sh = getUserOverlaysSheet_();
  const now = new Date().toISOString();
  const email = String(userEmail).toLowerCase().trim();
  const month = String(monthId).trim();

  const rows = actions.map(function(a) {
    return [
      email, month,
      String(a.action_type || ''),
      String(a.shift_id || ''),
      JSON.stringify(a.payload || {}),
      a.created_at || now,
      String(a.source_device || 'unknown')
    ];
  });

  const startRow = sh.getLastRow() + 1;
  sh.getRange(startRow, 1, rows.length, 7).setValues(rows);
  return { ok: true, count: rows.length };
}

/**
 * Wipe all overlays for a user+month (reset button on UI).
 */
function clearUserOverlaysForMonth(userEmail, monthId) {
  const email = String(userEmail).toLowerCase().trim();
  const month = String(monthId).trim();
  const sh = getUserOverlaysSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: true, deleted: 0 };

  const data = sh.getRange(2, 1, lastRow - 1, 7).getValues();
  let deleted = 0;
  // Iterate backwards so deleteRow indices stay valid
  for (let i = data.length - 1; i >= 0; i--) {
    if (String(data[i][0]).toLowerCase().trim() === email
        && String(data[i][1]).trim() === month) {
      sh.deleteRow(i + 2);
      deleted++;
    }
  }
  return { ok: true, deleted: deleted };
}

/**
 * Verify a Google ID Token (JWT from Google Sign-In) and extract email.
 * Frontend gets JWT from Google Identity Services and sends here for verification.
 * Returns { email, name, picture } on success, null on failure.
 */
function verifyGoogleIdToken(idToken) {
  if (!idToken) return null;
  try {
    const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      console.warn('verifyGoogleIdToken: status ' + res.getResponseCode());
      return null;
    }
    const data = JSON.parse(res.getContentText());
    // email_verified comes back as string "true" or boolean true
    const verified = data.email_verified === true || data.email_verified === 'true';
    if (!verified || !data.email) return null;
    return {
      email: String(data.email).toLowerCase().trim(),
      name: String(data.name || ''),
      picture: String(data.picture || '')
    };
  } catch(e) {
    console.error('verifyGoogleIdToken error: ' + e.message);
    return null;
  }
}

/**
 * Debug helper: dump all overlays for a user (call from Apps Script editor).
 */
function debugDumpUserOverlays(email) {
  const rows = getUserOverlays(email, '');
  Logger.log('Found ' + rows.length + ' overlays for ' + email);
  rows.forEach(function(r) { Logger.log(JSON.stringify(r)); });
  return rows;
}

// ==========================================
// 🛡️ ADMIN BYPASS HELPERS
// ==========================================

function isAdminEmail_(email) {
  return (email || "").toString().toLowerCase().trim() === ADMIN_EMAIL.toLowerCase();
}

// ==========================================
// ⏱️ Performance instrumentation
// ==========================================
let _PERF_LOG = [];
function _perfReset() { _PERF_LOG = []; }
function _perfMark(label) { _PERF_LOG.push({ t: Date.now(), label: label }); }
function _perfReport() {
  if (_PERF_LOG.length < 2) return;
  const lines = ['⏱️  PERF REPORT'];
  const total = _PERF_LOG[_PERF_LOG.length - 1].t - _PERF_LOG[0].t;
  lines.push('  TOTAL: ' + total + 'ms');
  lines.push('  ─────');
  for (let i = 1; i < _PERF_LOG.length; i++) {
    const dt = _PERF_LOG[i].t - _PERF_LOG[i-1].t;
    const flag = dt > 500 ? ' 🐌' : (dt > 200 ? ' ⚠️' : '');
    lines.push('  +' + String(dt).padStart(5) + 'ms  ' + _PERF_LOG[i].label + flag);
  }
  console.log(lines.join('\n'));
}

/** ─────────────────────────────────────────────────────────
 *  PHASE 0.1: Device logging
 *  เก็บ iOS/Android/Desktop ratio → STATS_SHEET → DeviceLog tab
 *  เรียกจาก Index.html (fire-and-forget, ไม่ block UI)
 *
 *  PERF: 1 Sheet API call (appendRow) — เฉลี่ย 200-400ms
 *  ใช้ try/catch กัน error ทำให้ frontend พัง
 *  ───────────────────────────────────────────────────────── */
function logDeviceType(email, device) {
  try {
    const ss = SpreadsheetApp.openById(STATS_SHEET_ID);
    let sheet = ss.getSheetByName('DeviceLog');
    if (!sheet) {
      sheet = ss.insertSheet('DeviceLog');
      sheet.getRange(1, 1, 1, 3).setValues([['timestamp', 'email', 'device']]);
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(1, 160);
      sheet.setColumnWidth(2, 240);
      sheet.setColumnWidth(3, 100);
    }
    sheet.appendRow([new Date(), email || '(unknown)', device || 'Unknown']);
  } catch (e) {
    console.error('[Phase 0.1] logDeviceType failed:', e.message);
  }
}


function serveICS(e) {
  try {
    const name = (e && e.parameter && e.parameter.name || '').trim();
    if (!name) {
      return ContentService.createTextOutput('Error: missing name parameter')
        .setMimeType(ContentService.MimeType.TEXT);
    }
 
    // 🌟 v3.2: Determine target months
    // - If `months` param provided (e.g. "2026-5" or "2026-5,2026-6") → use those
    // - Else → default current + 5 ahead (for subscription feeds)
    const monthsParam = e && e.parameter && e.parameter.months;
    let targetYM;
    if (monthsParam) {
      targetYM = _parseMonthsParam(monthsParam);
      if (!targetYM || targetYM.length === 0) {
        return ContentService.createTextOutput('Error: invalid months param: ' + monthsParam)
          .setMimeType(ContentService.MimeType.TEXT);
      }
    } else {
      const now = new Date();
      targetYM = [];
      for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        targetYM.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
      }
    }
 
    // Read Schedule_Index
    const ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
    const idx = ss.getSheetByName(SCHEDULE_INDEX_TAB);
    if (!idx || idx.getLastRow() < 2) return _serveEmptyICS(name);
 
    const data = idx.getRange(2, 1, idx.getLastRow() - 1, 9).getValues();
    const tabs = [];
    data.forEach(function(r) {
      if (r[8] !== 'active' || !r[2]) return;
      const info = _parseThaiMonthLabel(String(r[1] || ''));
      if (!info) return;
      const inRange = targetYM.some(function(t) {
        return t.year === info.year && t.month === info.month;
      });
      if (inRange) tabs.push({ tab: r[2], year: info.year, month: info.month });
    });
 
    // Collect shifts
    const shifts = [];
    tabs.forEach(function(tr) {
      const sh = ss.getSheetByName(tr.tab);
      if (!sh || sh.getLastRow() < 2) return;
      const rows = sh.getDataRange().getValues();
      const h = rows[0].map(function(x) { return String(x).toLowerCase(); });
      const iName = h.indexOf('name'),
            iDate = h.indexOf('date'),
            iPos = h.indexOf('pos'),
            iShift = h.indexOf('shift'),
            iRange = h.indexOf('range'),
            iRoom = h.indexOf('room');
      if (iName < 0 || iDate < 0) return;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][iName]).trim() !== name) continue;
        shifts.push({
          date: rows[i][iDate],
          pos: iPos >= 0 ? rows[i][iPos] : '',
          shift: iShift >= 0 ? rows[i][iShift] : '',
          range: iRange >= 0 ? rows[i][iRange] : '',
          room: iRoom >= 0 ? rows[i][iRoom] : '',
          year: tr.year,
          month: tr.month
        });
      }
    });
 
    const overlays = _loadOverlaysForName(ss, name);
    const effective = _applyOverlays(shifts, overlays, name);
 
    // Round 3 transformation
    const round3Mode = (e && e.parameter && e.parameter.round3) || 'start';
    const effectiveR3 = phxApplyRound3ToItems(effective, round3Mode);
 
    // Reminders
    const remindStr = (e && e.parameter && e.parameter.remind !== undefined)
      ? String(e.parameter.remind) : '60,1080';
    const reminders = remindStr.split(',')
      .map(function(x) { return parseInt(x.trim(), 10); })
      .filter(function(n) { return n > 0; });
 
    // Build ICS + apply filename for download
    const icsBody = _buildICS(effectiveR3, name, reminders);
    let output = ContentService.createTextOutput(icsBody)
      .setMimeType(ContentService.MimeType.ICAL);
 
    const isDownload = e && e.parameter && (e.parameter.download === '1' || e.parameter.download === 'true');
    if (isDownload) {
      const filename = _buildICSFilename(name, tabs);
      try {
        output = output.downloadAsFile(filename);
      } catch (e1) {
        Logger.log('[serveICS] downloadAsFile rejected "' + filename + '": ' + e1.message);
        try {
          const ascii = 'shifts_' + new Date().toISOString().slice(0, 10) + '.ics';
          output = output.downloadAsFile(ascii);
        } catch (e2) {
          Logger.log('[serveICS] ASCII filename also rejected: ' + e2.message);
        }
      }
    }
 
    return output;
 
  } catch (err) {
    return ContentService.createTextOutput('Error: ' + err.message + '\n' + err.stack)
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

function _serveEmptyICS(name) {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Siriraj Rx Shift//EN',
    'X-WR-CALNAME:Siriraj Rx Shift (' + name + ')',
    'X-WR-TIMEZONE:Asia/Bangkok',
    'END:VCALENDAR',
    ''
  ].join('\r\n');
  return ContentService.createTextOutput(ics).setMimeType(ContentService.MimeType.ICAL);
}

function _buildICSFilename(name, tabs) {
  // Format: "Shift MM_YYYY.ics" (Gregorian year, 0-padded month, ASCII safe)
  // ใช้ tab แรก (ส่วนใหญ่ download = 1 month ตามที่ frontend ส่ง)
  if (tabs && tabs.length >= 1) {
    const t = tabs[0];
    const mm = (t.month < 10 ? '0' : '') + t.month;
    return 'Shift ' + mm + '_' + t.year + '.ics';
  }
  return 'Shift current.ics';
}

const THAI_MONTHS_ICS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

function _parseThaiMonthLabel(label) {
  if (!label) return null;
  const parts = String(label).trim().split(/\s+/);
  if (parts.length < 2) return null;
  const mi = THAI_MONTHS_ICS.indexOf(parts[0]);
  if (mi < 0) return null;
  const yBE = parseInt(parts[1], 10);
  if (!yBE) return null;
  return { year: yBE - 543, month: mi + 1 };
}

// ════════════════════════════════════════════════════════════
// 🔔 Per-shift VALARM builder (Feature 2)
// User col F/G overrides URL param. Returns array of minutes before shift.
// ════════════════════════════════════════════════════════════
function _phxBuildShiftAlarms(shiftStart, userSettings, fallbackReminders) {
  const alarms = [];
  if (userSettings && (userSettings.eveningTime || userSettings.hoursBefore)) {
    // hoursBefore (col G): direct offset
    if (userSettings.hoursBefore) {
      const h = parseInt(userSettings.hoursBefore, 10);
      if (!isNaN(h) && h > 0) alarms.push(h * 60);
    }
    // eveningTime (col F): absolute HH:MM the day before shift
    if (userSettings.eveningTime) {
      const parts = String(userSettings.eveningTime).split(':');
      const hh = parseInt(parts[0], 10);
      const mm = parseInt(parts[1], 10);
      if (!isNaN(hh) && !isNaN(mm)) {
        const eveDate = new Date(shiftStart.getTime());
        eveDate.setDate(eveDate.getDate() - 1);
        eveDate.setHours(hh, mm, 0, 0);
        const off = Math.round((shiftStart.getTime() - eveDate.getTime()) / 60000);
        if (off > 0) alarms.push(off);
      }
    }
    return alarms;
  }
  // Fallback: URL param (default 60,1080)
  return (fallbackReminders || []).slice();
}

function _buildICS(shifts, name, reminders) {
  // ★ Feature 2: load user's col F/G once per ICS build
  const userSettings = (typeof _phxGetUserReminderSettings === 'function')
                       ? _phxGetUserReminderSettings(name)
                       : null;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Siriraj Rx Shift//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + _icsEsc('Siriraj Rx Shift (' + name + ')'),
    'X-WR-TIMEZONE:Asia/Bangkok',
    // ★ Refresh hints — calendar app ควร refresh ทุก 1 ชม.
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    // ★ VTIMEZONE block — Bangkok = UTC+7 no DST
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Bangkok',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0700',
    'TZOFFSETTO:+0700',
    'TZNAME:ICT',
    'END:STANDARD',
    'END:VTIMEZONE'
  ];
  const dtstamp = _icsUTC(new Date());
  shifts.forEach(function(s, idx) {
    const dt = _parseShiftDateTime(s);
    if (!dt) return;  // skip shifts with unparseable date/range
    const uid = 'sirx-' + idx + '-' + String(s.date || '').replace(/[^0-9]/g, '') + '-' +
      String(s.pos || '').replace(/[^a-zA-Z0-9]/g, '_') + '@siriraj-rx-shift';
    const title = (s.pos || '') +
                  (s.shift ? ' ' + String(s.shift) : '') +
                  (s._isGhost && s._ghostLabel ? ' ' + s._ghostLabel : '');
    // ★ ใช้ \n จริง (ไม่ใช่ \\n) — เพื่อให้ _icsEsc แปลงเป็น newline ถูกต้อง
    let desc = 'เภสัชกร: ' + name +
               '\nตำแหน่ง: ' + (s.pos || '') +
               '\nเวลา: ' + (s.range || '') +
               (s.room ? '\nห้อง: ' + s.room : '');
    
    // ★ Smart alarm visibility: เพิ่มเวลาแจ้งเตือนที่จะส่งจริงๆ
    // ★ Feature 2: per-shift alarms (user col F/G > URL fallback)
    const shiftAlarms = _phxBuildShiftAlarms(dt.start, userSettings, reminders);

    if (shiftAlarms.length > 0) {
      desc += '\n\n🔔 แจ้งเตือน:';
      shiftAlarms.forEach(function(min) {
        const trigT = new Date(dt.start.getTime() - min * 60000);
        const adj = _smartReminder(min, trigT);
        const actual = new Date(dt.start.getTime() - adj * 60000);
        desc += '\n• ' + _formatThaiDateTime(actual);
      });
    }
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + uid);
    lines.push('DTSTAMP:' + dtstamp);
    lines.push('DTSTART;TZID=Asia/Bangkok:' + _icsLocal(dt.start));
    lines.push('DTEND;TZID=Asia/Bangkok:' + _icsLocal(dt.end));
    lines.push('SUMMARY:' + _icsEsc(title));
    lines.push('DESCRIPTION:' + _icsEsc(desc));
    lines.push('LOCATION:Siriraj Hospital');
    
    // VALARM blocks (Smart night: shift quiet-hour reminders to 21:30)
    shiftAlarms.forEach(function(min) {
      const triggerTime = new Date(dt.start.getTime() - min * 60000);
      const adjMin = _smartReminder(min, triggerTime);
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push('DESCRIPTION:' + _icsEsc('เตือน: ' + title));
      lines.push('TRIGGER:-PT' + adjMin + 'M');
      lines.push('END:VALARM');
    });
    
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  lines.push('');
  return lines.join('\r\n');
}

function _parseShiftDateTime(s) {
  // date format: "DD/MM (ว.)" — extract DD/MM
  const m = String(s.date || '').match(/^(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);

  // range format: "HH:MM-HH:MM" (may cross midnight)
  const rm = String(s.range || '').match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!rm) return null;

  const start = new Date(s.year, month - 1, day, parseInt(rm[1]), parseInt(rm[2]), 0);
  let end = new Date(s.year, month - 1, day, parseInt(rm[3]), parseInt(rm[4]), 0);
  if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 86400000); // cross-day

  return { start: start, end: end };
}

function _icsEsc(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;')
    .replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function _pad2(n) { return n < 10 ? '0' + n : '' + n; }

function _icsUTC(d) {
  return d.getUTCFullYear() + _pad2(d.getUTCMonth() + 1) + _pad2(d.getUTCDate()) + 'T' +
         _pad2(d.getUTCHours()) + _pad2(d.getUTCMinutes()) + _pad2(d.getUTCSeconds()) + 'Z';
}

function _icsLocal(d) {
  return d.getFullYear() + _pad2(d.getMonth() + 1) + _pad2(d.getDate()) + 'T' +
         _pad2(d.getHours()) + _pad2(d.getMinutes()) + _pad2(d.getSeconds());
}

function _smartReminder(originalMin, triggerTime) {
  const h = triggerTime.getHours();
  if (h >= 22 || h < 6) {
    // In quiet hours → shift to 21:30 (before quiet hours start)
    const target = new Date(triggerTime);
    if (h < 6) target.setDate(target.getDate() - 1);  // previous day if past midnight
    target.setHours(21, 30, 0, 0);
    const diff = Math.round((triggerTime.getTime() - target.getTime()) / 60000);
    return originalMin + diff;
  }
  return originalMin;
}

function _formatThaiDateTime(d) {
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                  'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' +
         _pad2(d.getHours()) + ':' + _pad2(d.getMinutes());
}

// ==========================================
// 📅 Overlay handling for serveICS (v4 — correct schema)
// ==========================================

function _loadOverlaysForName(ss, name) {
  // 🔧 FIX#4 (Path A): อ่าน PHX_Overlays_v2 (ตู้ B — ปัจจุบัน) แทน User_Overlays (ตู้ A — legacy)
  // Schema: actionId | name | monthId | type | payload | createdAt (6 cols)
  // Note: type col 4 มักจะว่าง — ค่า action จริง (give/swap/add) อยู่ใน payload.action
  const sh = ss.getSheetByName('PHX_Overlays_v2');
  if (!sh || sh.getLastRow() < 2) return [];
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
  
  return data
    .filter(function(r) {
      // ต้องมี actionId + parse payload ได้
      if (!r[0]) return false;
      var payload = {};
      try { payload = JSON.parse(r[4] || '{}'); } catch (e) { return false; }
      
      // defensive: skip ถ้า payload mark deleted (ปกติ B3 hard-delete แต่กันเหนียว)
      if (String(payload.status || '').trim() === 'deleted') return false;
      
      // ดีไซน์เดิม: filter "ของใครของมัน" — เฉพาะคนที่ involved (viewer หรือ partner)
      var rowName = String(r[1] || '').trim();
      var partnerName = String(payload.partnerName || '').trim();
      return rowName === name || partnerName === name;
    })
    .map(function(r) {
      var payload = {};
      try { payload = JSON.parse(r[4] || '{}'); } catch (e) {}
      var rowName = String(r[1] || '').trim();
      return {
        actionId: String(r[0] || ''),
        action: String(payload.action || payload.type || r[3] || '').trim(),
        monthId: String(r[2] || payload.monthId || '').trim(),
        shiftKey: String(payload.shiftKey || ''),
        payload: payload,
        viewerName: rowName,
        isViewer: rowName === name,
        partnerName: String(payload.partnerName || '').trim()
      };
    });
}

function _applyOverlays(shifts, overlays, name) {
  const map = {};
  shifts.forEach(function(s) {
    map[_makeShiftKey(s.date, s.pos, name, s.range)] = s;
  });

  // 🆕 PB-3: index overlays by actionId for chained-ghost resolution
  const _byId = {};
  overlays.forEach(function(_ov) { if (_ov.actionId) _byId[_ov.actionId] = _ov; });

  // Resolve "_g_<actionId>" shiftKey → original {date, pos, range}.
  // Walks parent chain (depth-limited to prevent infinite loop on bad data).
  function _resolveGhostKey(shiftKey, depth) {
    if (!shiftKey || shiftKey.indexOf('_g_') !== 0) return null;
    if (depth > 5) return null;
    var parent = _byId[shiftKey.substring(3)];
    if (!parent) return null;
    var psk = String(parent.shiftKey || '');
    if (psk.indexOf('_g_') === 0) return _resolveGhostKey(psk, depth + 1);
    var p = psk.split('|');
    if (p.length < 4) return null;
    return { date: p[0], pos: p[1], range: p[3] };
  }

  overlays.forEach(function(ov) {
    var sk = String(ov.shiftKey || '');
    var skDate, skPos, skRange;
    if (sk.indexOf('_g_') === 0) {
      var resolved = _resolveGhostKey(sk, 0);
      if (!resolved) return;  // unresolvable chain or orphan ref → skip
      skDate = resolved.date; skPos = resolved.pos; skRange = resolved.range;
    } else {
      var parts = sk.split('|');
      if (parts.length < 4) return;
      skDate = parts[0]; skPos = parts[1]; skRange = parts[3];
    }
    const ym = _parseMonthIdToYM(ov.monthId);

    if (ov.action === 'give' && ov.isViewer) {
      // User gave away → remove
      delete map[_makeShiftKey(skDate, skPos, name, skRange)];
    }
    else if (ov.action === 'give' && !ov.isViewer && ov.partnerName === name) {
      // User received a give → add ghost
      map[_makeShiftKey(skDate, skPos, name, skRange)] =
        _makeGhost(skDate, skPos, skRange, 'จาก ' + ov.viewerName + ')', ym);
    }
    else if (ov.action === 'swap' && ov.isViewer) {
      // User's swap: remove own, add partner's
      delete map[_makeShiftKey(skDate, skPos, name, skRange)];
      const psk = String(ov.payload.partnerShiftKey || '').split('|');
      if (psk.length >= 4) {
        map[_makeShiftKey(psk[0], psk[1], name, psk[3])] =
          _makeGhost(psk[0], psk[1], psk[3], '(แลกกับ ' + ov.partnerName + ')', ym);
      }
    }
    else if (ov.action === 'swap' && !ov.isViewer && ov.partnerName === name) {
      // User is partner in someone's swap
      const psk = String(ov.payload.partnerShiftKey || '').split('|');
      if (psk.length >= 4) {
        delete map[_makeShiftKey(psk[0], psk[1], name, psk[3])];
      }
      map[_makeShiftKey(skDate, skPos, name, skRange)] =
        _makeGhost(skDate, skPos, skRange, '(แลกกับ ' + ov.viewerName + ')', ym);
    }
    else if (ov.action === 'add' && ov.isViewer) {
      // User added a shift to themselves (received from partner)
      map[_makeShiftKey(skDate, skPos, name, skRange)] =
        _makeGhost(skDate, skPos, skRange, '(จาก ' + ov.partnerName + ')', ym);
    }
    // Note: 'add' where !isViewer doesn't affect this user — original owner keeps shift
  });

  const out = [];
  for (const k in map) {
    if (Object.prototype.hasOwnProperty.call(map, k)) out.push(map[k]);
  }
  return out;
}

function _makeShiftKey(date, pos, name, range) {
  return [date || '', pos || '', name || '', range || ''].join('|');
}

function _makeGhost(date, pos, range, label, ym) {
  return {
    date: date, pos: pos, range: range,
    shift: _guessShiftFromTime(range),  // ← derive รอบ จาก range
    _ghostLabel: label,                  // ← เก็บ action description แยก
    room: '', year: ym.year, month: ym.month, _isGhost: true
  };
}

// ★ ใหม่: helper เดาชื่อรอบจากเวลา (สำเนามาจาก guessShiftFromTime_ ใน Code.gs)
function _guessShiftFromTime(timeStr) {
  if (!timeStr) return '';
  const t = String(timeStr).replace(/:/g, '.');
  if (t.indexOf('8.30') >= 0 && t.indexOf('16.30') >= 0) return 'รอบกลางวัน';
  if (t.indexOf('16.30') >= 0 && t.indexOf('20.30') >= 0) return 'รอบ 1';
  if (t.indexOf('16.30') >= 0) return 'รอบ 1';
  if (t.indexOf('21.30') >= 0) return 'รอบ 2';
  if (t.indexOf('0.30') >= 0 || t.indexOf('2.30') >= 0) return 'รอบ 3';
  return '';
}

function _parseMonthIdToYM(monthId) {
  // Format: "m_<thai_month>_<year_BE>"
  if (!monthId) return { year: new Date().getFullYear(), month: 1 };
  const m = String(monthId).match(/^m_(.+?)_(\d{4})$/);
  if (!m) return { year: new Date().getFullYear(), month: 1 };
  const monthIdx = THAI_MONTHS_ICS.indexOf(m[1]);
  if (monthIdx < 0) return { year: new Date().getFullYear(), month: 1 };
  const yearBE = parseInt(m[2], 10);
  return { year: yearBE - 543, month: monthIdx + 1 };
}

function _parseMonthsParam(param) {
  // Format: "YYYY-MM,YYYY-MM,..." (e.g. "2026-06,2026-07")
  // Empty = default to current + 5 ahead (stable subscribe behavior)
  if (!param) {
    const now = new Date();
    const ym = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      ym.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }
    return ym;
  }
  return param.split(',').map(function(s) {
    const m = String(s).trim().match(/^(\d{4})-(\d{1,2})$/);
    if (!m) return null;
    return { year: parseInt(m[1], 10), month: parseInt(m[2], 10) };
  }).filter(function(x) { return x !== null; });
}

function debugSmartReminders(shiftDateStr, reminderMins) {
  // Usage: debugSmartReminders('2026-06-04 02:30', [60, 1080])
  const shift = new Date(shiftDateStr);
  Logger.log('Shift starts at: ' + shift.toLocaleString('th-TH'));
  (reminderMins || [60, 1080]).forEach(function(min) {
    const naive = new Date(shift.getTime() - min * 60000);
    const adj = _smartReminder(min, naive);
    const actual = new Date(shift.getTime() - adj * 60000);
    const adjusted = (adj !== min);
    Logger.log(
      '  ' + min + ' min before → naive: ' + naive.toLocaleString('th-TH') +
      (adjusted ? ' → ⚠️ adjusted to: ' + actual.toLocaleString('th-TH') + ' (' + adj + ' min)' : ' ✓ (no adjust)')
    );
  });
}

function runValidate() {
  // ★ เปลี่ยนชื่อตรงนี้ก่อนรัน
  validateUserICS('ณรพล');
}

function validateUserICS(name) {
  const ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
  
  // 1. นับจาก backend (เหมือน serveICS ทำ)
  const monthsParam = '';  // default = current + 5
  const targetYM = _parseMonthsParam(monthsParam);
  const idx = ss.getSheetByName(SCHEDULE_INDEX_TAB);
  const data = idx.getRange(2, 1, idx.getLastRow() - 1, 9).getValues();
  const tabs = [];
  data.forEach(function(r) {
    if (r[8] !== 'active' || !r[2]) return;
    const info = _parseThaiMonthLabel(String(r[1] || ''));
    if (!info) return;
    if (targetYM.some(function(t) { return t.year === info.year && t.month === info.month; })) {
      tabs.push({ tab: r[2], year: info.year, month: info.month });
    }
  });
  const shifts = [];
  tabs.forEach(function(tr) {
    const sh = ss.getSheetByName(tr.tab);
    if (!sh) return;
    const rows = sh.getDataRange().getValues();
    const h = rows[0].map(function(x) { return String(x).toLowerCase(); });
    const iName = h.indexOf('name'), iDate = h.indexOf('date'), iPos = h.indexOf('pos'),
          iShift = h.indexOf('shift'), iRange = h.indexOf('range'), iRoom = h.indexOf('room');
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][iName]).trim() !== name) continue;
      shifts.push({
        date: rows[i][iDate], pos: iPos >= 0 ? rows[i][iPos] : '',
        shift: iShift >= 0 ? rows[i][iShift] : '',
        range: iRange >= 0 ? rows[i][iRange] : '',
        room: iRoom >= 0 ? rows[i][iRoom] : '',
        year: tr.year, month: tr.month
      });
    }
  });
  
  // 2. Apply overlays
  const overlays = _loadOverlaysForName(ss, name);
  const effective = _applyOverlays(shifts, overlays, name);
  
  // 3. นับ events จริงๆ ที่ ICS จะมี (skip events ที่ parse date ไม่ได้)
  let validForICS = 0;
  effective.forEach(function(s) {
    if (_parseShiftDateTime(s)) validForICS++;
  });
  
  Logger.log('=== Validate: ' + name + ' ===');
  Logger.log('  Raw shifts: ' + shifts.length);
  Logger.log('  Overlays: ' + overlays.length);
  Logger.log('  Effective: ' + effective.length);
  Logger.log('  Valid for ICS: ' + validForICS);
  Logger.log('  Skipped (unparseable date/time): ' + (effective.length - validForICS));
  
  if (effective.length !== validForICS) {
    Logger.log('⚠️ WARNING: บาง events ไม่เข้า ICS เพราะ date/range parse ไม่ได้');
    effective.forEach(function(s) {
      if (!_parseShiftDateTime(s)) {
        Logger.log('  Skipped: ' + JSON.stringify(s));
      }
    });
  }
  
  return { raw: shifts.length, overlays: overlays.length, effective: effective.length, icsValid: validForICS };
}

function dailyOverlayAudit_() {
  const ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
  const userOvSheet = ss.getSheetByName('User_Overlays');
  if (!userOvSheet) return;
  
  const data = userOvSheet.getRange(2, 1, userOvSheet.getLastRow() - 1, 9).getValues();
  const activeUsers = new Set();
  data.forEach(function(r) {
    if (r[8] !== 'deleted') activeUsers.add(r[7]);  // viewer_name
  });
  
  const issues = [];
  activeUsers.forEach(function(name) {
    const result = validateUserICS(name);
    if (result.effective !== result.icsValid) {
      issues.push({ name: name, ...result });
    }
  });
  
  if (issues.length > 0) {
    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: '⚠️ Overlay Audit: ' + issues.length + ' mismatch',
      body: JSON.stringify(issues, null, 2)
    });
  }
}

/**
 * ROUND 3 BACKEND HELPERS — Phase Y v2.9
 *
 * วัตถุประสงค์: ทำให้ ICS export ตรงกับสิ่งที่แสดงในแอป
 * เมื่อ user เปิด Round 3 mode "วันถัดไป" (frontend จะใส่ &round3=next ใน URL)
 *
 * วิธี integrate:
 * 1. Paste ฟังก์ชันทั้งหมดในไฟล์นี้ ต่อท้าย Code.gs ของคุณ
 * 2. ใน doGet(e) — case 'ics' ของคุณ ก่อนสร้าง ICS body
 *    เพิ่ม 2 บรรทัด:
 *
 *      var _round3Mode = e.parameter.round3 || 'start';
 *      items = phxApplyRound3ToItems(items, _round3Mode);
 *
 *    เทียบกับโค้ดเดิมประมาณนี้:
 *
 *      case 'ics':
 *        var name = e.parameter.name || '';
 *        var items = getShiftsByName(name);   // ← whatever your fetching call is
 *        // ↓↓↓ INSERT 2 LINES HERE ↓↓↓
 *        var _round3Mode = e.parameter.round3 || 'start';
 *        items = phxApplyRound3ToItems(items, _round3Mode);
 *        // ↑↑↑ INSERT 2 LINES ABOVE ↑↑↑
 *        var icsBody = buildICSBody(items);   // ← whatever your ICS builder is
 *        return ContentService.createTextOutput(icsBody)...
 */

/**
 * Apply Round 3 date shift to an array of shift items
 * @param {Array} items - shift items with .shift, .date, .range
 * @param {string} mode - 'next' to shift Round 3 dates +1 day, otherwise no-op
 * @return {Array} new array (shallow-copied items, original untouched)
 */
function phxApplyRound3ToItems(items, mode) {
  if (!items || !Array.isArray(items)) return items;
  if (mode !== 'next') return items;
 
  return items.map(function(item) {
    if (!_phxIsRound3Shift(item)) return item;
    var copy = {};
    for (var k in item) { if (item.hasOwnProperty(k)) copy[k] = item[k]; }
    copy._origDate = item.date;
    var oldDate = String(item.date || '');
    copy.date = _phxShiftThaiDate(oldDate, 1);
 
    // 🌟 v3: Year/month rollover for ICS context
    // เมื่อ shift ข้ามปี (Dec 31 → Jan 1) — ต้องเพิ่ม .year เพื่อให้
    // _parseShiftDateTime สร้าง Date object ที่ปีถูกต้อง
    var oldM = oldDate.match(/^(\d{1,2})\/(\d{1,2})/);
    var newM = String(copy.date).match(/^(\d{1,2})\/(\d{1,2})/);
    if (oldM && newM) {
      var oldMonth = parseInt(oldM[2], 10);
      var newMonth = parseInt(newM[2], 10);
      if (oldMonth === 12 && newMonth === 1) {
        if (typeof copy.year === 'number') copy.year = copy.year + 1;
      }
      if (typeof copy.month === 'number') copy.month = newMonth;
    }
 
    return copy;
  });
}

/**
 * Detect Round 3 shift by label "รอบ 3" or "รอบ3" in shift.shift
 */
function _phxIsRound3Shift(item) {
  try {
    if (!item || !item.shift) return false;
    var sh = String(item.shift).toLowerCase();
    return sh.indexOf('รอบ 3') >= 0 || sh.indexOf('รอบ3') >= 0;
  } catch(e) { return false; }
}

/**
 * Shift a Thai date string by N days, preserving format
 * Handles:
 *   "01/06 (จ.)"        → D/M (DOW.) — actual data format (no year)
 *   "15/3/2569 (จ.)"    → D/M/YYYY (BE year + DOW) — legacy
 *   "2026-03-15"        → ISO YYYY-MM-DD — legacy
 *
 * DOW computed via index math (year-independent) to avoid leap year issues.
 * Same logic as frontend _shiftThaiDate in Index.html.
 */
function _phxShiftThaiDate(dateStr, days) {
  try {
    if (!dateStr) return dateStr;
    var s = String(dateStr).trim();
    var DOW_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
    var DOW_LONG  = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

    var m, dStr, mStr, day, month, yearBE = null, dowStr = null;
    var hasYear = false;

    // Pattern A: D/M/YYYY [(DOW)]
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*\(([^)]+)\))?\s*$/);
    if (m) {
      dStr = m[1]; mStr = m[2];
      day = +m[1]; month = +m[2]; yearBE = +m[3]; dowStr = m[4] || null;
      hasYear = true;
    } else {
      // Pattern B: D/M [(DOW)]
      m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\s*\(([^)]+)\))?\s*$/);
      if (m) {
        dStr = m[1]; mStr = m[2];
        day = +m[1]; month = +m[2]; dowStr = m[3] || null;
      } else {
        // Pattern C: ISO YYYY-MM-DD
        var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) {
          var d0 = new Date(+iso[1], +iso[2] - 1, +iso[3]);
          d0.setDate(d0.getDate() + days);
          return d0.getFullYear() + '-' +
                 (d0.getMonth() + 1 < 10 ? '0' : '') + (d0.getMonth() + 1) + '-' +
                 (d0.getDate() < 10 ? '0' : '') + d0.getDate();
        }
        return dateStr;
      }
    }

    var yearCE = yearBE ? (yearBE > 2400 ? yearBE - 543 : yearBE) : 2024;
    var d = new Date(yearCE, month - 1, day);
    d.setDate(d.getDate() + days);

    var padD = dStr.length === 2 ? 2 : 1;
    var padM = mStr.length === 2 ? 2 : 1;
    var newDay = String(d.getDate());
    while (newDay.length < padD) newDay = '0' + newDay;
    var newMonth = String(d.getMonth() + 1);
    while (newMonth.length < padM) newMonth = '0' + newMonth;

    var result = newDay + '/' + newMonth;
    if (hasYear) result += '/' + (d.getFullYear() + 543);

    if (dowStr) {
      var trimmed = String(dowStr).trim();
      var hasDot = trimmed.charAt(trimmed.length - 1) === '.';
      var clean = hasDot ? trimmed.substring(0, trimmed.length - 1) : trimmed;
      var origIdx = DOW_SHORT.indexOf(clean);
      var useLong = false;
      if (origIdx < 0) {
        origIdx = DOW_LONG.indexOf(clean);
        if (origIdx >= 0) useLong = true;
      }
      if (origIdx >= 0) {
        var newIdx = ((origIdx + days) % 7 + 7) % 7;
        result += ' (' + (useLong ? DOW_LONG : DOW_SHORT)[newIdx] + (hasDot ? '.' : '') + ')';
      } else {
        result += ' (' + DOW_SHORT[d.getDay()] + (hasDot ? '.' : '') + ')';
      }
    }

    return result;
  } catch(e) {
    Logger.log('[Round3] _phxShiftThaiDate error: ' + e + ' for "' + dateStr + '"');
    return dateStr;
  }
}

/**
 * Test function — run this manually to verify helpers work
 */
function testPhxRound3() {
  var tests = [
    { item: { shift: 'รอบ 3 2:30-8:30', date: '05/06 (ศ.)', range: '2:30-8:30' }, expected: '06/06 (ส.)' },
    { item: { shift: 'รอบ 2 21:30-2:30', date: '04/06 (พฤ.)', range: '21:30-2:30' }, expected: '04/06 (พฤ.)' },
    { item: { shift: 'รอบ 1 16:30-21:30', date: '29/06 (จ.)', range: '16:30-21:30' }, expected: '29/06 (จ.)' },
    { item: { shift: 'รอบ 3 2:30-8:30', date: '30/06 (อ.)', range: '2:30-8:30' }, expected: '01/07 (พ.)' }
  ];
  var pass = 0, fail = 0;
  tests.forEach(function(t) {
    var result = phxApplyRound3ToItems([t.item], 'next')[0];
    var ok = result.date === t.expected;
    if (ok) pass++; else fail++;
    Logger.log((ok ? '✅ PASS' : '❌ FAIL') + ': ' + t.item.shift + ' "' + t.item.date + '" → "' + result.date + '"' +
               (ok ? '' : ' (expected "' + t.expected + '")'));
  });
  Logger.log('=== ' + pass + '/' + (pass+fail) + ' passed ===');
}

// ═══════════════════════════════════════════════════════════════════
// PHASE Z — Stage A: Sheet Setup + Email Queue
// 
// Paste โค้ดนี้ "ท้ายไฟล์ Code.gs" ของ Gmail script
// 
// หลัง paste:
//   1. Run phxSetupAllSheets()      → สร้าง sheets ทั้งหมด (auto-hide)
//   2. Run phxBootstrapMaster()      → copy รายชื่อจาก People sheet → Master
//   3. ใส่ email ใน PHX_Pharmacists_Master tab ด้วยมือ
//   4. Run phxTestQueue()           → ทดสอบ queue email
// ═══════════════════════════════════════════════════════════════════

// ─── Config ─────────────────────────────────────────
const PZ_SS_ID = '1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM';
const PZ_PEOPLE_SS_ID = '1bxlaH1JAQ3RZtJsBVEqdMn4-dIjxX236wNOsTRRmijc';

const PZ_TAB_MASTER = 'PHX_Pharmacists_Master';
const PZ_TAB_PHARMACISTS = 'PHX_Pharmacists';
const PZ_TAB_EMAIL_QUEUE = 'PHX_EmailQueue';
const PZ_TAB_PENDING_VERIFY = 'PHX_PendingVerifications';
const PZ_TAB_PENDING_RESET = 'PHX_PendingResets';
const PZ_TAB_OVERLAYS_V2 = 'PHX_Overlays_v2';


// ═══════════════════════════════════════════════════════════════════
// 1. Setup all sheets (run once)
// ═══════════════════════════════════════════════════════════════════
function phxSetupAllSheets() {
  const ss = SpreadsheetApp.openById(PZ_SS_ID);
  const created = [];

  const schemas = {
    [PZ_TAB_MASTER]: ['name', 'approvedEmail', 'active', 'notes'],
    [PZ_TAB_PHARMACISTS]: ['name', 'passwordHash', 'createdAt', 'lastSeen'],
    [PZ_TAB_EMAIL_QUEUE]: ['id', 'to', 'subject', 'body', 'status', 'queuedAt', 'sentAt', 'error'],
    [PZ_TAB_PENDING_VERIFY]: ['token', 'name', 'passwordHash', 'approvedEmail', 'expiresAt', 'createdAt'],
    [PZ_TAB_PENDING_RESET]: ['token', 'name', 'approvedEmail', 'expiresAt', 'createdAt'],
    [PZ_TAB_OVERLAYS_V2]: ['actionId', 'name', 'monthId', 'type', 'payload', 'createdAt']
  };

  Object.keys(schemas).forEach(function(tabName) {
    let sh = ss.getSheetByName(tabName);
    if (!sh) {
      sh = ss.insertSheet(tabName);
      sh.appendRow(schemas[tabName]);
      sh.setFrozenRows(1);
      // Hide all except Master (admin needs to edit Master)
      if (tabName !== PZ_TAB_MASTER) sh.hideSheet();
      created.push(tabName);
    }
  });

  console.log('Sheets created: ' + (created.length === 0 ? 'none (all existed)' : created.join(', ')));
  console.log('Master sheet is VISIBLE — Admin can edit emails here');
  console.log('Other sheets are HIDDEN — managed by script');
  return { ok: true, created: created };
}


// ═══════════════════════════════════════════════════════════════════
// 2. Bootstrap Master from People sheet (run once after setup)
// ═══════════════════════════════════════════════════════════════════
function phxBootstrapMaster() {
  const peopleSS = SpreadsheetApp.openById(PZ_PEOPLE_SS_ID);
  const peopleSh = peopleSS.getSheetByName('People');
  if (!peopleSh) {
    return { ok: false, error: 'People sheet not found in Master Data' };
  }

  const lastRow = peopleSh.getLastRow();
  if (lastRow < 2) return { ok: true, message: 'no rows in People sheet', added: 0 };

  // Read all data — try to find Email column too
  const headers = peopleSh.getRange(1, 1, 1, peopleSh.getLastColumn()).getValues()[0]
                          .map(function(h) { return String(h || '').toLowerCase().trim(); });
  const emailColIdx = headers.findIndex(function(h) { return h === 'email' || h === 'อีเมล' || h === 'e-mail'; });
  
  const peopleData = peopleSh.getRange(2, 1, lastRow - 1, Math.max(1, emailColIdx + 1)).getValues();
  const names = [];
  peopleData.forEach(function(row) {
    const name = String(row[0] || '').trim();
    if (!name) return;
    const email = emailColIdx >= 0 ? String(row[emailColIdx] || '').trim() : '';
    names.push({ name: name, email: email });
  });

  // Read existing Master to avoid duplicates
  const masterSS = SpreadsheetApp.openById(PZ_SS_ID);
  const masterSh = masterSS.getSheetByName(PZ_TAB_MASTER);
  if (!masterSh) return { ok: false, error: 'Run phxSetupAllSheets() first' };

  const existingNames = {};
  if (masterSh.getLastRow() >= 2) {
    masterSh.getRange(2, 1, masterSh.getLastRow() - 1, 1).getValues().forEach(function(r) {
      if (r[0]) existingNames[String(r[0]).trim()] = true;
    });
  }

  const toAdd = names.filter(function(n) { return !existingNames[n.name]; });
  if (toAdd.length === 0) {
    return { ok: true, message: 'all names already in Master', added: 0 };
  }

  const rows = toAdd.map(function(n) { return [n.name, n.email, n.email ? 'true' : 'false', '']; });
  masterSh.getRange(masterSh.getLastRow() + 1, 1, rows.length, 4).setValues(rows);

  console.log('Added ' + rows.length + ' names to Master');
  if (emailColIdx < 0) {
    console.log('⚠️ People sheet has no email column — admin must fill emails manually in Master');
  } else {
    const withEmail = toAdd.filter(function(n) { return n.email; }).length;
    console.log('  - With email: ' + withEmail);
    console.log('  - Need email: ' + (rows.length - withEmail));
  }
  return { ok: true, added: rows.length };
}


// ═══════════════════════════════════════════════════════════════════
// 3. Queue email (used by registration/reset flows later)
// ═══════════════════════════════════════════════════════════════════
function phxQueueEmail(to, subject, body) {
  if (!to || !subject || !body) {
    return { ok: false, error: 'missing params' };
  }
  try {
    const ss = SpreadsheetApp.openById(PZ_SS_ID);
    const sh = ss.getSheetByName(PZ_TAB_EMAIL_QUEUE);
    if (!sh) return { ok: false, error: 'Queue sheet not found — run phxSetupAllSheets() first' };

    const id = 'em_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    sh.appendRow([id, to, subject, body, 'pending', new Date().toISOString(), '', '']);
    return { ok: true, id: id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


// ═══════════════════════════════════════════════════════════════════
// 4. Test queue (run from editor — queues a test email to admin)
// ═══════════════════════════════════════════════════════════════════
function phxTestQueue() {
  const adminEmail = Session.getActiveUser().getEmail();
  const res = phxQueueEmail(
    adminEmail,
    '[TEST] Siriraj Rx Shift — Email Queue Working',
    'This is a test email queued by Gmail script.\n\n' +
    'If you receive this — the @mahidol sender script picked it up and sent it.\n\n' +
    'Timestamp: ' + new Date().toString() + '\n' +
    'Queued by: ' + adminEmail
  );
  console.log('Queue result: ' + JSON.stringify(res));
  console.log('Now wait 5 minutes for @mahidol script to send it (or run manualProcessQueue from @mahidol side)');
  return res;
}


// ═══════════════════════════════════════════════════════════════════
// 5. Status helpers
// ═══════════════════════════════════════════════════════════════════
function phxShowQueueStatus() {
  const ss = SpreadsheetApp.openById(PZ_SS_ID);
  const sh = ss.getSheetByName(PZ_TAB_EMAIL_QUEUE);
  if (!sh || sh.getLastRow() < 2) {
    console.log('Queue empty');
    return;
  }
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
  const counts = { pending: 0, sent: 0, error: 0, other: 0 };
  data.forEach(function(row) {
    const status = String(row[4] || 'other');
    if (counts[status] !== undefined) counts[status]++;
    else counts.other++;
  });
  console.log('Queue: pending=' + counts.pending + ' sent=' + counts.sent + ' error=' + counts.error);

  // Show last 5 rows
  const last5 = data.slice(-5);
  last5.forEach(function(row) {
    console.log('  [' + row[4] + '] ' + row[1] + ' — ' + row[2] + ' (' + row[5] + ')');
  });
}

function phxClearTestQueueRows() {
  // Removes rows where subject starts with '[TEST]' — for cleanup after testing
  const ss = SpreadsheetApp.openById(PZ_SS_ID);
  const sh = ss.getSheetByName(PZ_TAB_EMAIL_QUEUE);
  if (!sh || sh.getLastRow() < 2) return;
  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  let removed = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    if (String(data[i][2]).startsWith('[TEST]')) {
      sh.deleteRow(i + 2);
      removed++;
    }
  }
  console.log('Removed ' + removed + ' test rows');
}

/**
 * ========================================================
 * 🔍 ICS AUDIT — Layer 2: Integration verification
 * ========================================================
 *
 * วัตถุประสงค์: พิสูจน์ว่า ICS ที่ export ออกมา = ข้อมูลจริงในระบบ 100%
 * ทั้ง 2 modes (start = วันเริ่ม, next = วันถัดไป)
 *
 * Property checks:
 *   ✅ เวรรอบ 3 ใน next mode → date = original +1 วันตรงเป๊ะ
 *   ✅ เวรไม่ใช่รอบ 3 → ไม่เลื่อน (date เท่าเดิมทั้ง start และ next)
 *   ✅ DOW (จ./อ./พ./...) ใน date string ตรงกับ day-of-week จริงเสมอ
 *   ✅ Year/month rollover ถูก (30/06→01/07 เดือนเพิ่ม, 31/12→01/01 ปีเพิ่ม)
 *   ✅ ทุก shift parse เป็น DTSTART/DTEND ได้ (จะ appear ใน ICS)
 *
 * วิธี apply:
 *   1. Paste ทั้งไฟล์ต่อท้าย Code.gs
 *   2. Save
 *   3. รัน `phxAuditUserICS('ณรพล')` — single user
 *   4. รัน `phxAuditAllUsers()` — ทุกคน (ใช้เวลา ~30s)
 *
 * Output ที่ Logger:
 *   ═══ ICS AUDIT for ณรพล ═══
 *   Verdict: ✅ PASS
 *   ... รายละเอียดทุก shift ...
 *
 * ถ้าเจอ ❌ FAIL → ดูในรายงานว่าตัวไหนผิด + อะไรผิด → ส่งให้ผม
 */


// ════════════════════════════════════════════════════════
// 🔍 [1] phxAuditUserICS(name, silent)
//      Single-user comprehensive audit
// ════════════════════════════════════════════════════════
function phxAuditUserICS(name, silent) {
  if (!name) return { error: 'name required' };

  const ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);

  // Replicate serveICS data flow (6 months target)
  const now = new Date();
  const targetYM = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    targetYM.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const idx = ss.getSheetByName(SCHEDULE_INDEX_TAB);
  if (!idx || idx.getLastRow() < 2) {
    return { name: name, verdict: '⚠️ NO DATA', error: 'No Schedule_Index data' };
  }

  const indexData = idx.getRange(2, 1, idx.getLastRow() - 1, 9).getValues();
  const tabs = [];
  indexData.forEach(function(r) {
    if (r[8] !== 'active' || !r[2]) return;
    const info = _parseThaiMonthLabel(String(r[1] || ''));
    if (!info) return;
    if (targetYM.some(function(t) { return t.year === info.year && t.month === info.month; })) {
      tabs.push({ tab: r[2], year: info.year, month: info.month, label: r[1] });
    }
  });

  // Collect raw shifts for this user
  const rawShifts = [];
  tabs.forEach(function(tr) {
    const sh = ss.getSheetByName(tr.tab);
    if (!sh || sh.getLastRow() < 2) return;
    const rows = sh.getDataRange().getValues();
    const h = rows[0].map(function(x) { return String(x).toLowerCase(); });
    const iName = h.indexOf('name'), iDate = h.indexOf('date'),
          iPos = h.indexOf('pos'), iShift = h.indexOf('shift'),
          iRange = h.indexOf('range'), iRoom = h.indexOf('room');
    if (iName < 0 || iDate < 0) return;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][iName]).trim() !== name) continue;
      rawShifts.push({
        date: rows[i][iDate], pos: iPos >= 0 ? rows[i][iPos] : '',
        shift: iShift >= 0 ? rows[i][iShift] : '',
        range: iRange >= 0 ? rows[i][iRange] : '',
        room: iRoom >= 0 ? rows[i][iRoom] : '',
        year: tr.year, month: tr.month
      });
    }
  });

  // Apply overlays
  const overlays = _loadOverlaysForName(ss, name);
  const effective = _applyOverlays(rawShifts, overlays, name);

  // Apply Round 3 transformation for both modes
  // start mode: phxApplyRound3ToItems is no-op (returns input)
  // next mode: shifts Round 3 items by +1 day, copies non-R3 items unchanged
  const nextMode = phxApplyRound3ToItems(effective.slice(), 'next');

  // Run property checks
  const checks = {
    round3: [],
    nonRound3: [],
    unparseable_start: [],
    unparseable_next: [],
    mismatches: []
  };

  effective.forEach(function(origItem, i) {
    const nextItem = nextMode[i];
    const isR3 = _phxIsRound3Shift(origItem);

    if (isR3) {
      // Round 3: expect nextItem.date = shifted date
      const expectedNextDate = _phxShiftThaiDate(origItem.date, 1);
      const dateOk = nextItem.date === expectedNextDate;

      // Year/month rollover check
      const startMatch = String(origItem.date).match(/^(\d{1,2})\/(\d{1,2})/);
      const nextMatch = String(nextItem.date).match(/^(\d{1,2})\/(\d{1,2})/);
      const startMonth = startMatch ? parseInt(startMatch[2], 10) : null;
      const nextMonth = nextMatch ? parseInt(nextMatch[2], 10) : null;
      const expectsYearRollover = startMonth === 12 && nextMonth === 1;
      const expectedNextYear = expectsYearRollover ? origItem.year + 1 : origItem.year;
      const expectedNextMonth = nextMonth || origItem.month;
      const yearOk = nextItem.year === expectedNextYear;
      const monthOk = nextItem.month === expectedNextMonth;

      // DOW match check (DOW in date string must match actual day-of-week)
      const dowCheck = _phxVerifyDOWInString(nextItem.date, expectedNextYear, expectedNextMonth);

      const allOk = dateOk && yearOk && monthOk && dowCheck.ok;

      const entry = {
        pos: origItem.pos,
        shift: origItem.shift,
        startDate: origItem.date,
        nextDate: nextItem.date,
        expectedNextDate: expectedNextDate,
        nextYear: nextItem.year,
        nextMonth: nextItem.month,
        dateOk: dateOk,
        yearOk: yearOk,
        monthOk: monthOk,
        dowOk: dowCheck.ok,
        dowDetail: dowCheck.ok ? '' : ('expected "' + dowCheck.expected + '" got "' + dowCheck.actual + '"'),
        ok: allOk,
        isGhost: !!origItem._isGhost
      };
      checks.round3.push(entry);

      if (!allOk) {
        const issues = [];
        if (!dateOk) issues.push('date mismatch');
        if (!yearOk) issues.push('year mismatch');
        if (!monthOk) issues.push('month mismatch');
        if (!dowCheck.ok) issues.push('dow mismatch');
        checks.mismatches.push({
          type: 'round3',
          pos: origItem.pos,
          startDate: origItem.date,
          nextDate: nextItem.date,
          issues: issues.join(', ')
        });
      }
    } else {
      // Non-Round-3: should NOT shift
      const dateUnchanged = nextItem.date === origItem.date;
      const yearUnchanged = nextItem.year === origItem.year;
      const monthUnchanged = nextItem.month === origItem.month;
      const ok = dateUnchanged && yearUnchanged && monthUnchanged;

      checks.nonRound3.push({
        pos: origItem.pos,
        shift: origItem.shift,
        startDate: origItem.date,
        nextDate: nextItem.date,
        ok: ok,
        isGhost: !!origItem._isGhost
      });

      if (!ok) {
        checks.mismatches.push({
          type: 'non-round3 shifted unexpectedly',
          pos: origItem.pos,
          startDate: origItem.date,
          nextDate: nextItem.date
        });
      }
    }

    // Parseability check
    if (!_parseShiftDateTime(origItem)) {
      checks.unparseable_start.push({
        pos: origItem.pos, date: origItem.date, range: origItem.range
      });
    }
    if (!_parseShiftDateTime(nextItem)) {
      checks.unparseable_next.push({
        pos: nextItem.pos, date: nextItem.date, range: nextItem.range
      });
    }
  });

  // Build report
  const totalMismatches = checks.mismatches.length +
                          checks.unparseable_start.length +
                          checks.unparseable_next.length;

  const report = {
    name: name,
    timestamp: new Date().toISOString(),
    months_audited: tabs.map(function(t) { return t.label; }),
    counts: {
      raw_shifts: rawShifts.length,
      overlays: overlays.length,
      effective: effective.length,
      round3: checks.round3.length,
      non_round3: checks.nonRound3.length,
      unparseable_start: checks.unparseable_start.length,
      unparseable_next: checks.unparseable_next.length,
      mismatches: checks.mismatches.length
    },
    verdict: totalMismatches === 0 ? '✅ PASS' : '❌ FAIL',
    details: checks
  };

  if (!silent) _phxLogAuditReport(report);
  return report;
}


// ════════════════════════════════════════════════════════
// 🔍 [2] phxAuditAllUsers()
//      Audit ทุกคนที่มีในระบบ (current + 5 ahead months)
// ════════════════════════════════════════════════════════
function phxAuditAllUsers() {
  const ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);

  // Collect unique names from all active schedule tabs
  const userNames = new Set();
  const idx = ss.getSheetByName(SCHEDULE_INDEX_TAB);
  if (!idx || idx.getLastRow() < 2) {
    Logger.log('❌ No Schedule_Index data');
    return { pass: 0, fail: 0, results: [] };
  }

  const now = new Date();
  const targetYM = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    targetYM.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const indexData = idx.getRange(2, 1, idx.getLastRow() - 1, 9).getValues();
  indexData.forEach(function(r) {
    if (r[8] !== 'active' || !r[2]) return;
    const info = _parseThaiMonthLabel(String(r[1] || ''));
    if (!info) return;
    if (!targetYM.some(function(t) { return t.year === info.year && t.month === info.month; })) return;

    const sh = ss.getSheetByName(r[2]);
    if (!sh || sh.getLastRow() < 2) return;
    const rows = sh.getDataRange().getValues();
    const h = rows[0].map(function(x) { return String(x).toLowerCase(); });
    const iName = h.indexOf('name');
    if (iName < 0) return;
    for (let j = 1; j < rows.length; j++) {
      const n = String(rows[j][iName]).trim();
      if (n) userNames.add(n);
    }
  });

  Logger.log('═══ AUDIT ALL USERS ═══');
  Logger.log('Found ' + userNames.size + ' unique users — auditing...');
  Logger.log('');

  const results = [];
  let passCount = 0, failCount = 0;
  const startTime = Date.now();

  Array.from(userNames).sort().forEach(function(name) {
    try {
      const report = phxAuditUserICS(name, true); // silent mode
      const passed = report.verdict.indexOf('✅') >= 0;
      if (passed) passCount++; else failCount++;
      results.push({
        name: name,
        verdict: report.verdict,
        counts: report.counts,
        mismatches: report.details ? report.details.mismatches : []
      });
    } catch(e) {
      failCount++;
      results.push({
        name: name,
        verdict: '❌ ERROR',
        error: e.message
      });
    }
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  Logger.log('═══ SUMMARY ═══');
  Logger.log('Duration:   ' + duration + 's');
  Logger.log('Total:      ' + (passCount + failCount) + ' users');
  Logger.log('✅ Pass:    ' + passCount);
  Logger.log('❌ Fail:    ' + failCount);
  Logger.log('');

  if (failCount > 0) {
    Logger.log('--- Failed users ---');
    results.forEach(function(r) {
      if (r.verdict.indexOf('❌') >= 0) {
        Logger.log('  ' + r.verdict + '  ' + r.name +
                   (r.error ? ' [' + r.error + ']' :
                    r.counts ? ' (R3=' + r.counts.round3 +
                      ', mismatches=' + r.counts.mismatches + ')' : ''));
      }
    });
  } else {
    Logger.log('🎉 All users PASS — ICS export verified correct!');
  }

  // Email admin
  try {
    const subject = (failCount === 0 ? '✅' : '⚠️') +
                    ' Phx ICS Audit: ' + passCount + ' pass / ' + failCount + ' fail';
    let body = 'Audit completed: ' + new Date().toLocaleString('th-TH') + '\n' +
               'Duration: ' + duration + 's\n\n' +
               'Total: ' + (passCount + failCount) + ' users\n' +
               '✅ Pass: ' + passCount + '\n' +
               '❌ Fail: ' + failCount + '\n\n';
    if (failCount > 0) {
      body += 'Failed users:\n';
      results.forEach(function(r) {
        if (r.verdict.indexOf('❌') >= 0) {
          body += '  ' + r.name + ': ' + r.verdict + '\n';
          if (r.mismatches && r.mismatches.length > 0) {
            r.mismatches.slice(0, 3).forEach(function(m) {
              body += '    - ' + (m.type || 'unknown') + ' | ' + (m.pos || '?') +
                      ' | ' + (m.issues || JSON.stringify(m)) + '\n';
            });
          }
        }
      });
    } else {
      body += '🎉 All users passed — ICS export verified correct!';
    }
    MailApp.sendEmail(ADMIN_EMAIL, subject, body);
  } catch(e) {
    Logger.log('Email send failed: ' + e.message);
  }

  return { pass: passCount, fail: failCount, results: results, duration: duration };
}


// ════════════════════════════════════════════════════════
// 🔧 Helpers
// ════════════════════════════════════════════════════════

/**
 * Verify that DOW in date string matches actual day-of-week computed from year/month/day
 * @param {string} dateStr - e.g. "06/06 (ส.)"
 * @param {number} year - CE year
 * @param {number} month - 1-12
 * @return {object} { ok, expected, actual }
 */
function _phxVerifyDOWInString(dateStr, year, month) {
  const DOW_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const m = String(dateStr).match(/^(\d{1,2})\/\d{1,2}(?:\s*\(([^)]+)\))?\s*$/);
  if (!m) return { ok: true, reason: 'unparseable date string', expected: '?', actual: '?' };
  if (!m[2]) return { ok: true, reason: 'no DOW in string', expected: '?', actual: '?' }; // no DOW = nothing to check
  const day = parseInt(m[1], 10);
  const dowInStr = String(m[2]).trim().replace(/\.$/, '');

  // Try short forms first
  let actual = dowInStr;
  if (DOW_SHORT.indexOf(actual) < 0) {
    // Maybe long form — convert to short for comparison
    const DOW_LONG = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    const longIdx = DOW_LONG.indexOf(actual);
    if (longIdx >= 0) actual = DOW_SHORT[longIdx];
  }

  const dActual = new Date(year, month - 1, day);
  const expected = DOW_SHORT[dActual.getDay()];

  return {
    ok: actual === expected,
    expected: expected,
    actual: actual
  };
}

function _phxLogAuditReport(report) {
  Logger.log('═══ ICS AUDIT for ' + report.name + ' ═══');
  Logger.log('Verdict: ' + report.verdict);
  Logger.log('Months:  ' + (report.months_audited || []).join(', '));
  Logger.log('');
  Logger.log('Counts:');
  Logger.log('  Raw shifts:        ' + report.counts.raw_shifts);
  Logger.log('  Overlays:          ' + report.counts.overlays);
  Logger.log('  Effective:         ' + report.counts.effective);
  Logger.log('  Round 3:           ' + report.counts.round3);
  Logger.log('  Non-Round 3:       ' + report.counts.non_round3);
  Logger.log('  Unparseable start: ' + report.counts.unparseable_start);
  Logger.log('  Unparseable next:  ' + report.counts.unparseable_next);
  Logger.log('  Mismatches:        ' + report.counts.mismatches);

  if (report.details.round3.length > 0) {
    Logger.log('');
    Logger.log('--- Round 3 shifts (should shift +1 day in next mode) ---');
    report.details.round3.forEach(function(s) {
      const ghost = s.isGhost ? ' 👻' : '';
      const status = s.ok ? '✅' : '❌';
      let msg = status + ' ' + s.pos + ghost + ' | start:"' + s.startDate + '" → next:"' + s.nextDate + '"';
      if (!s.ok) {
        if (!s.dateOk) msg += ' [date should be "' + s.expectedNextDate + '"]';
        if (!s.dowOk) msg += ' [DOW: ' + s.dowDetail + ']';
        if (!s.yearOk) msg += ' [year wrong: ' + s.nextYear + ']';
        if (!s.monthOk) msg += ' [month wrong: ' + s.nextMonth + ']';
      }
      Logger.log(msg);
    });
  }

  if (report.details.nonRound3.length > 0) {
    Logger.log('');
    Logger.log('--- Non-Round 3 shifts (should be UNCHANGED in next mode) ---');
    report.details.nonRound3.forEach(function(s) {
      const ghost = s.isGhost ? ' 👻' : '';
      Logger.log((s.ok ? '✅' : '❌') + ' ' + s.pos + ghost + ' (' + s.shift + ') | "' + s.startDate + '"');
    });
  }

  if (report.details.unparseable_start.length > 0) {
    Logger.log('');
    Logger.log('--- ❌ UNPARSEABLE in START mode (will NOT appear in ICS) ---');
    report.details.unparseable_start.forEach(function(u) {
      Logger.log('  pos="' + u.pos + '" date="' + u.date + '" range="' + u.range + '"');
    });
  }
  if (report.details.unparseable_next.length > 0) {
    Logger.log('');
    Logger.log('--- ❌ UNPARSEABLE in NEXT mode (will NOT appear in ICS) ---');
    report.details.unparseable_next.forEach(function(u) {
      Logger.log('  pos="' + u.pos + '" date="' + u.date + '" range="' + u.range + '"');
    });
  }

  if (report.details.mismatches.length > 0) {
    Logger.log('');
    Logger.log('--- ❌ DETAILED MISMATCHES ---');
    report.details.mismatches.forEach(function(m) {
      Logger.log('  ' + JSON.stringify(m));
    });
  }
  Logger.log('');
  Logger.log('═══════════════════════════════════════');
}

function devCheckToggles() {
  Logger.log(PropertiesService.getScriptProperties().getProperty('PHX_NOTIFY_FILE_UPLOAD'));
  Logger.log(PropertiesService.getScriptProperties().getProperty('PHX_NOTIFY_MANUAL_SYNC'));
  Logger.log(PropertiesService.getScriptProperties().getProperty('PHX_NOTIFY_HOT_POLLING'));
}

function cleanupTestData() {
  var ss = SpreadsheetApp.openById(SCHEDULE_SHEET_ID);
  var sh = ss.getSheetByName('PHX_Overlays_v2');
  if (!sh || sh.getLastRow() < 2) { Logger.log('empty'); return; }
  
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
  var deleted = [];
  
  // ลูป backward เพื่อ deleteRow ปลอดภัย
  for (var i = data.length - 1; i >= 0; i--) {
    var payload = {};
    try { payload = JSON.parse(data[i][4] || '{}'); } catch(e) {}
    
    var action = String(payload.action || data[i][3] || '');
    var shiftKey = String(payload.shiftKey || '');
    
    // ลบ action ที่ดูเหมือน test:
    //   - action มีคำว่า 'test' หรือ 'console-'
    //   - หรือ shiftKey = 'fake-key'
    if (action.indexOf('test') >= 0 || action.indexOf('console-') >= 0 || shiftKey === 'fake-key') {
      deleted.push({ row: i+2, actionId: data[i][0], action: action, shiftKey: shiftKey });
      sh.deleteRow(i + 2);
    }
  }
  
  Logger.log('ลบ ' + deleted.length + ' rows:');
  deleted.forEach(function(d) { Logger.log('  ' + JSON.stringify(d)); });
}

function testA2_BuildAlarms() {
  const settings = _phxGetUserReminderSettings('ณรพล');
  Logger.log('Settings: ' + JSON.stringify(settings));

  // Test shift: tomorrow 16:30
  const shiftStart = new Date();
  shiftStart.setDate(shiftStart.getDate() + 1);
  shiftStart.setHours(16, 30, 0, 0);
  Logger.log('Shift start: ' + shiftStart.toString());

  // User has settings → uses col F/G
  const alarms = _phxBuildShiftAlarms(shiftStart, settings, [60, 1080]);
  Logger.log('User alarms (min): ' + JSON.stringify(alarms));
  alarms.forEach(function(min) {
    const t = new Date(shiftStart.getTime() - min * 60000);
    Logger.log('  -' + min + 'min → ' + t.toString());
  });

  // No settings → fallback URL
  Logger.log('--- Fallback (no settings) ---');
  Logger.log('Fallback: ' + JSON.stringify(_phxBuildShiftAlarms(shiftStart, null, [60, 1080])));
}