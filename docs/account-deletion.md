# ลบบัญชีแอป (Issue #13)

เปิด **ตั้งค่าบัญชี** จากพื้นที่ส่วนตัว เลือก **ยืนยัน Google เพื่อลบบัญชี** แล้วเลือก Google บัญชีเดิมและยืนยัน consent ใหม่ เมื่อกลับมาจึงพิมพ์ `ลบบัญชีของฉัน` และกด **ลบบัญชีถาวร** ได้ การยืนยัน Google ยังไม่ลบข้อมูล และปุ่มยกเลิกเพิกถอนหลักฐานก่อนกลับพื้นที่ส่วนตัว

ลบถาวรเฉพาะบัญชีแอปและข้อมูลทั้งหมด: Google Account mapping ในแอป หมวด รายรับ/รายจ่าย เงินคืน รายการโปรด งบ และ sessions ทุกอุปกรณ์ บัญชี Google จริงและข้อมูลของ User อื่นยังอยู่ หาก login Google เดิมภายหลังจะได้บัญชีแอปใหม่ที่ไม่มีข้อมูลเก่า

## การตั้งค่าเพิ่มเติม

เพิ่ม Authorized redirect URI ใน Google OAuth client ทั้ง localhost และ production:

```
http://localhost:3000/api/account/verification/callback
https://YOUR-PROJECT.vercel.app/api/account/verification/callback
```

ใช้ OAuth client เดียวกับ login และ origin ตรงกับ `BETTER_AUTH_URL` รัน `pnpm db:migrate` ก่อน deploy โค้ดนี้ เพื่อเพิ่ม `deletion_verifications` ไม่ต้องมี environment หรือ paid service ใหม่

## ขอบเขตความปลอดภัย

- Session เดิม แม้เพิ่ง login ยังลบบัญชีไม่ได้ และ Better Auth built-in delete-user ไม่ได้เปิดใช้งาน
- เริ่มด้วย same-origin POST `/api/account/verification` เพื่อสร้าง state, nonce และ PKCE แบบ S256 อายุ 5 นาที ใช้ HttpOnly SameSite=Lax cookie (Secure และ `__Host-` บน HTTPS)
- Google แสดง `prompt=consent select_account` บังคับ consent และเลือกบัญชีอีกครั้ง นี่คือการยืนยัน identity ใหม่ผ่าน OAuth ไม่รับรองว่าจะถามรหัสผ่าน Google เสมอ
- Callback แลก code ฝั่ง server และใช้ jose ตรวจ RS256 signature จาก Google JWKS, issuer, audience, expiration, อายุ token, nonce และ `sub` ให้ตรง Account เดิม ไม่เทียบแค่อีเมลและไม่สร้าง/สลับ User
- Claim callback ก่อนเรียก Google เพื่อกัน replay; ยกเลิก/เริ่มใหม่ขณะรอ Google ทำให้ callback เก่ายืนยันไม่ได้
- หลักฐานผูกกับ live session ของอุปกรณ์ที่เริ่มเท่านั้น ไม่ส่ง token ให้ JavaScript และไม่เก็บ Google token จาก flow นี้ ใช้ได้ครั้งเดียวและหมดอายุตามเวลาเริ่มต้น
- DELETE `/api/account` ต้อง same-origin, JSON ที่มีเฉพาะ `confirmation` ตรงข้อความทุกตัว และหลักฐาน Google ที่ยังไม่หมดอายุ ตรวจ session/identity อีกครั้งและ consume proof กับ DELETE User ใน transaction เดียว PostgreSQL cascade ทุกข้อมูลและ sessions หรือ rollback ทั้งหมด
- Cookie เก่าบนอุปกรณ์อื่นใช้ต่อไม่ได้ เพราะทุก private entry point ตรวจ session กับฐานข้อมูลโดยปิด cookie cache
- DELETE `/api/account/verification` ยกเลิกหลักฐาน; GET คืนเพียงสถานะและวันหมดอายุ ทุก response ส่วนตัวเป็น `private, no-store`

แนวทาง provider และการตรวจ ID token: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [jose jwtVerify](https://github.com/panva/jose/blob/main/docs/jwt/verify/functions/jwtVerify.md)

## การทดสอบอัตโนมัติ

`pnpm test:e2e account-deletion` ใช้ production server กับ PostgreSQL แยก ตรวจ browser ทั้ง desktop/mobile และ HTTP ครอบคลุม session เดิม, anonymous, origin ปลอม, proof ปลอม, Google ต่างบัญชี, nonce/issuer/audience/signature/expiration ผิด, provider ล้มเหลว, consent ยกเลิก, state ผิด, proof หมดอายุ, proof ข้าม session, ยกเลิกรวมระหว่าง callback, ข้อความยืนยัน, การลบข้อมูลครบและ session replay, และ User B ยังอยู่

Google fixture ถูก preload เฉพาะ process ของ Playwright และตรวจ URL ฐานข้อมูลแยกก่อนเริ่ม ไม่ได้ import เข้าตัวแอป ไม่มี endpoint หรือ environment switch ใน production เพื่อปลอม Google fixture แลก code กับ ID token ที่ลงลายเซ็นจริงด้วย test key และยังผ่านตัวตรวจ JWT จริงของแอป แต่ไม่ได้พิสูจน์ Google จริง

## ตรวจรับ Google จริง (ยังต้องทำก่อนปิด issue)

ใช้บัญชีทดสอบที่ยอมลบข้อมูลได้จริง ตรวจ localhost และ production แยกกัน บันทึก URL, deployment commit, วันเวลาไทย และผลโดยไม่แนบ secrets/cookies/tokens:

- [ ] เปิดบัญชี A สองอุปกรณ์ และ B อีก profile มีข้อมูลทุกชนิดทั้ง A/B
- [ ] กดเริ่มแล้ว Google แสดง account chooser/consent ใหม่; ยกเลิกแล้วข้อมูล A อยู่ครบ
- [ ] เริ่มใหม่ เลือก B: แอปยังเป็น A แสดงยืนยันไม่สำเร็จ และลบไม่ได้
- [ ] เลือก A: กลับหน้าตั้งค่าและยังไม่ลบจนกว่าจะพิมพ์ข้อความตรงและกดปุ่ม
- [ ] ยกเลิกหลังยืนยัน หรือรอเกิน 5 นาทีแล้วลบไม่ได้ ต้องเริ่มใหม่
- [ ] ยืนยัน A ใหม่แล้วลบ: กลับหน้าแรก, private API ทุก session A ตอบ 401, ย้อนกลับ/refresh เข้าหน้าส่วนตัวไม่ได้
- [ ] ตรวจฐานข้อมูลว่าไม่มีแถวของ A ทุกชนิดรวม sessions/proofs และ B ยังเปิด/แก้ข้อมูลได้
- [ ] บัญชี Google A ยังเข้า Google ได้; login แอปใหม่สร้างบัญชีว่าง ไม่กู้ข้อมูลเก่า

สถานะ: มีโค้ดและ automated checks; ไม่ถือว่า real-Google/cloud acceptance ผ่านจาก fixtures
