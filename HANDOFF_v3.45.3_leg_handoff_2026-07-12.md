# HANDOFF — v3.45.3 leg-level ยก/แลก (relayleg "sticky note") — 2026-07-12

Branch **`main`**, tip **`10febe2`** (2 feature commits: `21731a6` + `10febe2`), pushed to origin +
clasp-pushed to the GAS editor. Continues `HANDOFF_v3.45.2_relay_2026-07-12.md` (ต่อเวร base).

Klui's ask this session (edit-flow thread):
> "ควรมีเมนูแลกเวร ยกเวร ขึ้นมาด้วยแม้กรณีที่เป็นไม้ต่อ โดยสลับเอาชื่อของคนอื่นเข้ามาแทนตำแหน่งของเรา
> กรณีที่สลับเวรก็เอาช่องไม้ของเราให้อีกฝ่าย และเอาเวรอีกฝ่ายให้เรา"

So: even a **ไม้ต่อ (relay leg)** must offer **ยกเวร / แลกเวร**, acting on **just that ไม้**.

---

## 🚀 DEPLOY (same gotcha, still bites)
`clasp push` (Stop hook) keeps the GAS **editor** current, but `/exec` serves a **pinned deployment
version**. **This needs a NEW deployment version** (or `/dev`) before Klui sees it live.
And relay stays behind **`window._relayEnabled`** — the per-device Settings toggle
**"🏃 โหมดต่อเวร (แบ่งไม้)"** must be **ON on the device you test** (default OFF).

---

## ✅ WHAT SHIPPED

**One decision needed Klui's call (AskUserQuestion): who may hand off a ไม้?**
He chose **"เจ้าของไม้ก็ได้ (sticky-note)"** — whoever CURRENTLY holds a ไม้ (or an admin) can pass
it on, **not only the shift owner**. So B, who received ไม้2 from A, can hand ไม้2 to C without
touching A's split. (The alternative — author-only — was declined.)

**The model — a `relayleg` "sticky note".** A new first-class action that rewrites the owner of
**ONE ไม้** of a master `relay`, **without moving the shift's ownership**. Think of the split as a
sheet of paper A wrote; B can't rewrite A's sheet (sync rule: you only push your OWN actions), but B
can stick a note on top — "ไม้2 → now C" — that everyone reads over the sheet.

Why it's safe and cheap:
- **Ownership never moves.** All three client strike engines (`OverlayManager.getUsedMap`,
  `PBOverlays.getUsedMap`, `buildGhostRows`) **and** the server `_phxApplyOverlaysGlobally` gate on
  action type — an unknown `relayleg` strikes nothing, ghosts nothing. **Proven by harness**
  (relayleg → empty used-map; a real `give` on the same key DOES strike, so the engine is live).
- **ZERO server change.** The note rides entirely on already-whitelisted overlay fields, so it
  survives publish→pull and propagates cross-user with the CURRENT GAS:
  - `action:'relayleg'`, `viewerName`=the actor, `shiftKey`=masterKey, `originalOwner`=fromOwner,
    `partnerName`=toOwner, and the leg **identity** in `legs[0]` =
    `{__relayleg, masterId, legStart, legEnd, legClinic, kind}` (legs passes through as an array).
- **Sync-legal for non-authors.** `viewerName` = the actor → `phxPushActions` pushes it under their
  own name. That's the whole reason B (not the master's author) can still record a handoff.

**Resolver** (`_relayLegOverrides` + `_relayApplyOverrides`, just above `_relayGather`):
- Collects notes from OverlayManager (own, incl. drafts) + pathBOverlays (published), dedups by id.
- Replays them onto a master's legs in **`createdAt` order**, matching a ไม้ by its **(start,end,
  clinic) window** (stable even if the author reorders legs via แก้ไม้), with a **`fromOwner` guard**
  (a note whose fromOwner ≠ the ไม้'s current holder = stale/duplicate → skipped). Chains B→C→D.
- Wired into `_relayGather` → **every** table / calendar / ICS / banner-count view shows the CURRENT
  ไม้ holder for free (they all read the expanded legs). Both timeline builders resolve via
  `_relayLegsFor` and show the hop as "current ← original".

**UI — the ไม้ menu** (`_relayOpenLegMenu`, opened by tapping a ไม้ row in edit mode, **table AND
the calendar cell-picker**):
| Button | Shown to |
|---|---|
| 🎁 ยกไม้ N ให้คนอื่น | the ไม้'s current holder, or admin |
| 🔄 แลกไม้ N กับเวรคนอื่น | the ไม้'s current holder, or admin |
| 🏃 แก้ไม้ทั้งหมด (ต่อเวร) | the split's author, or admin |
| ⚙️ จัดการทั้งเวร (ยก/สลับ/ยกเลิกแบ่ง) | the split's author, or admin |
| (info only + ยกเลิก) | a bystander |

- **ยกไม้** = `_lwwNamePicker` (known-names-only) → `_relayAuthorOverride(kind:'give')`.
- **แลกไม้** = reuse the swap picker (set `actionState.legSwap`, `confirmPickShift` branches to
  `_relayLegSwapCommit`) → author the note (my ไม้ → partner) **plus** a standard `add` (partner's
  whole shift → me, existing รับเวร machinery). Exactly Klui's "ไม้เราให้เขา, เวรเขาให้เรา".
- Both end in **`_relayLegConfirm`** (เก็บเป็นร่าง / 🌐 เผยแพร่เลย). Publish-now also publishes the
  **master split** if it's still a local draft, so a published note can't orphan.
- The round-11 "whole give/swap clears the split" behaviour is now **explicit** (`⚙️ จัดการทั้งเวร`),
  not the accidental default of tapping a ไม้. `_relayClearForShift` also drops this device's own
  notes for that master.
- Publish center (`renderPublishModal`) labels the note **ยกไม้ / แลกไม้** with the ไม้ window.

---

## 🧪 VERIFIED (all against the REAL shipped functions; harnesses in this session's scratchpad)
- `check_scripts` — 13 inline `<script>` blocks `node --check`, 0 fail.
- `relayleg_harness` **19/19** — base unchanged, give moves owner, chain B→C→D, stale-note guard,
  window-mismatch inert, other-master ignored, own+pb dedup, clinic open head/tail, clinic-flag
  mismatch inert, own-draft preview, malformed-note dropped.
- `relayleg_invariant` **5/5** — relayleg → empty used-map in BOTH client engines (master NOT
  struck) + sanity that a real `give` DOES strike (engines actually running).
- `relayleg_menu` **11/11** — button gating per role (leg owner / author / admin / bystander /
  no-leg fallback) on the real `_relayOpenLegMenu`.

Not headless-tested: the live DOM click-through (menu → picker → commit) needs the deployed GAS app
(`google.script.run`) — that's Klui's live test. The new modals are plain flex bottom-sheets with a
wrap-safe, ellipsizing header (designed to avoid the 375px h-scroll class of bug).

---

## ▶️ HOW TO LIVE-TEST (Klui)
1. **Cut a new GAS deployment version** (or `/dev`).
2. On the test device, Settings → **🏃 โหมดต่อเวร (แบ่งไม้) = ON**.
3. Split a shift (🏃 ต่อเวร), **เผยแพร่** it.
4. Enter edit mode (ดินสอ), **tap a ไม้** → try **🎁 ยกไม้** (pick a name) and **🔄 แลกไม้** (pick
   someone's shift). เผยแพร่เลย, then check the other person's device sees the ไม้ under the new holder.
5. Have that new holder **tap the same ไม้ and pass it on again** (chain) — this is the sticky-note
   scope you chose.

---

## ⏳ STILL DEFERRED (unchanged)
- **Fuller names (1a)** — `allPharmacistNames` misses registered accounts + other months.
- **PDF / รวม-table exports** (`_exportCalendarPDF_v2` / `_exportCalendarPNG_v2`) — still leg-blind +
  cross-month-blind (separate export paths; ICS already leg-aware).
- **Relay flag rollout** — still per-device + default OFF.
- **Bottom nav (3 tabs) + swap-flow view** — oldest deferred, unrelated to relay.
- Klui said last session he has **more edit-flow changes** parked — ask him to enumerate the rest.

## ⚠️ GOTCHAS (carried forward)
- `/exec` pinned-version gotcha (see DEPLOY) — remind him up front.
- Relay flag is per-device (Settings toggle).
- HEAD-detached hazard: always verify `## main...origin/main` after a push.
- `docs/DATA_MAP.md` still untracked (pre-existing, left alone).

## Commits this session
```
21731a6 v3.45.3 leg handoff — ยก/แลก ระดับไม้ (sticky-note override)
10febe2 v3.45.3 leg handoff pt2 — cell-picker ไม้ → leg menu (was: leg editor)
```
