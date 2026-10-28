## Problem Statement

ผู้ใช้ต้องการบันทึกรายรับและรายจ่ายส่วนตัวได้สะดวกทั้งมือถือและ desktop และตอบได้ว่าแต่ละเดือนมีรายรับ รายจ่ายสุทธิ เงินเหลือประจำเดือน และรายจ่ายแต่ละหมวดเท่าไร ปัจจุบันยังไม่มีระบบที่บันทึกข้อมูลเหล่านี้พร้อมงบรายเดือนและประวัติเงินคืนตามกติกาที่ตกลงกัน

ข้อมูลการเงินต้องเป็นส่วนตัว ผู้ใช้แต่ละบัญชี Google ต้องเข้าถึงได้เฉพาะข้อมูลของตนเอง และใช้บัญชีเดิมข้ามอุปกรณ์แล้วเห็นข้อมูลชุดเดียวกัน ระบบเริ่มจากเจ้าของโครงการคนเดียว อาจมีแฟนหรือเพื่อนเข้ามาใช้ภายหลัง โดยใช้บริการฟรีและไม่เน้นรองรับผู้ใช้จำนวนมาก

## Solution

สร้างเว็บแอปภาษาไทยที่ใช้งานออนไลน์ รองรับมือถือและ desktop มี Google Login จริง และจัดเก็บข้อมูลจริงใน PostgreSQL ผู้ใช้บันทึกรายรับ รายจ่าย และเงินคืนด้วยตนเอง จัดหมวดหมู่ ใช้รายการโปรดเพื่อลดการกรอก ตั้งงบรายจ่ายรายเดือน และดู Dashboard จากข้อมูลของตนเอง

รุ่นแรกต้องกดใช้งานได้ครบตามขอบเขต เน้นความถูกต้องของยอดเงินและสิทธิ์ข้อมูลก่อนการตกแต่ง UI เพิ่มเติม ใช้เงินบาทเพียงสกุลเดียว ละเอียดถึงสตางค์ และใช้เวลาไทยในการกำหนดวันที่และเดือน

หน้าหลักครอบคลุมภาพรวม รายการ งบประมาณ และตั้งค่า โดยรูปแบบ navigation และรายละเอียดด้านภาพสามารถปรับระหว่างพัฒนาได้ตามขนาดหน้าจอ

## User Stories

1. As a visitor, I want to sign in with my Google account, so that I can use the app without creating another password.
2. As a new User, I want a personal workspace associated with my Google account, so that my financial data belongs to me.
3. As a User, I want to sign out, so that I can end access to my financial data on a device.
4. As a User, I want the same Google account to access the same data on mobile and desktop, so that I can record and review my finances across devices.
5. As a User, I want different Google accounts to have separate data, so that my partner or friends can use the app independently.
6. As a User, I want my data protected even when another person requests an item directly, so that privacy does not depend on hidden buttons.
7. As a Thai-speaking User, I want Thai interface labels and messages, so that I can use the app comfortably.
8. As a User, I want monetary values in Thai baht with satang precision, so that small amounts remain accurate.
9. As a User, I want transaction dates and reporting periods based on Thailand time, so that my records belong to the intended day and month.
10. As a User, I want to record Income manually, so that I can track money I actually receive.
11. As a User, I want to record an Expense manually, so that I can track money I actually spend.
12. As a User, I want to enter an amount, Category, and date for each Transaction, so that every record can contribute to useful reports.
13. As a User, I want to add an optional description, so that I can remember the context without slowing down every entry.
14. As a User, I want the entry date to default to today, so that daily recording takes fewer steps.
15. As a User, I want to record past Transactions, so that I can catch up on records I missed.
16. As a User, I want future-dated actual Transactions to be rejected, so that my Dashboard reflects money already received or spent.
17. As a User, I want invalid amounts and missing required fields explained, so that I can correct an entry before saving.
18. As a User, I want to edit a Transaction, so that I can correct mistakes.
19. As a User, I want confirmation before deleting a Transaction, so that accidental actions do not erase my records.
20. As a User, I want to browse past Transactions, so that I can review my financial history.
21. As a User, I want to search Transactions, so that I can locate a specific record.
22. As a User, I want to filter Transactions by relevant criteria such as date, type, and Category, so that I can inspect a useful subset.
23. As a new User, I want starter Categories for Income and Expenses, so that I can begin recording immediately.
24. As a User, I want to create a Category, so that I can classify records according to my own habits.
25. As a User, I want to rename a Category, so that the wording remains meaningful to me.
26. As a User, I want Income and Expense Categories kept distinct, so that I do not classify records under the wrong type.
27. As a User, I want to archive an unused Category while preserving historical records, so that my entry choices stay relevant without losing history.
28. As a User, I want to save commonly used entry details as a Favorite Entry, so that repeated purchases take less typing.
29. As a User, I want a Favorite Entry to prefill an entry for review, so that I can adjust the details before saving.
30. As a User, I want a Favorite Entry to create a Transaction only after confirmation, so that selecting a shortcut does not record money I have not spent.
31. As a User, I want to record a partial Refund against the original Expense, so that my Net Expense reflects the money returned.
32. As a User, I want to record a full Refund against the original Expense, so that a fully refunded purchase is represented correctly.
33. As a User, I want each Refund to retain its original Expense reference and Category relationship, so that its meaning remains traceable.
34. As a User, I want a Refund counted on the date I receive it, so that a refund received in a later month affects that later month.
35. As a User, I want Refunds to reduce Net Expense instead of increasing Income, so that my income totals remain meaningful.
36. As a User, I want cumulative Refunds prevented from exceeding the original Expense, so that my records cannot show more returned than spent.
37. As a User, I want to edit or delete an incorrect Refund, so that I can correct mistakes while preserving the refund limit.
38. As a User, I want the original Expense protected from deletion or reduction below its existing Refund total, so that refunds cannot become inconsistent.
39. As a User, I want refund limits preserved when two devices submit at once, so that simultaneous actions cannot corrupt my totals.
40. As a User, I want to set a monthly Expense Budget by Category, so that I can plan how much to spend.
41. As a User, I want my recurring budget settings available for the following month, so that I do not need to recreate my plan each month.
42. As a User, I want to adjust a budget for a particular month, so that exceptional months do not overwrite other monthly budgets.
43. As a User, I want unused budget to reset rather than roll over, so that each month has a clear independent allowance.
44. As a User, I want to see budget used and Remaining Budget, so that I can understand how much room is left.
45. As a User, I want to keep recording Expenses after exceeding a budget, so that the app still represents what actually happened.
46. As a User, I want the Dashboard to open on the current month, so that I immediately see relevant totals.
47. As a User, I want to select a previous month on the Dashboard, so that I can review historical results.
48. As a User, I want to see total Income, Net Expense, and Monthly Net together, so that I can understand the month's cash flow.
49. As a User, I want a chart of expenses by Category, so that I can see where my money goes.
50. As a User, I want reports to represent negative Net Expense correctly when Refunds exceed that period's Expenses, so that cross-month refunds do not produce misleading charts.
51. As a User, I want to see recent Transactions on the Dashboard, so that I can review what I last entered.
52. As a User, I want the current month compared with the equivalent date range of the previous month, so that partial-month comparisons are useful.
53. As a User, I want completed months compared as whole months with explicit period labels, so that I understand what is being compared.
54. As a User, I want Monthly Net distinguished from my total bank or wallet balance, so that I do not mistake recorded cash flow for all the money I own.
55. As a User, I want to export the currently filtered records to CSV, so that I can use or retain my data outside the app.
56. As a User, I want CSV records to include dates, types, Categories, amounts, descriptions, and Refund references, so that exported data remains understandable.
57. As a User, I want CSV export restricted to my own records, so that exporting cannot expose another User's data.
58. As a User, I want to delete my app account and its data after fresh identity verification and explicit text confirmation, so that I retain control of my financial information.
59. As a User, I want account deletion to affect only my app data and not my Google account or other Users, so that the action has a clear scope.
60. As a mobile User, I want entry controls and navigation that fit the screen, so that I can record Transactions comfortably on my phone.
61. As a desktop User, I want readable lists and reports that use the available space, so that I can review my finances comfortably.
62. As a User, I want clear loading, empty, validation, and failure feedback, so that I can tell whether an action completed and what to do next.
63. As the project owner, I want the app hosted using free service plans within their limits, so that I can start using the complete app without a recurring subscription.

## Implementation Decisions

- Build on the existing Next.js 16 App Router scaffold with React, TypeScript, pnpm, Ant Design, Ant Design Icons, Tailwind CSS for layout and responsiveness, and Recharts. Use AntD Form for form state and Zod for server input validation.
- Use the accepted cloud approach: Next.js on Vercel Hobby with a Node.js runtime, PostgreSQL on Neon Free, and Prisma ORM 7. Use Better Auth with its Prisma adapter and Google as the only sign-in provider.
- Prisma, the Prisma client, and its database driver adapter must stay on compatible versions. Use the committed lockfile. The frontend remains compatible with the accepted stack; vinext is not required for the Vercel deployment.
- Read and write the database only through server-side operations. Keep database URLs, OAuth client secrets, and auth secrets on the server. Use the provider-recommended pooled connection for application traffic and the direct connection for migrations.
- The application needs modules for authentication and account lifecycle, Transactions and Refunds, Categories, Favorite Entries, monthly Expense Budgets, Dashboard reporting, and CSV export. Their public behavior is the contract; internal module layout can be chosen during implementation.
- Persist auth identities and sessions plus Users' Categories, Transactions, Refund references, Favorite Entries, and monthly budget settings. Define and migrate the actual schema during implementation; the current scaffold has no business models or migrations.
- Derive the acting User from the verified session. Every read, write, edit, delete, report, and export must be scoped to that User. Verify ownership of related Categories and original Expenses as well as the target record.
- The same Google identity must recover the same User data on another device. Different Google accounts must remain distinct. Signing out or switching accounts must not leave another User's private data visible through application state or shared caches.
- Store money exactly to satang precision, using integer satang values or an exact database representation. Validate monetary bounds and reject non-positive entered Income, Expense, and Refund amounts; the derived Net Expense and budget balance may be negative.
- Transaction dates represent business dates in Thailand time. Default to today, permit past dates, and reject future dates for actual financial records. Keep operational timestamps separate from business dates.
- Net Expense for a period equals Expenses recorded in that period minus Refunds received in that period. Monthly Net equals the month's Income minus Net Expense. Neither is a bank-account balance.
- A Refund references one of the User's original Expenses, reduces that Expense's Category in the Refund receipt period, and is not Income. Support multiple partial Refunds and full refunds within the cumulative original-Expense limit.
- Preserve Refund and original-Expense invariants in the database transaction boundary, including under concurrent requests. Reading a total and writing a separate unchecked mutation is insufficient. Editing or deleting Refunds and changing or deleting original Expenses must enforce the same invariants.
- Prevent deletion of an Expense that still has Refunds. Prevent reducing its amount below the cumulative refunded amount until the conflicting Refunds have been corrected or removed.
- Starter Categories are separate for Income and Expenses. Users can add, rename, and archive their own Categories. Archived Categories remain available in historical reporting but not as choices for new entries.
- A Favorite Entry fills a draft rather than immediately creating a financial record. The User must explicitly save the resulting Transaction.
- Budgets apply to an Expense Category in a particular month. Preserve reusable budget settings for subsequent months and support month-specific adjustments without rewriting other months. Do not roll unused allowance forward.
- Remaining Budget equals the month's budget for the Category minus the Category's Net Expense for that month. A negative balance indicates overspending and does not block entry.
- Dashboard reporting defaults to the current month and supports historical month selection. Display Income, Net Expense, Monthly Net, Category expense chart, budget progress, and recent Transactions.
- Compare the current month to the equivalent elapsed date range of the preceding month; compare completed months to the full preceding month. Show the actual comparison periods. Handle differing month lengths and zero-baseline periods without invalid numeric output.
- Chart presentation must correctly represent negative category Net Expense. A chart must not silently discard Refunds or represent signed net amounts as ordinary positive pie slices.
- List filtering and CSV export must use consistent criteria. Export dates, record types, Categories, amounts, descriptions, and original-Expense references for Refunds; export only the acting User's filtered data.
- Account deletion requires renewed verification of the same Google identity plus explicit text confirmation. An existing logged-in session alone is not sufficient for the agreed reauthentication step. Remove the User's app records and invalidate their sessions; do not delete their Google account.
- Production functionality must use real Google OAuth and durable database storage. Mock sign-in and browser-only persistence do not satisfy delivery.
- Keep first-release visual design functional and responsive. Further visual styling is deferred; basic usable forms, clear feedback, and mobile layout remain required.
- Stay within free service plans for the small initial user group. Use the hosting provider's supplied domain initially if needed. Do not enable paid services as part of this scope without a separate decision.

## Testing Decisions

- The User confirmed one primary testing boundary: the running application, exercised through its browser UI and public HTTP entry points, backed by an isolated PostgreSQL test database. Prefer this over testing internal helper calls or ORM implementation details.
- Use browser-driven end-to-end scenarios for sign-in state, entry and correction, Category management, Favorite Entries, monthly budgets, Dashboard period selection, CSV download, and account deletion.
- Use requests through that same application boundary for adversarial cross-User access and concurrent Refund submissions. Assert externally observable status, data visibility, persisted totals, and exports rather than function-call counts or internal query shapes.
- Use at least two isolated test Users and verify that direct identifiers, URL changes, request bodies, related Category IDs, Refund references, Dashboard results, and CSV exports cannot expose or mutate another User's data.
- Exercise the real PostgreSQL behavior for refund atomicity and account-data cleanup. Test complete and partial Refunds, multiple refunds, cross-month Refunds, over-refunds, concurrent submissions, and original-Expense edit/delete restrictions.
- Assert exact satang arithmetic, Thai date boundaries, no future dates, optional descriptions, archived Category history, month-specific budget overrides, no rollover, negative Remaining Budget, and continued recording after overspending.
- Assert Dashboard formulas, equivalent elapsed-period comparisons, completed-month comparisons, unequal month lengths, empty periods, zero baselines, and negative Net Expense from Refunds.
- Assert that exported CSV matches the selected filters, preserves Thai text and money precision, includes Refund references, and contains no other User's data.
- For account deletion, verify renewed authentication of the same identity, explicit confirmation, session invalidation, complete deletion of that User's app data, and survival of another User's data.
- Keep automated authentication deterministic through a controlled test-only provider/session setup where necessary; never expose that mechanism in production. Independently complete an acceptance check with real Google OAuth and two real Google accounts before delivery.
- Check both mobile and desktop viewport behavior. Verify user-visible feedback for an empty account, saving, invalid entries, failed operations, expired login, and account switching.
- There is no existing application test suite or domain test seam to copy. Existing verification consists of lint, TypeScript checks, production build, Prisma starter-schema validation/client generation with a placeholder URL, and an HTTP smoke check of the placeholder page. Those checks do not prove database connectivity, OAuth, financial correctness, or deployment.
- Add an end-to-end test harness as part of implementation, using the application's highest boundary and an isolated database. Do not add low-value tests that merely mirror component or ORM code.
- Before acceptance, verify the deployed Vercel app against Neon with real credentials, confirm account separation and Google callbacks, and check that ordinary expected usage remains within the selected free-plan limits.

## Out of Scope

- Bank integrations, access to bank apps, automatic bank synchronization, statement import, and receipt/slip OCR.
- Initiating money transfers, payments, or Refunds. Recording a Refund only records money the User has already received.
- Tracking balances by bank account, wallet, credit card, or other financial account.
- Recording transfers between the User's own accounts as Income or Expenses.
- Shared household workspaces, joint accounts, roles, invitations, or cross-User sharing.
- Multiple currencies, exchange rates, additional sign-in providers, and password-based sign-in.
- Offline recording or synchronization and native mobile applications.
- Automatically recurring Transactions, future actual Transactions, and automatic creation of Expenses from Favorites.
- Automatic budget rollover.
- Advanced tax, investment, debt, or business accounting features.
- Large-scale service architecture, paid hosting upgrades, and commercial-service expansion.
- Additional UI polish beyond what is required for usable mobile and desktop flows.

## Further Notes

- This spec synthesizes the accepted grill-with-docs discussion, the project glossary, and the later technology decisions. It replaces the earlier D1 + Drizzle proposal with the accepted PostgreSQL + Prisma / Vercel + Neon approach.
- Base implementation state: commit 82b118f has been pushed to main. It contains dependencies, a placeholder page, Ant Design/Tailwind setup, an empty PostgreSQL Prisma schema, configuration examples, and setup documentation. The functional product remains to be implemented.
- Google OAuth credentials, a Neon database, and Vercel deployment configuration are not yet connected. Real-account setup is a delivery dependency and must not be replaced by a demo login.
- The glossary's Transaction, Income, Expense, Refund, Net Expense, Monthly Net, Category, Expense Budget, Remaining Budget, and Favorite Entry terms are canonical.
- No ADRs currently exist. Exact database models, endpoint shapes, navigation styling, and test-library selection remain implementation choices constrained by the behavior above; they are not additional product requirements.
- Free-plan quotas and terms must be checked when services are provisioned. The accepted initial use is personal and non-commercial, with a small user group.
