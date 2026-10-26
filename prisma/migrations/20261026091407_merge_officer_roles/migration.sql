-- Merge the Verification / Compliance Officer role into the Scrutiny Officer role
-- ("Scrutiny & Verification Officer"). Existing rows are converted; historical audit
-- events keep the role recorded at the time (the audit log is append-only).
UPDATE "User" SET "role" = 'SCRUTINY_OFFICER' WHERE "role" = 'VERIFICATION_OFFICER';
UPDATE "Finding" SET "assignedRole" = 'SCRUTINY_OFFICER' WHERE "assignedRole" = 'VERIFICATION_OFFICER';
UPDATE "ReviewAction" SET "actorRole" = 'SCRUTINY_OFFICER' WHERE "actorRole" = 'VERIFICATION_OFFICER';
