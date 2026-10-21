-- The branch each staff member is deployed to (and clocks in at). Staff whose section is a branch start there;
-- administration and support staff are given their branch by HR.
ALTER TABLE "Employee" ADD COLUMN "branch" TEXT;
UPDATE "Employee" SET "branch" = "section" WHERE "section" IN ('pre-school', 'school-a', 'school-b');
