// Loaded only by Playwright's production-server command, never by the app build.
// No HTTP endpoint or production environment switch can change application time.
import { readFileSync } from "node:fs";
const file = process.env.POCKETAPP_TEST_CLOCK_FILE;
const database = new URL(process.env.DATABASE_URL);
if (!file || database.hostname !== "127.0.0.1" || database.pathname !== "/pocketapp_test") {
  throw new Error("The test server clock requires a disposable local test database");
}
const NativeDate = Date;
function now() {
  const value = readFileSync(file, "utf8").trim();
  if (!value) return NativeDate.now();
  const timestamp = NativeDate.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("Invalid test clock");
  return timestamp;
}
function TestDate(...args) {
  if (!new.target) return new NativeDate(now()).toString();
  return Reflect.construct(NativeDate, args.length ? args : [now()], new.target);
}
Object.setPrototypeOf(TestDate, NativeDate);
TestDate.prototype = NativeDate.prototype;
TestDate.now = now;
global.Date = TestDate;
