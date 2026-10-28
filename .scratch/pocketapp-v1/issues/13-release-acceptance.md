# T13: ตรวจรับการใช้งานครบวงจรบน cloud

**Status:** ready-for-agent

**Published:** https://github.com/tanakron1748q/pocketapp/issues/14

## Parent

https://github.com/tanakron1748q/pocketapp/issues/1

## What to build

ผู้ใช้เปิดลิงก์จริงบนมือถือและ desktop แล้วใช้ flow ทั้งหมดร่วมกันได้ภายใต้แพ็กเกจฟรี

## Acceptance criteria

- [ ] ทดสอบบน Vercel/Neon จริงด้วย Google สองบัญชีและบัญชีเดิมข้ามอุปกรณ์ รวม login/logout การแยกข้อมูล และการกลับเข้าใช้หลังพัก
- [ ] ทำ flow รายการ หมวด รายการโปรด เงินคืน งบ Dashboard/เปรียบเทียบ และ CSV ต่อกันได้ โดยยอดเงินตรงกันทุกหน้าหลังแก้หรือลบข้อมูล
- [ ] ตรวจ navigation/form/list/chart บนมือถือและ desktop รวม empty/loading/validation/failure/expired-session states ของ flow ที่มีจริง
- [ ] เก็บผล E2E และตรวจ lint/typecheck/build รวมถึง callbacks/secrets/migrations ของ deployment ที่ใช้จริง
- [ ] ตรวจโควตา/การใช้งานที่คาดไว้ของ Free plans และบันทึกข้อจำกัดโดยไม่เปิดบริการเสียเงิน; เป็นการตรวจรวมเพิ่มเติม ไม่เลื่อนการทดสอบแต่ละ slice มาจบที่งานนี้

## Blocked by

- #5: https://github.com/tanakron1748q/pocketapp/issues/5
- #11: https://github.com/tanakron1748q/pocketapp/issues/11
- #12: https://github.com/tanakron1748q/pocketapp/issues/12
- #13: https://github.com/tanakron1748q/pocketapp/issues/13
