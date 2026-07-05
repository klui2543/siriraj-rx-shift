# Claude things

รวมทุกอย่างที่ Claude สร้างให้เกี่ยวกับ Siriraj Rx Shift

## ไฟล์ในนี้

| ไฟล์ | หน้าที่ |
|------|--------|
| **`HANDOFF_v3.40.md`** | **📌 อ่านไฟล์นี้ก่อน** ถ้ากลับมา session ใหม่ — สรุป Path B fix + TODO |
| `system_map.html` | เปิดใน browser เพื่อดู system map (25 sheets, 6 Firebase paths, 33 functions, flow chart) |
| `build_map.js` | Node.js script — อัปเดต system_map.html จาก MapA JSON |
| `diagnostics/` | เก็บไฟล์ JSON ของแต่ละครั้งที่ Run `devCheckOverlays` |

## Workflow อัปเดต

```bash
# 1. Sync GAS code ล่าสุด
cd C:\Users\Klui\siriraj-rx-shift
clasp pull

# 2. ใน GAS Editor → Run devCheckOverlays() → รอ log บอก Drive URL → ดาวน์โหลด JSON

# 3. เก็บ JSON ที่ downloaded ลงในโฟลเดอร์นี้
mv "C:/Users/Klui/Desktop/Download/MapA_diagnostic_XXXX.json" "./diagnostics/"

# 4. อัปเดต HTML
cd "C:/Users/Klui/Claude things"
node build_map.js ./diagnostics/MapA_diagnostic_XXXX.json

# 5. เปิด system_map.html ในเบราว์เซอร์
```

## ทำไมย้ายออกจาก siriraj-rx-shift/

`.clasp.json` ตั้งค่าให้ push ไฟล์ `.js` และ `.html` ทุกอันขึ้น Google Apps Script —
ถ้า `system_map.html` หรือ `build_map.js` อยู่ในโปรเจกต์นั้น `clasp push` จะพยายามอัปโหลดขึ้น GAS แล้วพัง

## Reference

- **Artifact URL** (view online): https://claude.ai/code/artifact/ee03a909-92fd-411e-837c-949d530ae94d
- **Sheet ID**: `1V1Fo4rEadSYfqLDc1sZEE-fRtZ4Je5_30_EAclO3KHM`
- **Firebase**: `siriraj-rx-shift-default-rtdb.asia-southeast1.firebasedatabase.app`
