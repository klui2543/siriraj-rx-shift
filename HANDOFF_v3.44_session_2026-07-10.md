# HANDOFF — v3.44 session 2026-07-10

Branch **`work/v3.44-lww`** — all pushed to origin (tip `86da015`). Canonical worktree: `clever-zhukovsky-390ab9`.
Base = `50d51ea` (prev session handoff). This session = **14 commits** (`af40355` → `86da015`), 2 files: `Index.html` (+583) and **new `Phase_Z_Nicknames.js`**.

---

## 🚀 DEPLOY (paste into GAS, then **create a NEW deployment version — not just Save**)

| repo file | GAS file | why |
|---|---|---|
| `Index.html` | **Index** | everything below |
| `Phase_Z_Nicknames.js` | **new file** `Phase_Z_Nicknames` | nickname Sheet fallback (`nkGetAllFromSheet` / `nkSaveToSheet`) |

**Verify a deploy took** (GAS serves the DEPLOYED version, not the saved editor): open the ⋮ kebab menu → the item **"🔍 ตรวจสอบคุณภาพข้อมูล"** should be there. Or console: `typeof _fltTAOpen === 'function'`.

### RTDB rules — now OPTIONAL
Nicknames work fully via the GAS/Sheet fallback even with **no** RTDB rules. Adding the rules just gives Firebase **real-time** updates. To enable real-time, add this next to the existing `schedules` rule in Firebase Console → Realtime Database → Rules (⚠️ add BOTH `public` AND `private` — a public-only rule was the cause of "private forgotten on refresh"):
```json
"nicknames": {
  "public":  { ".read": true, "$name":  { ".write": true, ".validate": "newData.isString() && newData.val().length <= 40" } },
  "private": { ".read": true, "$owner": { "$target": { ".write": true, ".validate": "newData.isString() && newData.val().length <= 40" } } }
}
```

---

## ✅ WHAT SHIPPED (each Klui-tested or node-verified)

### Small wins
- **`af40355`** — audit modal reopened via the kebab menu ("🔍 ตรวจสอบคุณภาพข้อมูล", all users; it lost its old dot to the Firebase light).
- **`e8458fc` `345cb77` `0579fbc`** — swap picker **person + date = type-to-filter popups** (was `<select>`), and **รหัสเวร search ignores ALL separators** (`_normCode` keeps only `[0-9 a-z ก-๙]`) → "I13"→"I-13", "NM512"→"NM5-12", "รอบ3"→"รอบ 3" (any dash incl. en/em-dash). ✅ Klui verified.

### 🏷️ Nicknames — 2-layer (public + private), Firebase-primary + Sheet-fallback
- **`c28c1e4`** data layer: `displayName(name)` = **my private alias > their public nickname > real name** (DISPLAY ONLY, never touches identity/`makeShiftKey`/`partnerName`). RTDB `nicknames/public/{encName}` + `nicknames/private/{encMe}/{encTarget}`; key encoder `_nkKey` (encodeURIComponent + `.`→`%2E`, because Firebase keys forbid `.`).
- **`eafb790`** modal from the user menu ("ตั้งชื่อเล่น"): set my public nickname + a searchable friend list for private aliases.
- **`74b774e` `2597f42`** show nicknames in the swap **picker**, the **table** name column, and the personal-summary **banner** (exports keep real names on purpose).
- **`485fe0b`** search by nickname (`_nkNameMatches` in the multi-select list + table/calendar filter + `getCurrentUser`) + **instant apply** on save (optimistic map update + repaint, no wait for `.on`/poll).
- **`84f537b` `05a9c04`** GAS/Sheet fallback: `Phase_Z_Nicknames.js` (sheet `PHX_Nicknames`: type|owner|target|nickname|updatedAt, auto-creates). `_nkWrite` writes BOTH Firebase + Sheet (succeeds if either); `_nkPullGAS` reads the Sheet when Firebase isn't serving.
- **`7dc4a21`** timeline names → `displayName()` in all 3 builders (`buildTimelineHTML`, `_buildPBTimelineHTML`, `openTimelineModal`); robust hard-refresh load (retry pull at +1.5s/+4s and on login; don't clear `_nkPrivate` on login; don't wipe a populated map with an empty pull); **per-field × clear** on every typeahead (picker + filter) via CSS `:not(:placeholder-shown)`, red name-search button → "ล้างทั้งหมด".
- **`86da015`** ⭐ fix "private aliases forgotten on refresh": `_nkFbOk` conflated public+private → if Firebase served public but denied private, the Sheet pull was skipped. Split into `_nkFbOk` (public) + `_nkFbOkPriv` (private); `_nkPullGAS` applies each map **independently**. ✅ node-verified the public-served-private-denied case.

### 🔎 Filters — `9e0a210`
- The 3 advanced filters (วันที่/ห้องยา/รหัสเวร) → picker-style **typeahead popups** (`_fltTA*`, reuse `.pick-ta`/`.multi-list`); value stored in HIDDEN `#dateDropdown`/`#roomFilter`/`#posDropdown` so all existing filter reads are untouched. รหัสเวร uses `_normCode`. Options = `window._fltPoses` (contextual) / `_fltDates`.
- **Date-reset-on-30s-poll fixed**: the option rebuild dropped the selected value (pos restored, date didn't) → now restores `_prevDate`, and hidden inputs are never rebuilt anyway.

---

## ⏳ REMAINING / NOT STARTED (Klui paused here)
1. **Swap-flow view ("หน้าแลกเวร")** — a visual handoff chain (เอ๋→โต้ง→ปิ๊ก, "ถืออยู่" = current holder) from `LWW.ledger(slotKey)` / `LWW.buildRecords()`. Keep it SIMPLE (Klui dislikes busy visuals — NO network graph). App-native mockup (Kanit + accent chips + shift badges) was accepted. Will live under a bottom-nav "แลกเวร" tab.
2. **Bottom nav — 3 tabs** (ตารางเวร / แลกเวร / ฉัน), tab 1 = existing UI untouched. FAB is bottom-right z-index 4500 → lift it above the bar. App-native 3-tab mockup accepted.

---

## ⚠️ REFERENCE / GOTCHAS
- **Verify with no live GAS backend**: Index.html is pure client-side (0 GAS `<?= ?>` scriptlets) → renders standalone but data needs the backend. Method used all session: `node --check` every inline `<script>` block after each edit + DOM-stub logic harnesses.
- **If nicknames still vanish**: console after refresh → look for `nk public/private read denied` (rules) or a GAS failure. Check the `PHX_Nicknames` sheet has the `private` rows.
- **git detached-HEAD hazard**: the worktree silently detached twice after a push (commit landed on detached HEAD, `git push` said "Everything up-to-date"). Always confirm `git status -sb` shows `## work/v3.44-lww` (not `## HEAD (no branch)`) before trusting a push; reattach with `git checkout -B work/v3.44-lww`.
- **Tool display**: Read/Grep render `//` comments as `\` in this file — the real bytes are `//` (verified with `od -c`). Anchor edits on code lines, not comment lines.
- Flags (per-browser localStorage): `setSyncPublish`, `setLwwEngine` (still default OFF). Nickname maps: `window._nkPublic` / `_nkPrivate`; served flags `_nkFbOk` / `_nkFbOkPriv`.
