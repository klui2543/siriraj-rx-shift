# HANDOFF — v3.45 session 2026-07-11 (relay legs + deploy fix + changelog + admin-cancel)

Branch **`main`** (now canonical — v3.44-lww merged in). ~15 feature commits + hook stamp
commits this session, base `2d0fb2b`. All work committed; **pushed to origin at session end.**

Prior handoff (earlier same day, worktree): `HANDOFF_v3.45_session_2026-07-11.md`.

---

## 🚀 DEPLOY
`clasp push` to GAS runs automatically on the Stop hook (now that it's unblocked — see below).
The LIVE web app (`/exec`) serves a **pinned deployment version** → to make new code live you
must **create a NEW deployment version** (GAS → Deploy → จัดการการทำให้ใช้งานได้ → แก้ไข ✏️ →
เวอร์ชัน: ใหม่ → Deploy). For quick test-without-versioning use the **`/dev` URL** (Deploy →
ทดสอบการทำให้ใช้งานได้) — it always runs the latest pushed code.

---

## ✅ WHAT SHIPPED THIS SESSION

### 1. Admin cancel published (`0291372`) — item #3 from prior handoff, DONE
Admin can cancel another user's PUBLISHED tail hop via that user's timeline (✕ next to the
⚖️-override ✎). `swfAdminCancelPublished` — same gate as the author flow (reason radio +
password + audit `admin_cancel_published`) but deletes via the admin actingAs path
`phxRemoveAction(admin, adminHash, id, owner)`. No backend change. 32-check harness.

### 2. 🔴 FIXED the clasp auto-deploy that was silently broken (`99b1e81`)
`clasp push` (Stop hook) **had never succeeded** — `.claspignore` un-ignored all top-level
`*.js` via `!*.js`, which re-included `generate-index.js`, a Node build script whose first
line is `#!/usr/bin/env node`. GAS can't parse `#!` → the whole push aborted. Re-excluded it.
`clasp status` now lists exactly the ~30 real Apps Script files. **This is why GAS never
updated before.**

### 3. Changelog (`68ce5c4`, `d6df2c1`) — version → update history
Version moved from the fixed footer badge to a plain-text **"เวอร์ชัน v3.45"** line UNDER the
Export button; tap → `openChangelog()` popup listing `APP_CHANGELOG` (newest first, ล่าสุด
badge, scrolls). **Klui names each release — add a new entry to the TOP of `APP_CHANGELOG`
each update.** Keep it non-alarming (no admin-power/scary items — Klui: "User จะตกใจ").

### 4. 🏃 Relay-baton time-split "ส่งไม้ต่อเวลา" — Stage 1a + 1b (flag `window._relayEnabled`, default OFF)
A shift covered by a relay of people, each leg = owner + until-time. `setRelayLegs(true)` to test.
- **1a capture** (`a02ed6c`,`e66b800`): "🏃 ส่งไม้ต่อเวลา" section in `swfOpenConfirm` for
  **give AND add (รับเวร)**; per-leg owner + `อยู่ถึง` time + live bar + เพิ่ม/ลบไม้.
  `_relayCollect` validates → `_relaySaveLegs` persists `action.legs=[{owner,start,end}]`.
  Cross-midnight (16:30-0:00) handled. Leg owner is an **inline typeahead** (`_relayOwnerTypeahead`,
  `55f05b0`) — nickname-aware, free-text, body-appended dropdown above the dialog.
- **1b display** (`75bf3ee`,`ac7686e`,`51ff002`): `_relayGather` + `_relayExpand` (in
  `getEffectiveData`) fan a legged shift into per-leg rows — anchored on the master (give) OR
  the receiver's ghost (add); 'ไม้ N' chip per row (teal/orange/violet). `_relaySaveLegs` calls
  `triggerUpdate` so it repaints. Harnesses: `relay_harness` (30), `relay1b_harness` (24).

### 5. Name picker + register free-text (`dce421b`, `26779c9`, `ba4f867`)
- `_lwwNamePicker`: nickname search/display (`_nkNameMatches`/`displayName`) + a
  "พิมพ์ชื่อเอง" checkbox for unregistered names.
- Register form: a "ไม่มีชื่อในรายการ — พิมพ์ชื่อเอง" checkbox under the name dropdown
  (`phxRegToggleCustom`, reuses the existing `__custom__` path). Spacing widened.

---

## 🧪 VERIFIED
Every commit: `node --check` on all 9 inline `<script>` blocks (`check_scripts.js`). Behavioral
harnesses (session-local scratchpad, extract-and-run against the REAL functions):
`admincancel` 32 · `changelog` 13 · `relay` (capture+collect+cross-midnight) 30 ·
`relay1b` (`_relayExpand`/`_relayGather`, Sonnet subagent) 24. **Klui UI-tested on GAS** —
relay entry + table split work; the items below are what he found.

## ⏳ NEXT — Relay Stage 2/3 (Klui live-test feedback 2026-07-11). See `DESIGN_relay_legs.md`.
- **1b 🔴 MOST IMPORTANT — publish doesn't propagate legs.** After เผยแพร่, only the publisher's
  own leg shows; other owners don't get their rows. `action.legs` must survive to the server +
  back into `pathBOverlays` so every viewer's `_relayExpand` splits it. Check `_phxB3bSerializeShifts`
  (~14256), phxPushActions, the pathBOverlays mirror — they likely drop `legs`.
- **1d Edit legs after publish** (owner changes their mind mid-shift). Like admin-cancel/`_pbEditRecipient`.
- **1e Swap + special-clinic** must support relay (today give/add only; clinic `range==='ตรวจสอบ'`
  disables the toggle; swap deferred).
- **1a Fuller name source** — `allPharmacistNames` (7227) = this-month schedule + `P2B._peopleNames`
  only; missing registered accounts + other months.
- **1c-disp / count** — clearer "who until when" (timeline/summary) + `renderBanner` count still
  tallies whole shifts (its own path, not getEffectiveData).

## ⚠️ GOTCHAS
- Relay flag OFF in production = zero impact; all relay work is safe to auto-deploy.
- `docs/DATA_MAP.md` was untracked at session start (not this session's work) — left alone.
- Stop hook does `clasp push` (→ GAS editor) but **NOT `git push`** — git is pushed manually.
- Harnesses live in the session scratchpad (not committed) — rebuildable from the VERIFIED list.
