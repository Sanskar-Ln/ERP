-- Collapse the four-role model (OWNER/MANAGER/SALESPERSON/ACCOUNTANT)
-- to two roles: ADMIN (full access) and OPS (day-to-day operations).
--
-- Postgres cannot remove enum values in place, so: rename the old type,
-- create the new one, retype the column with an explicit remap
-- (OWNER|MANAGER -> ADMIN, SALESPERSON|ACCOUNTANT -> OPS), drop the old.
-- Existing JWTs carry old role names and fail claim validation after this
-- migration -> users simply re-login.

ALTER TYPE "Role" RENAME TO "Role_old";

CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPS');

ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role"
  USING (CASE WHEN "role"::text IN ('OWNER', 'MANAGER') THEN 'ADMIN' ELSE 'OPS' END)::"Role";

DROP TYPE "Role_old";
