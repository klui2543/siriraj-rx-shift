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

