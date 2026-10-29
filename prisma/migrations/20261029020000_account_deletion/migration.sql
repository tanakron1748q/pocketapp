CREATE TABLE "deletion_verifications" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "verifier" TEXT,
  "nonce" TEXT NOT NULL,
  "verifiedAt" TIMESTAMPTZ(3),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "deletion_verifications_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "deletion_verifications_sessionId_key" ON "deletion_verifications"("sessionId");
