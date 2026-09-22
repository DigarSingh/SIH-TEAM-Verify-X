-- Makes an assessment submission safe to retry after a lost connection.
--
-- The key is supplied by the client. Existing rows have NULL, and PostgreSQL
-- treats NULLs as distinct in a unique index, so every current attempt stays
-- valid and only real, repeated keys collide.
ALTER TABLE "AssessmentAttempt" ADD COLUMN "idempotencyKey" TEXT;

-- Scoped per user so one person's key can never collide with another's.
CREATE UNIQUE INDEX "AssessmentAttempt_userId_idempotencyKey_key" ON "AssessmentAttempt"("userId", "idempotencyKey");
