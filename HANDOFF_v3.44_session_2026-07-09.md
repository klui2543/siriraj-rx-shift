# HANDOFF — v3.44 session 2026-07-09

Branch **`work/v3.44-lww`** — all pushed to origin (`0 0`, tree clean). Canonical worktree: `clever-zhukovsky-390ab9`.
Base = `e478854`. This session = 11 commits (`9fe6703` → `f05fd70`).

---

## 🚀 DEPLOY (paste into GAS, then **create a NEW deployment version — not just Save**)

| repo file | GAS file | why |
|---|---|---|
| `Index.html` | **Index** | sync flag + picker + toggle + radar + popups (most changes) |
| `Phase_Z_B3_Sync.js` | **Phase_Z_B3_Sync** | `phxPushActions` upsert (needed by the publish sync) |
| `code.js` | **Code** (main) | stop creating the public sheet on upload |

**Verify a deploy actually took** (GAS serves the DEPLOYED version, not saved-editor code):
`typeof _phxNoticeEnqueue === 'function'` (client) + upload a new file → no public "Public_" sheet.
**Rollback:** re-paste the previous `Index.html`/`code.js` + new version. Client flags: `setSyncPublish(false)`.

---

## ✅ WHAT SHIPPED (each verified or ready-to-test)

### 1. `9fe6703` — Live-update fix (`_syncPublish` default OFF→ON) · DEPLOYED+VERIFIED
"Firebase ดับ / overlay ไม่อัปเดตสด" root cause = the publish→server sync flag defaulted OFF for
everyone, so nobody's publishes reached the shared board. Flipped the default ON (`=== '1'`→`!== '0'`,
catch→true, Index.html ~2543). Read path never needed the flag (proven: incognito auto-refreshed).
Needs the Phase_Z_B3 upsert deployed too.

### 2. `191caec` — Picker shows CURRENT holder · DEPLOYED+VERIFIED
The "รับเวร/แลกเวร" picker listed shifts under their MASTER owner (a shift ณรพล swapped to อสมาภรณ์ still
showed under ณรพล). Added `newOwner` to every used-map (LWW/PBOverlays/OverlayManager), helper
`_pbHolderOf`, and the picker now groups/filters/labels by current holder ("เดิมของ X"), keeps
transferred shifts selectable (chains), and defaults "รับจาก" to the current holder. Master table for
other viewers was already correct → did NOT flip `_lwwEngine`.

### 3. `ecec69e` — Expanded timelines survive background refresh · VERIFIED
Timeline expand state was DOM-only → every poll/firebase/GAS refresh (all → triggerUpdate→renderTable)
collapsed open ▼ histories. `_captureExpandedTimelines`/`_restoreExpandedTimelines` snapshot + re-open
around the render. Toggle-id (`actionId + _rowAidHash`) is content-stable so restore matches.

### 4. Firebase status light — the `connRadar` saga (`12322fa` `e5e244c` `4439e2a` `8ab52c8`)
- Was "Live Sync"/"GAS (Static)" (source of last load) with `animate-pulse` → looked like it "died".
- Now `firebase.ref('.info/connected').on()` → `window._fbConnected` → `_renderConnRadar()`.
- Klui wanted a plain DOT, and ONLY ONE (there were 2 green dots: audit + Firebase). Final state:
  **one dot INSIDE the month chip** = `_renderConnRadar` targets **`#auditBadge`** (green `#16a34a`
  connected / grey `#9ca3af` offline, tooltip, onclick cleared). `#connRadar` (after the chip) stays
  `display:none`. The old 3-color audit dot is **retired** (its warning role moved to the popup — see #6).
- Gotcha found: `#connRadar` was hardcoded `display:none` "for clean UI" — that's why a correct green
  value looked dead.

### 5. `cf5796d` `4439e2a` — Dismissible popup system + announcements → popup
- `_phxNoticeEnqueue({id,icon,title,html,hideOptOut?,onAck?})`: modal, one-at-a-time queue, id-dedup.
  Default shows a **"ไม่ต้องแสดงอีก"** tick → persists that id in `localStorage` `phx_notice_dismissed_v1`
  (per-popup, works for anon). `hideOptOut` hides the tick; `onAck` runs on close.
- **Announcements → popup** (Klui "โยก Announcement เข้า popup"): `phxBcastRender` now enqueues each
  unread broadcast (`hideOptOut:true`, `onAck: phxBcastDismiss(id)`) instead of a banner. **Phase J
  "unusual sheet" notices (เปลี่ยนเวลาวันหยุดพิเศษ) are broadcasts too → Source 2 done for free.**
- Test: `_phxNoticeEnqueue({id:'t9',icon:'🧪',title:'x',html:'<p>y</p>'})`.

### 6. `cf5796d` → `f05fd70` — Data-quality popup (Source 1)
`_phxNoticeCheckDataQuality()` (called from handleDataReceived AFTER clientOverlaps is computed) fires
on **audit MINOR or CATASTROPHIC, or `clientOverlaps>0`** (🔴 vs ⚠️). id hashes severity+overlaps+reason
so a new problem re-shows; the tick dismisses per-issue. This replaces the retired 3-color audit dot.

### 7. `bb1c4b6` — Stop creating the public sheet on upload (code.js)
The `"Public_"+filename` sheet (shared ANYONE_WITH_LINK) was the transient Excel→Sheet conversion
(read by hydrate + Phase I/J); month data is stored as JSON separately. Removed `setSharing`, renamed
to `_convert_tmp_`, trash it in the existing `finally` (covers the CATASTROPHIC-throw path), `sheetUrl=""`
→ client auto-hides the "ดูชีต" button. Forward-looking; existing months keep their URL.

---

## ⏳ REMAINING / OPEN
- **Bottom navigation** (Sizzler-style tab bar) — deferred; Klui may then add a toggle to re-enable the
  public sheet as an option.
- **`_lwwEngine` still default OFF** for the 300 users (legacy engine). Direct gives/swaps render right on
  legacy (verified), but long chains (A→B→C) may still be wrong for them. Flip only if a chain case
  misbehaves live — needs calendar/room-view testing first.
- **Audit MODAL** (`openAuditModal`, detailed data-quality view) is no longer reachable from the chip dot
  (that dot is Firebase now). The function still exists; wire it to a menu if Klui wants the detail back.

## ⚠️ REFERENCE
- Flags (per-browser localStorage): `setSyncPublish(true/false)` (`sync_publish`), `setLwwEngine(...)` (`lww_engine`).
- Notice dismiss store: `localStorage 'phx_notice_dismissed_v1'`.
- Broadcast shape: `{id,title,body,createdBy,createdAt}`; popup id = `bcast_<id>`; read-tracking via `phxBcastDismiss` (10-min window).
- Audit: `currentAuditInfo.severity` ∈ OK/MINOR/CATASTROPHIC, `.issues` = reason; `clientOverlaps` = client time-conflicts.
