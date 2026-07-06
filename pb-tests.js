// ═══════════════════════════════════════════════════════════════════
//  Path B / Bilateral Overlay — Test Harness
//  วิธีใช้:
//    1. เปิด webapp (deployed หรือ local)
//    2. เลือกเดือนใดๆ ที่มีข้อมูล (จะ mock override ชั่วคราว)
//    3. เปิด F12 → Console → paste ไฟล์นี้ทั้งไฟล์
//    4. รัน:   PBTest.runAll()
//    5. หลัง test:  PBTest.restore()   ← สำคัญมาก คืนข้อมูลจริง
//
//  ทดสอบเฉพาะ pure functions (buildGhostRows, PBOverlays.*, getEffectiveData)
//  ไม่กระทบ UI ระหว่างรัน (ไม่มี triggerUpdate)
// ═══════════════════════════════════════════════════════════════════

(function(){
  if (typeof window === 'undefined') return console.error('Run in browser');
  if (typeof buildGhostRows !== 'function' || typeof PBOverlays === 'undefined') {
    return console.error('❌ Not on the app page — buildGhostRows / PBOverlays missing');
  }

  // ─── Framework ────────────────────────────────────────────────
  const results = [];
  let curTest = '';
  function assert(cond, msg) {
    const rec = { test: curTest, ok: !!cond, msg };
    results.push(rec);
    console[cond ? 'log' : 'error']((cond ? '  ✅' : '  ❌') + ' ' + msg);
  }
  function group(name, fn) {
    curTest = name;
    console.group('🧪 ' + name);
    try { fn(); } catch (e) { assert(false, 'THREW: ' + e.message + '\n' + e.stack); }
    console.groupEnd();
  }

  // ─── Snapshot & restore ─────────────────────────────────────────
  let _snap = null;
  function snapshot() {
    _snap = {
      pb: JSON.parse(JSON.stringify(pathBOverlays || [])),
      raw: JSON.parse(JSON.stringify(rawData || []))
    };
  }
  function restore() {
    if (!_snap) return console.warn('No snapshot to restore');
    pathBOverlays = _snap.pb;
    rawData = _snap.raw;
    if (typeof invalidateGhostCache === 'function') invalidateGhostCache();
    if (typeof _shiftKeyIndex !== 'undefined') { _shiftKeyIndex = null; _shiftKeyIndexFor = null; }
    if (typeof triggerUpdate === 'function') triggerUpdate();
    console.log('✅ Restored real data');
  }
  function reset() {
    // Fresh state between tests — no residue
    pathBOverlays = [];
    rawData = [];
    if (typeof invalidateGhostCache === 'function') invalidateGhostCache();
    if (typeof _shiftKeyIndex !== 'undefined') { _shiftKeyIndex = null; _shiftKeyIndexFor = null; }
  }

  // ─── Mock builders ──────────────────────────────────────────────
  let _uid = 0;
  function mkId(tag) { return 'ovl_TEST_' + (tag || '') + '_' + (++_uid); }
  function mkShift(name, date, pos, range, room) {
    return {
      name: name,
      date: date,
      pos: pos,
      range: range || '10:00-18:00',
      room: room || '103',
      shift: 'รอบ 1'
    };
  }
  function mkKey(s) { return makeShiftKey(s); }
  function ovl(x) {
    return Object.assign({
      actionId: mkId(x.action || 'x'),
      viewerName: '',
      action: 'give',
      shiftKey: '',
      partnerShiftKey: '',
      partnerName: '',
      originalOwner: '',
      createdAt: new Date(2026, 6, 1).toISOString()
    }, x);
  }
  function has(arr, pred) { return arr.some(pred); }
  function findGhost(arr, name, pos) {
    return arr.find(g => g.name === name && g.pos === pos);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SCENARIOS
  // ═══════════════════════════════════════════════════════════════════
  const scenarios = {

    /* Test 1: 4-step chain A→B→C→D→E (all gives)
       Verifies chain resolver walks 4 hops.
       Every intermediate recipient should get a bilateral ghost. */
    longChainGive: function () {
      reset();
      const shift = mkShift('Alpha', '01/07 (พ.)', 'MOCK1');
      rawData = [shift];
      const kA = mkKey(shift);
      const g1 = ovl({ viewerName:'Alpha', action:'give', shiftKey:kA,               partnerName:'Beta',  originalOwner:'Alpha' });
      const g2 = ovl({ viewerName:'Beta',  action:'give', shiftKey:'_g_'+g1.actionId, partnerName:'Gamma', originalOwner:'Alpha' });
      const g3 = ovl({ viewerName:'Gamma', action:'give', shiftKey:'_g_'+g2.actionId, partnerName:'Delta', originalOwner:'Alpha' });
      const g4 = ovl({ viewerName:'Delta', action:'give', shiftKey:'_g_'+g3.actionId, partnerName:'Epsilon', originalOwner:'Alpha' });
      pathBOverlays = [g1, g2, g3, g4];
      invalidateGhostCache();

      const chain = PBOverlays.buildChain(g1.actionId);
      assert(chain && chain.length === 4, 'chain has 4 steps (got ' + (chain && chain.length) + ')');

      const ep = PBOverlays.getChainEndpoints(chain);
      assert(ep.last === 'Epsilon', 'endpoint = Epsilon (got "' + ep.last + '")');

      // Each intermediate + final recipient gets ghost
      ['Beta','Gamma','Delta','Epsilon'].forEach(function(name) {
        const gs = buildGhostRows(rawData, 'MOCK', name);
        const g = findGhost(gs, name, 'MOCK1');
        assert(!!g, name + ' has bilateral ghost of MOCK1');
      });

      // Alpha (original) shouldn't get a ghost (they gave it away)
      const alphaGhosts = buildGhostRows(rawData, 'MOCK', 'Alpha');
      assert(!findGhost(alphaGhosts, 'Alpha', 'MOCK1'), 'Alpha does NOT get ghost (they gave)');
    },

    /* Test 2: Swap in middle of chain
       Alpha give→Beta, Beta swap MOCK1↔MOCK2 with Gamma, Gamma give→Delta
       For Alpha's row MOCK1: after chain, MOCK1 should end up with Delta */
    swapInMiddleOfChain: function () {
      reset();
      const sA = mkShift('Alpha', '01/07 (พ.)', 'MOCK1');   // Alpha's original
      const sG = mkShift('Gamma', '02/07 (พฤ.)', 'MOCK2');  // Gamma's original
      rawData = [sA, sG];
      const kA = mkKey(sA), kG = mkKey(sG);

      const g1 = ovl({ viewerName:'Alpha', action:'give', shiftKey:kA, partnerName:'Beta', originalOwner:'Alpha' });
      const g2 = ovl({ viewerName:'Beta',  action:'swap',
                       shiftKey:'_g_'+g1.actionId, partnerShiftKey:kG,
                       partnerName:'Gamma', originalOwner:'Beta' });
      const g3 = ovl({ viewerName:'Gamma', action:'give',
                       shiftKey:'_g_'+g2.actionId, partnerName:'Delta',
                       originalOwner:'Alpha' });
      pathBOverlays = [g1, g2, g3];
      invalidateGhostCache();

      const chain = PBOverlays.buildChain(g1.actionId);
      assert(chain && chain.length === 3, 'chain has 3 steps');

      const ep = PBOverlays.getChainEndpoints(chain);
      assert(ep.last === 'Delta', 'MOCK1 endpoint = Delta (got "' + ep.last + '")');

      // Delta should have MOCK1 as bilateral ghost
      const dGhosts = buildGhostRows(rawData, 'MOCK', 'Delta');
      assert(!!findGhost(dGhosts, 'Delta', 'MOCK1'), 'Delta has MOCK1 ghost via chain');

      // Beta received Gamma's MOCK2 through swap (partner side)
      const bGhosts = buildGhostRows(rawData, 'MOCK', 'Beta');
      assert(!!findGhost(bGhosts, 'Beta', 'MOCK2'), 'Beta has MOCK2 ghost (swap partner side)');
    },

    /* Test 3: Bilateral variations — same visual result whether A recorded, B recorded, or both */
    bilateralRecordingVariants: function () {
      const shift = mkShift('Alpha', '01/07 (พ.)', 'MOCK1');
      const kA = mkKey(shift);

      // 3a: only Alpha recorded give
      reset(); rawData = [shift];
      pathBOverlays = [ovl({ viewerName:'Alpha', action:'give', shiftKey:kA, partnerName:'Beta', originalOwner:'Alpha' })];
      invalidateGhostCache();
      let gs = buildGhostRows(rawData, 'MOCK', 'Beta');
      assert(!!findGhost(gs, 'Beta', 'MOCK1'), '3a: Alpha-only recorded → Beta gets bilateral ghost');

      // 3b: only Beta recorded add
      reset(); rawData = [shift];
      pathBOverlays = [ovl({ viewerName:'Beta', action:'add', shiftKey:kA, partnerName:'Alpha', originalOwner:'Alpha' })];
      invalidateGhostCache();
      gs = buildGhostRows(rawData, 'MOCK', 'Beta');
      assert(!!findGhost(gs, 'Beta', 'MOCK1'), '3b: Beta-only recorded add → Beta gets own ghost');

      // 3c: both recorded — should NOT double-count
      reset(); rawData = [shift];
      pathBOverlays = [
        ovl({ viewerName:'Alpha', action:'give', shiftKey:kA, partnerName:'Beta', originalOwner:'Alpha' }),
        ovl({ viewerName:'Beta',  action:'add',  shiftKey:kA, partnerName:'Alpha', originalOwner:'Alpha' })
      ];
      invalidateGhostCache();
      gs = buildGhostRows(rawData, 'MOCK', 'Beta');
      const dupes = gs.filter(g => g.name === 'Beta' && g.pos === 'MOCK1');
      assert(dupes.length === 1, '3c: both recorded → dedup to 1 ghost (got ' + dupes.length + ')');
    },

    /* Test 4: Multi-swap colors distinct + deterministic */
    multiSwapColors: function () {
      reset();
      const s1 = mkShift('A', '01/07 (พ.)', 'M1');
      const s2 = mkShift('B', '02/07 (พฤ.)', 'M2');
      const s3 = mkShift('C', '03/07 (ศ.)', 'M3');
      const s4 = mkShift('D', '04/07 (ส.)', 'M4');
      const s5 = mkShift('E', '05/07 (อา.)', 'M5');
      const s6 = mkShift('F', '06/07 (จ.)', 'M6');
      rawData = [s1, s2, s3, s4, s5, s6];
      const sw1 = ovl({ viewerName:'A', action:'swap', shiftKey:mkKey(s1), partnerShiftKey:mkKey(s2), partnerName:'B', originalOwner:'A' });
      const sw2 = ovl({ viewerName:'C', action:'swap', shiftKey:mkKey(s3), partnerShiftKey:mkKey(s4), partnerName:'D', originalOwner:'C' });
      const sw3 = ovl({ viewerName:'E', action:'swap', shiftKey:mkKey(s5), partnerShiftKey:mkKey(s6), partnerName:'F', originalOwner:'E' });
      pathBOverlays = [sw1, sw2, sw3];
      invalidateGhostCache();

      const c1 = PBOverlays.getSwapColor(sw1.actionId);
      const c2 = PBOverlays.getSwapColor(sw2.actionId);
      const c3 = PBOverlays.getSwapColor(sw3.actionId);
      assert(c1 && c2 && c3, 'all swaps assigned colors');
      assert(c1 !== c2 && c2 !== c3 && c1 !== c3, 'colors are distinct (' + c1 + ',' + c2 + ',' + c3 + ')');

      // Determinism: calling twice returns same
      const c1b = PBOverlays.getSwapColor(sw1.actionId);
      assert(c1 === c1b, 'color deterministic');
    },

    /* Test 5: swap partner side endpoint (v3.42.9 regression) */
    swapPartnerSideEndpoint: function () {
      reset();
      const sN = mkShift('Norapol', '01/07 (พ.)', 'NMS-24');
      const sO = mkShift('Asamaporn', '01/07 (พ.)', 'O11');
      rawData = [sN, sO];
      const sw = ovl({
        viewerName:'Norapol', action:'swap',
        shiftKey: mkKey(sN), partnerShiftKey: mkKey(sO),
        partnerName:'Asamaporn', originalOwner:'Norapol'
      });
      pathBOverlays = [sw];
      invalidateGhostCache();

      const chain = PBOverlays.buildChain(sw.actionId);

      // Actor side (Norapol's row) — after swap goes to partner
      const epActor = PBOverlays.getChainEndpoints(chain, 'actor');
      assert(epActor.last === 'Asamaporn', 'actor side (Norapol\'s NMS-24) → Asamaporn (got "' + epActor.last + '")');

      // Partner side (Asamaporn's row) — after swap goes to actor
      const epPartner = PBOverlays.getChainEndpoints(chain, 'partner');
      assert(epPartner.last === 'Norapol', 'partner side (Asamaporn\'s O11) → Norapol (got "' + epPartner.last + '")');

      // Backwards compat: no pbSide arg → defaults to partnerName (actor side)
      const epLegacy = PBOverlays.getChainEndpoints(chain);
      assert(epLegacy.last === 'Asamaporn', 'no pbSide → default actor side');
    },

    /* Test 6: Circular chain safety — A give→B, B give→A. Should not loop. */
    circularChain: function () {
      reset();
      const sA = mkShift('Alpha', '01/07 (พ.)', 'MOCK1');
      rawData = [sA];
      const g1 = ovl({ viewerName:'Alpha', action:'give', shiftKey:mkKey(sA), partnerName:'Beta', originalOwner:'Alpha' });
      // Beta gives back to Alpha via a "give" whose shiftKey references g1's ghost
      const g2 = ovl({ viewerName:'Beta',  action:'give', shiftKey:'_g_'+g1.actionId, partnerName:'Alpha', originalOwner:'Alpha' });
      pathBOverlays = [g1, g2];
      invalidateGhostCache();

      // Chain build should complete without infinite loop
      const t0 = Date.now();
      const chain = PBOverlays.buildChain(g1.actionId);
      const dt = Date.now() - t0;
      assert(dt < 500, 'buildChain returns within 500ms (got ' + dt + 'ms)');
      assert(chain && chain.length === 2, 'chain length = 2');

      // Alpha should get the ghost back
      const ghosts = buildGhostRows(rawData, 'MOCK', 'Alpha');
      assert(!!findGhost(ghosts, 'Alpha', 'MOCK1'), 'Alpha receives MOCK1 back (bilateral via g2)');
    },

    /* Test 7: getEffectiveData no-filter (room view) — all recipients get ghosts */
    getEffectiveDataAllRecipients: function () {
      reset();
      const sA = mkShift('Actor',   '01/07 (พ.)', 'M1');
      const sP = mkShift('Partner', '01/07 (พ.)', 'M2');
      rawData = [sA, sP];
      const sw = ovl({ viewerName:'Actor', action:'swap',
                       shiftKey: mkKey(sA), partnerShiftKey: mkKey(sP),
                       partnerName:'Partner', originalOwner:'Actor' });
      pathBOverlays = [sw];
      invalidateGhostCache();

      // Clear name filter — force null viewer
      const _origSelected = window.selectedPharmacists;
      window.selectedPharmacists = [];
      try {
        const eff = getEffectiveData();
        const ghostActor   = eff.find(x => x._ghost && x.name === 'Actor'   && x.pos === 'M2');
        const ghostPartner = eff.find(x => x._ghost && x.name === 'Partner' && x.pos === 'M1');
        assert(!!ghostActor,   'Actor received Partner\'s M2 as ghost in no-filter view');
        assert(!!ghostPartner, 'Partner received Actor\'s M1 as ghost in no-filter view');
      } finally {
        window.selectedPharmacists = _origSelected;
      }
    },

    /* Test 8: _combinedUsedMap union works */
    combinedUsedMap: function () {
      reset();
      const sN = mkShift('Norapol',   '01/07 (พ.)', 'NMS-24');
      const sO = mkShift('Asamaporn', '01/07 (พ.)', 'O11');
      rawData = [sN, sO];
      const sw = ovl({ viewerName:'Norapol', action:'swap',
                       shiftKey: mkKey(sN), partnerShiftKey: mkKey(sO),
                       partnerName:'Asamaporn', originalOwner:'Norapol' });
      pathBOverlays = [sw];
      invalidateGhostCache();

      // Query for Asamaporn (bilateral — she didn't record)
      const cm = _combinedUsedMap('MOCK', 'Asamaporn');
      assert(!!cm[mkKey(sO)], 'combined map covers Asamaporn\'s struck O11');
      assert(!!cm[mkKey(sN)], 'combined map covers Norapol\'s struck NMS-24 too');

      // Query for Norapol
      const cmN = _combinedUsedMap('MOCK', 'Norapol');
      assert(!!cmN[mkKey(sN)], 'combined map covers Norapol\'s own struck NMS-24');
    },

    /* Test 9: False conflict — struck row shouldn't count as active for ghost overlap detection */
    noFalseConflictWithStruck: function () {
      reset();
      // Asamaporn owns O11 (overlaps NMS-24 time). Swaps O11 for NMS-24. Now O11 is struck; NMS-24 is ghost.
      // Ghost NMS-24 should NOT be flagged as overlapping with the now-inactive O11.
      const sN = mkShift('Norapol',   '01/07 (พ.)', 'NMS-24', '02:30-08:30');
      const sO = mkShift('Asamaporn', '01/07 (พ.)', 'O11',    '02:30-08:30');
      rawData = [sN, sO];
      const sw = ovl({ viewerName:'Norapol', action:'swap',
                       shiftKey: mkKey(sN), partnerShiftKey: mkKey(sO),
                       partnerName:'Asamaporn', originalOwner:'Norapol' });
      pathBOverlays = [sw];
      invalidateGhostCache();

      const ghosts = buildGhostRows(rawData, 'MOCK', 'Asamaporn');
      const nmGhost = findGhost(ghosts, 'Asamaporn', 'NMS-24');
      assert(!!nmGhost, 'Asamaporn has NMS-24 ghost');
      assert(nmGhost._conflict !== 'overlap', 'NMS-24 ghost NOT flagged overlap with struck O11 (got _conflict=' + nmGhost._conflict + ')');
    },

    /* Test 10: getSwapColor identical across viewers (deterministic global order) */
    swapColorConsistency: function () {
      reset();
      const s1 = mkShift('A', '01/07 (พ.)', 'M1');
      const s2 = mkShift('B', '02/07 (พฤ.)', 'M2');
      rawData = [s1, s2];
      const sw = ovl({ viewerName:'A', action:'swap',
                       shiftKey:mkKey(s1), partnerShiftKey:mkKey(s2),
                       partnerName:'B', originalOwner:'A' });
      pathBOverlays = [sw];
      invalidateGhostCache();

      // Simulate 3 viewers using PBOverlays (deterministic → same color)
      const cA = PBOverlays.getSwapColor(sw.actionId);
      const cB = PBOverlays.getSwapColor(sw.actionId);
      const cAnon = PBOverlays.getSwapColor(sw.actionId);
      assert(cA === cB && cB === cAnon, 'color same for all viewers');
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  //  Runner
  // ═══════════════════════════════════════════════════════════════════
  function runAll() {
    snapshot();
    results.length = 0;
    console.log('%c🧪 PB Tests starting — real data snapshotted', 'font-weight:bold;color:#3b82f6');
    Object.keys(scenarios).forEach(k => group(k, scenarios[k]));
    const pass = results.filter(r => r.ok).length;
    const fail = results.length - pass;
    const style = fail === 0 ? 'color:#22c55e;font-weight:bold' : 'color:#dc2626;font-weight:bold';
    console.log('%c═══ SUMMARY: ' + pass + '/' + results.length + ' PASSED ' + (fail ? '(❌ ' + fail + ' failed)' : '(all green)') + ' ═══', style);
    if (fail > 0) {
      console.error('Failed cases:');
      results.filter(r => !r.ok).forEach(r => console.error('  [' + r.test + '] ' + r.msg));
    }
    console.log('%c💡 Run PBTest.restore() to revert to real data', 'color:#f59e0b');
    return { pass: pass, fail: fail, total: results.length };
  }

  window.PBTest = {
    runAll: runAll,
    restore: restore,
    snapshot: snapshot,
    scenarios: scenarios,
    results: results,
    // Utilities exposed so Klui can build custom tests
    mkShift: mkShift, mkKey: mkKey, ovl: ovl
  };
  console.log('%c🧪 PBTest loaded. Run: PBTest.runAll()', 'font-weight:bold;color:#3b82f6');
})();
