-- The Bursar and Accountant roles become one Accounts role (id stays "accountant").
-- Anyone who was a Bursar becomes Accounts; the seed then gives the role its merged permissions.
INSERT INTO "UserRole" ("userId", "roleId")
SELECT "userId", 'accountant' FROM "UserRole" WHERE "roleId" = 'bursar'
ON CONFLICT DO NOTHING;
DELETE FROM "UserRole" WHERE "roleId" = 'bursar';
DELETE FROM "Role" WHERE "id" = 'bursar';
