/**
 * ════════════════════════════════════════════════════════════════
 * Phase H — Notification Preferences & Post-Upload Hooks
 * ════════════════════════════════════════════════════════════════
 * • Per-action toggle (fileUpload / manualSync / hotPolling)
 * • Always email admin (audit trail — no toggle)
 * • Track last upload for admin display
 * • LINE: gates Stage F3 (does NOT duplicate F3's broadcast)
 * 
 * Defaults: hotPolling=ON (routine), file/manual=OFF (likely corrections)
 * ════════════════════════════════════════════════════════════════
 */

var PHX_NOTIFY_KEYS = {
  fileUpload:  'PHX_NOTIFY_FILE_UPLOAD',
  manualSync:  'PHX_NOTIFY_MANUAL_SYNC',
  hotPolling:  'PHX_NOTIFY_HOT_POLLING'
};

var PHX_NOTIFY_DEFAULTS = {
  fileUpload:  false,
  manualSync:  false,
  hotPolling:  true
};

var PHX_NOTIFY_LABELS = {
  fileUpload:  'อัปโหลดไฟล์ (Manual)',
  manualSync:  'Manual Sync (Gmail)',
  hotPolling:  'Hot Polling (Auto)'
};

// ────────────────────────────────────────────────────────────────
// 1. Public API — called from Admin.html
// ────────────────────────────────────────────────────────────────

function getNotifyPrefs(token) {
  guardCheck_(token);
  var props = PropertiesService.getScriptProperties();
  function _read(key, dflt) {
    var v = props.getProperty(key);
    if (v === null) return dflt;
    return v === 'true';
  }
  return {
    fileUpload: _read(PHX_NOTIFY_KEYS.fileUpload, PHX_NOTIFY_DEFAULTS.fileUpload),
    manualSync: _read(PHX_NOTIFY_KEYS.manualSync, PHX_NOTIFY_DEFAULTS.manualSync),
    hotPolling: _read(PHX_NOTIFY_KEYS.hotPolling, PHX_NOTIFY_DEFAULTS.hotPolling)
  };
}

function setNotifyPref(token, action, value) {
  guardCheck_(token);
  var key = PHX_NOTIFY_KEYS[action];
  if (!key) throw new Error('Invalid action: ' + action);
  PropertiesService.getScriptProperties().setProperty(key, value ? 'true' : 'false');
  return { ok: true, action: action, value: !!value };
}

function getLastUploadInfo(token) {
  guardCheck_(token);
  var raw = PropertiesService.getScriptProperties().getProperty('PHX_LAST_UPLOAD');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch(e) { return null; }
}

// ────────────────────────────────────────────────────────────────
// 2. Internal helpers (called from Code.gs uploadLocalFile)
// ────────────────────────────────────────────────────────────────

function _phxShouldNotifyLine(action) {
  var key = PHX_NOTIFY_KEYS[action];
  if (!key) return true;
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (v === null) return PHX_NOTIFY_DEFAULTS[action];
  return v === 'true';
}

function _phxDetectUploadAction(token) {
  if (token === SYSTEM_BOT_TOKEN) return 'hotPolling';
  var ctx = PropertiesService.getScriptProperties().getProperty('_PHX_UPLOAD_CTX');
  if (ctx === 'manualSync') return 'manualSync';
  if (ctx === 'hotPolling') return 'hotPolling';
  return 'fileUpload';
}

function _phxAfterUploadHook(action, monthLabel, monthId, recordCount, sourceDetail) {
  try {
    var props = PropertiesService.getScriptProperties();
    var nowMs = Date.now();
    var label = PHX_NOTIFY_LABELS[action] || action;

    try {
      props.setProperty('PHX_LAST_UPLOAD', JSON.stringify({
        timestamp:   nowMs,
        monthLabel:  monthLabel || '',
        monthId:     monthId || '',
        recordCount: recordCount || 0,
        action:      action,
        actionLabel: label,
        source:      sourceDetail || ''
      }));
    } catch(e) { console.warn('[Phase H] last-upload save failed:', e); }

    try {
      var adminEmail = (typeof ADMIN_EMAIL !== 'undefined' && ADMIN_EMAIL)
                       ? ADMIN_EMAIL : 'norapol.uttho@gmail.com';
      var webUrl = ScriptApp.getService().getUrl();
      var timeStr = Utilities.formatDate(new Date(nowMs), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
      MailApp.sendEmail({
        to:       adminEmail,
        subject:  '[Siriraj Rx] ' + label + ' สำเร็จ — ' + (monthLabel || monthId),
        htmlBody:
          '<h3 style="margin:0 0 12px;color:#1e3a8a;">อัปโหลดสำเร็จ ✓</h3>' +
          '<table style="border-collapse:collapse;font-family:sans-serif;font-size:13px;">' +
            '<tr><td style="padding:4px 12px 4px 0;color:#64748b;">วิธี:</td><td><b>' + label + '</b></td></tr>' +
            '<tr><td style="padding:4px 12px 4px 0;color:#64748b;">เดือน:</td><td><b>' + (monthLabel || '-') + '</b></td></tr>' +
            '<tr><td style="padding:4px 12px 4px 0;color:#64748b;">จำนวนเวร:</td><td><b>' + (recordCount || 0) + '</b> รายการ</td></tr>' +
            '<tr><td style="padding:4px 12px 4px 0;color:#64748b;">แหล่ง:</td><td>' + (sourceDetail || '-') + '</td></tr>' +
            '<tr><td style="padding:4px 12px 4px 0;color:#64748b;">เวลา:</td><td>' + timeStr + '</td></tr>' +
          '</table>' +
          '<p style="margin-top:16px;"><a href="' + webUrl + '?admin=true" style="background:#2563eb;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;font-family:sans-serif;font-size:13px;">เปิด Admin Panel</a></p>'
      });
    } catch(emailErr) { console.warn('[Phase H] email failed:', emailErr); }
  } catch(err) {
    console.error('[Phase H] hook error:', err);
  }
}