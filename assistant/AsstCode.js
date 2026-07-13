// =================================================================
// 🧩 AsstCode.gs — PHX-Assistant core (ตารางเวรผู้ช่วยเภสัชกร)
// -----------------------------------------------------------------
// สถาปัตยกรรม: Google Apps Script + Firebase RTDB + Google Sheets
//   - ไม่มี auth / login  (Admin แก้ข้อมูลผ่าน Sheet โดยตรง)
//   - ไม่มี overlay / swap
//   - Excel upload → convert เป็น Google Sheet → hydrate → parse → validate → publish Firebase
// personKey = ชื่อ+วงเล็บดิบตามตารางเวร (เช่น "ธนวัฒน์(ซ)")  ไม่ generate ID ใหม่
// =================================================================

// ─── ⚙️ CONFIG (ต้องตั้งค่าก่อนใช้งานจริง) ───────────────────────────
// Firebase RTDB ของผู้ช่วย (แยกจากของเภสัช) — ใส่ URL ของโปรเจกต์ใหม่
const ASST_FIREBASE_DB_URL = "https://PUT-ASSISTANT-PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app";
// โฟลเดอร์เก็บไฟล์ที่ convert ชั่วคราว (สร้างใหม่ หรือใช้ root ก็ได้ — ปล่อยว่างได้)
const ASST_TEMP_FOLDER_ID = "";   // "" = ใช้ My Drive root
// Spreadsheet ที่เก็บชีท "ทำเนียบชื่อเล่น" + archive (ตั้งค่าให้ชี้ไฟล์จริง)
const ASST_MASTER_SHEET_ID = "PUT_ASSISTANT_MASTER_SHEET_ID_HERE";
const NICKNAME_TAB = "ทำเนียบชื่อเล่น";

// ─── 🌐 doGet — เสิร์ฟหน้าเว็บ (ไม่มี auth guard) ─────────────────────
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.admin === 'true') {
    return HtmlService.createTemplateFromFile('AsstAdmin').evaluate()
      .setTitle('PHX-Assistant · Admin')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createTemplateFromFile('AsstIndex').evaluate()
    .setTitle('ตารางเวรผู้ช่วย')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getScriptUrl() { return ScriptApp.getService().getUrl(); }
function getFirebaseWebConfig() {
  // frontend ใช้ต่อ Firebase อ่านตรง (databaseURL อย่างเดียวพอสำหรับ RTDB public-read)
  return { databaseURL: ASST_FIREBASE_DB_URL };
}

// ─── 🔤 Helpers (พอร์ตตรงจาก code.js ของเภสัช) ───────────────────────
function fullTrim_(str) {
  return str == null ? "" :
    String(str).replace(/[\u00A0\u200B\u2028\u2029\uFEFF]/g, " ").replace(/\s+/g, " ").trim();
}
function normalizePos_(raw) {
  return raw ? fullTrim_(String(raw).split("\n")[0]).replace(/MN/g, "NM") : "";
}
function normalizeName_(name) {
  // ★ personKey: normalize แต่ "คงวงเล็บ" ไว้ (ธนวัฒน์(ซ) ยังเป็น ธนวัฒน์(ซ))
  if (!name) return "";
  let n = fullTrim_(name).replace(/^(ภก\.|ภญ\.|นาย|นางสาว|น\.ส\.|นาง)\s*/g, "");
  return n.replace(/\s*\(\s*/g, "(").replace(/\s*\)\s*/g, ")");
}
function isValidPersonName_(n) {
  if (!n || n.length < 2 || n.length > 25) return false;
  if (/[0-9]/.test(n)) return false;
  const forbidden = ["หยุด", "พัก", "คลินิก", "เภสัช", "นาที", "ชั่วโมง", "ปิด", "เปิด", "เวลา", "หมายเหตุ"];
  for (let i = 0; i < forbidden.length; i++) { if (n.includes(forbidden[i])) return false; }
  return true;
}
function processDate_(dObj) {
  if (!(dObj instanceof Date) || isNaN(dObj.getTime())) return { date: "-", ts: 0 };
  const days = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
  return {
    date: Utilities.formatDate(dObj, "GMT+7", "dd/MM") + " (" + days[dObj.getDay()] + ")",
    ts: parseInt(Utilities.formatDate(dObj, "GMT+7", "yyyyMMdd"), 10)
  };
}
const THAI_MONTHS_ = [null, "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
function monthKeyFromDate_(d) {
  // yyyy-mm (ค.ศ.)  — key ภายในระบบ
  const y = d.getFullYear(), m = d.getMonth() + 1;
  return y + "-" + (m < 10 ? "0" + m : "" + m);
}
function thaiLabelFromDate_(d) {
  // "กรกฎาคม 2569"  — label สำหรับแสดงผล (พ.ศ.)
  return THAI_MONTHS_[d.getMonth() + 1] + " " + (d.getFullYear() + 543);
}

// ─── 📥 Upload entry: xlsx → convert → parse → validate → publish ──────
// เรียกจาก AsstAdmin.html ผ่าน google.script.run
//   base64 : เนื้อไฟล์ .xlsx (base64)
//   filename : ชื่อไฟล์
//   opts : { force:boolean }  — force=true ให้ publish ทั้งที่ validator มี error
function uploadAssistantFile(base64, filename, opts) {
  opts = opts || {};
  const t0 = Date.now();
  let tempId = null;
  try {
    // (1) decode + convert xlsx → Google Sheet ชั่วคราว
    const bytes = Utilities.base64Decode(base64);
    const blobXlsx = Utilities.newBlob(bytes,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename || "upload.xlsx");
    const resource = { name: "[TEMP] " + (filename || "assistant"), mimeType: MimeType.GOOGLE_SHEETS };
    if (ASST_TEMP_FOLDER_ID) resource.parents = [ASST_TEMP_FOLDER_ID];
    const created = Drive.Files.create(resource, blobXlsx, { supportsAllDrives: true });
    tempId = created.id;

    // (2) hydrate + parse + validate
    const blob = hydrateBlobFast_(tempId);
    const parsed = parseAssistantWorkbook_(blob);            // AsstParser.js
    const validation = validateAssistant_(blob, parsed);      // AsstValidator.js

    // (3) ตัดสินใจ publish
    const blocking = validation.errors.length > 0;
    let published = false;
    if (!blocking || opts.force) {
      const payload = {
        label: parsed.label,
        key: parsed.key,
        updatedAt: new Date().toISOString(),
        data: parsed.records,
        closed: parsed.closed,
        dutyTemplates: parsed.dutyTemplates,
        validation: { errors: validation.errors, warnings: validation.warnings, stats: validation.stats }
      };
      pushToFirebase_('schedules/' + parsed.key, payload);
      registerMonth_(parsed.key, parsed.label);
      published = true;
    }

    return {
      ok: true, published, blocked: blocking && !opts.force,
      key: parsed.key, label: parsed.label,
      counts: parsed.counts, uniqueNames: parsed.uniqueNames,
      validation: validation,
      ms: Date.now() - t0
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  } finally {
    if (tempId) { try { Drive.Files.remove(tempId, { supportsAllDrives: true }); } catch (_) {} }
  }
}

// ─── 🔥 Firebase REST ────────────────────────────────────────────────
function pushToFirebase_(path, payload) {
  if (!ASST_FIREBASE_DB_URL || ASST_FIREBASE_DB_URL.indexOf("PUT-") === 0) {
    throw new Error("ยังไม่ได้ตั้งค่า ASST_FIREBASE_DB_URL");
  }
  const url = ASST_FIREBASE_DB_URL + "/" + path + ".json";
  const res = UrlFetchApp.fetch(url, {
    method: "put", contentType: "application/json",
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  Logger.log("🔥 Firebase PUT %s → %s", path, code);
  if (code >= 300) throw new Error("Firebase PUT " + code + ": " + res.getContentText().slice(0, 200));
}
function fetchFromFirebase_(path) {
  const url = ASST_FIREBASE_DB_URL + "/" + path + ".json";
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  const txt = res.getContentText();
  return (txt && txt !== "null") ? JSON.parse(txt) : null;
}

// ─── 🗓️ Month index (เก็บใน Firebase + ScriptProperties) ───────────────
function registerMonth_(key, label) {
  const props = PropertiesService.getScriptProperties();
  let list = [];
  try { list = JSON.parse(props.getProperty('ASST_MONTHS') || '[]'); } catch (_) {}
  list = list.filter(m => m.key !== key);
  list.push({ key: key, label: label });
  list.sort((a, b) => (a.key < b.key ? 1 : -1));   // ใหม่สุดก่อน
  props.setProperty('ASST_MONTHS', JSON.stringify(list));
  pushToFirebase_('monthIndex', list);
}
function getAvailableMonths() {
  try {
    const props = PropertiesService.getScriptProperties();
    const local = JSON.parse(props.getProperty('ASST_MONTHS') || '[]');
    if (local.length) return local;
  } catch (_) {}
  return fetchFromFirebase_('monthIndex') || [];
}

// ─── 📤 Read-back สำหรับ frontend (fallback ของ Firebase-direct) ──────
function getScheduleData(key) {
  const sched = fetchFromFirebase_('schedules/' + key);
  if (!sched) return { error: "ไม่พบข้อมูลเดือน " + key };
  const nick = fetchFromFirebase_('people') || {};
  return {
    key: key, label: sched.label || key,
    data: sched.data || [],
    closed: sched.closed || {},
    dutyTemplates: sched.dutyTemplates || {},
    nicknames: _flattenNicknames_(nick),
    validation: sched.validation || null
  };
}
function _flattenNicknames_(peopleNode) {
  // map: rawPersonKey → nickname  (key ใน /people ถูก encode ไว้ จึงใช้ field personKey ที่เก็บดิบ)
  const out = {};
  Object.keys(peopleNode || {}).forEach(k => {
    const node = peopleNode[k];
    if (node && node.nickname) out[node.personKey || k] = node.nickname;
  });
  return out;
}
