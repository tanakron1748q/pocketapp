# T06: ใช้รายการโปรดช่วยกรอกก่อนยืนยันบันทึก

**Status:** ready-for-agent

**Published:** https://github.com/tanakron1748q/pocketapp/issues/7

## Parent

https://github.com/tanakron1748q/pocketapp/issues/1

## What to build

ผู้ใช้เก็บรายละเอียดที่ใช้บ่อยเป็นรายการโปรด เลือกเติมฟอร์ม ปรับข้อมูล แล้วกดบันทึกจริงได้

## Acceptance criteria

- [ ] สร้างรายการโปรดจากรายละเอียดที่กรอกบ่อยและเรียกใช้กับฟอร์มได้
- [ ] การเลือกเพียงเติม draft ไม่สร้าง Transaction และไม่ใช้วันที่เก่าเป็นวันที่ปัจจุบันโดยไม่ให้ตรวจ
- [ ] ผู้ใช้เปลี่ยนจำนวนเงินหรือรายละเอียดก่อนยืนยันได้; การยกเลิกไม่สร้างรายการ
- [ ] รายการโปรดเป็นส่วนตัว และการอ้างอิงหมวดต้องผ่านกติกาประเภทและสิทธิ์เดิม
- [ ] มี browser/HTTP tests ตรวจ prefill, การแก้ก่อน save, cancel และไม่สร้างรายการอัตโนมัติ

## Blocked by

- #3: https://github.com/tanakron1748q/pocketapp/issues/3
