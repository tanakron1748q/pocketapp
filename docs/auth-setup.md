# ตั้งค่า Google Login, Neon และ Vercel

สำหรับ issue #2 โค้ดใช้ Better Auth + Prisma 7 และ PostgreSQL ผ่าน `@prisma/adapter-pg` ทั้งบน Neon และฐานข้อมูลทดสอบใน Docker โดย Neon รองรับ PostgreSQL wire protocol ใช้ pooled URL สำหรับแอปและ direct URL สำหรับ migration

สถานะ ณ 28 ตุลาคม 2026: ทำโค้ดและชุดทดสอบอัตโนมัติแล้ว ยังไม่ได้สร้าง Neon/Google OAuth/Vercel และยังไม่ได้ตรวจ callback ด้วยบัญชี Google จริง ขั้นตอนด้านล่างเป็นงานที่ต้องทำก่อนตรวจรับบน cloud ไม่ใช่หลักฐานว่า deploy แล้ว

## 1. สร้างฐานข้อมูล Neon Free

1. สร้างโปรเจกต์ที่ [Neon Console](https://console.neon.tech) เลือก Free และ region ใกล้ deployment
2. แยกฐานข้อมูล development และ production เช่นคนละ branch ของ Neon อย่าใช้ข้อมูล production ในชุดทดสอบ
3. ใน Connect คัดลอก connection string แบบ pooled เป็น `DATABASE_URL` และแบบ direct เป็น `DATABASE_URL_UNPOOLED` รักษา TLS parameters ที่ Neon ให้มา
4. คัดลอก `.env.example` เป็น `.env` แล้วใส่ค่าของ development เฉพาะในเครื่อง ไฟล์ `.env` ถูก ignore แล้ว

## 2. สร้าง Google OAuth Web client

1. เปิด [Google Cloud Console](https://console.cloud.google.com) และสร้าง/เลือกโปรเจกต์
2. ตั้ง Google Auth Platform: Branding, Audience และ contact email ใช้ External หากต้องการให้คนอื่นใช้ได้
3. ระหว่างสถานะ Testing เพิ่ม Google ทั้งสองบัญชีที่จะตรวจรับใน Test users ก่อน การเปิดให้บุคคลทั่วไปใช้ต้องเปลี่ยน Publishing status ตามเงื่อนไขที่ Console แสดง
4. สร้าง OAuth client ชนิด **Web application** ใส่ Authorized JavaScript origins: `http://localhost:3000` และ origin HTTPS ของ production
5. ใส่ Authorized redirect URIs ให้ตรงทุกตัวอักษร:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://YOUR-PROJECT.vercel.app/api/auth/callback/google`
6. ใส่ Client ID/Client secret ใน `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` ของ `.env` อย่า commit หรือส่ง secrets ในแชต
7. ใช้สิทธิ์พื้นฐานสำหรับระบุตัวตนเท่านั้น แอปไม่ได้ขอสิทธิ์ Gmail, Drive หรือข้อมูลการเงิน

สร้าง auth secret ด้วย `openssl rand -base64 32` แล้วเก็บผลลัพธ์เป็น `BETTER_AUTH_SECRET` (อย่างน้อย 32 ตัวอักษร) ใช้คนละ secret ระหว่าง development กับ production และคงค่าเดิมข้าม deployment เพื่อให้ session และ token encryption ทำงานต่อได้

กำหนด `BETTER_AUTH_URL=http://localhost:3000` ในเครื่อง โดยไม่มี path หรือ slash ท้าย URL แอปกำหนด trusted origin จากค่านี้ ไม่รับ origin จาก request และใช้ Google account chooser ทุกครั้ง

## 3. เริ่มใช้งานในเครื่อง

```bash
pnpm install --frozen-lockfile
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm dev
```

เปิด `/login` แล้วกด Google Login ระบบจะกลับมาที่ `/dashboard` ซึ่งแสดงชื่อและอีเมลจาก session ใน PostgreSQL หากยังไม่มี credentials หน้า login จะแจ้งว่ายังไม่พร้อมและปิดปุ่มไว้ ไม่มี demo login

## 4. Deploy บน Vercel Hobby

1. สร้างโปรเจกต์ Hobby และ import repository นี้ ใช้ Next.js preset, Node.js 24 และ package manager ตาม `packageManager` ใน `package.json`
2. ใช้ install command `pnpm install --frozen-lockfile` และ build command `pnpm build` (สร้าง Prisma Client ให้อัตโนมัติ)
3. กำหนด Environment Variables ฝั่ง Production ทั้ง 6 ค่า: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` ใช้ฐานข้อมูล production จาก Neon และ `BETTER_AUTH_URL=https://YOUR-PROJECT.vercel.app`
4. ใช้ production direct URL รัน `pnpm db:migrate` จาก environment ที่ปลอดภัยก่อนเปิด deployment ใช้งานจริง คำสั่งนี้ใช้ migration ที่ commit ไว้ ไม่ใช้ `db push` และไม่รัน migration อัตโนมัติทุก preview build
5. ใส่ callback HTTPS ใน Google Console ให้ตรงกับ production domain แล้ว deploy/redeploy หลังเปลี่ยน env
6. อย่าส่ง secrets production ไปยัง preview ของโค้ดที่ไม่เชื่อถือ หากต้องการทดสอบ preview ให้ใช้ฐานข้อมูลแยกและ domain คงที่ที่ลงทะเบียนใน Google แทนการเปิด wildcard origin
7. ตรวจใน dashboard ว่ายังเป็น Neon Free และ Vercel Hobby และดู Usage หลังทดสอบ ไม่เปิด add-on หรืออัปเกรดที่คิดเงิน

ใช้ domain ที่ Vercel ให้มาก่อนได้ ไม่จำเป็นต้องซื้อ domain สำหรับ issue นี้

## 5. ชุดทดสอบอัตโนมัติ

ต้องมี Docker ที่ทำงานอยู่ และติดตั้ง Chromium ครั้งแรก:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

คำสั่งสร้าง PostgreSQL 18 container ใหม่ที่ bind เฉพาะ loopback ด้วย port ชั่วคราว รัน migrations และ production build จากนั้นทดสอบผ่าน browser/HTTP ทั้ง desktop และ mobile และลบ container หลังจบ ไม่ใช้ URL ฐานข้อมูลจาก `.env` และไม่รับฐานข้อมูล production เข้าชุดทดสอบ

ชุดทดสอบสร้าง User/Google Account และ signed session fixtures จาก process ทดสอบโดยตรง ไม่มี endpoint สำหรับสร้าง session ทดสอบในแอป ครอบคลุม:

- ผู้ไม่ login เข้าได้เฉพาะหน้าสาธารณะ และ `/api/me` ตอบ 401
- redirect ไป Google พร้อม account chooser, state, PKCE และ callback ของ localhost; ปฏิเสธ callback state ปลอม
- session ของผู้ใช้สองคนแยกกัน และ session อุปกรณ์ที่สองของ User เดิมได้ User ID เดิม
- caller ส่ง `userId` ของคนอื่นมาก็ไม่เปลี่ยนเจ้าของข้อมูล; response ไม่มี session token หรือ Google token
- logout, replay cookie ที่ถูก revoke, สลับบัญชี, ย้อนกลับ และแท็บอื่นที่เปิดอยู่
- cookie หมดอายุ/ปลอม, cross-origin logout, ไม่มี password/demo endpoint
- ข้อผิดพลาด login และการลองใหม่ รวมถึงหน้าจอที่ไม่ล้น viewport

Fixtures ไม่ได้พิสูจน์การแลก authorization code หรือการจับคู่ Google identity จริง ต้องทำขั้นตอนตรวจรับถัดไปแยกต่างหาก ห้ามนำ secret/cookie จาก test ไปใช้กับระบบจริง

## 6. ตรวจรับ OAuth จริงก่อนปิด issue

ทำรายการนี้ทั้ง `http://localhost:3000` และ production HTTPS โดยใช้ Google จริงสองบัญชี ห้ามแนบ cookie/token หรือ connection string ลง issue

- [ ] กด Google Login ผ่าน consent/account chooser แล้ว callback สำเร็จ เห็นชื่อ/อีเมลของบัญชี A ที่ `/dashboard`
- [ ] เปิด `/api/me` ใน browser เดิม ได้เฉพาะ `{ user: { id, name, email, image } }` ของ A และบันทึก User ID ไว้เทียบ
- [ ] ใช้มือถือหรือ browser profile อีกอัน login ด้วย Google A ได้ User ID เดิม และมี session แยกอีกแถวใน Neon
- [ ] ใช้ browser profile แยก login Google B ได้ User ID ต่างจาก A และเห็นเฉพาะตัวตน B
- [ ] ตรวจ Neon ว่ามี users, accounts (`providerId=google`) และ sessions จริง โดยแต่ละ Google subject มี account เดียว ไม่คัดลอก token ออกมา
- [ ] กดออกจากระบบแล้ว `/api/me` ตอบ 401, `/dashboard` กลับ `/login` และย้อนกลับไม่เห็นบัญชีเก่า ส่วนอุปกรณ์อื่นยังใช้ session ของตนได้
- [ ] กดสลับบัญชีแล้วเลือก B เห็น B เท่านั้น รวมถึงแท็บเดิมที่เปิดไว้
- [ ] ยกเลิก consent/ปฏิเสธสิทธิ์แล้วแอปแสดงข้อผิดพลาดที่ลองใหม่ได้
- [ ] ตรวจ cookie บน HTTPS ว่าเป็น HttpOnly, Secure และ SameSite=Lax และ response ส่วนตัวมี `Cache-Control: private, no-store`
- [ ] บันทึกวันที่, deployment URL, ผล localhost/cloud และผลบัญชี A/B โดยปกปิดข้อมูลส่วนตัว จากนั้นจึงพิจารณาว่า issue ผ่านครบ

หากเจอ `redirect_uri_mismatch` ตรวจ origin, port และ callback ให้ตรงกัน หากเจอ 401 ให้ตรวจวันหมดอายุของ session หากได้หน้าระบบเชื่อมต่อไม่ได้ ให้ตรวจ environment และ Neon connectivity จาก server logs โดยไม่เผยแพร่ secrets

## ขอบเขตของ private entry points

`/dashboard` ตรวจ session ใน server page ทุก request และ client ตรวจ session ซ้ำก่อนแสดงตัวตน `/api/me` ตรวจ session ของ request โดยตรง ไม่เชื่อ `userId` จาก query string ไม่มี shared user cache และปิด Better Auth cookie cache เพื่อให้ revoked session ถูกปฏิเสธทันที

`/api/categories`, `/api/transactions` และ `/api/transactions/[id]` เรียก `getCurrentSession()` ภายในแต่ละ entry point และ scope ข้อมูลด้วย `session.user.id` เช่นกัน เมื่อเพิ่ม API/Server Action ใหม่ต้องใช้หลักเดียวกัน การซ่อนปุ่มหรือป้องกันที่ layout อย่างเดียวไม่เพียงพอ ดูขอบเขตการเพิ่ม/ดู/แก้ไข/ลบรายการใน [คู่มือรายการ](transactions.md) ส่วนการลบบัญชีอยู่ใน issue ถัดไป

## เอกสารอ้างอิง

- [Better Auth: Next.js](https://better-auth.com/docs/integrations/next), [Prisma adapter](https://better-auth.com/docs/adapters/prisma), [Google](https://better-auth.com/docs/authentication/google)
- [Neon plans](https://neon.com/docs/introduction/plans), [Vercel Hobby](https://vercel.com/docs/plans/hobby) — ตรวจเงื่อนไขและ quota ใน console อีกครั้งตอน provisioning
