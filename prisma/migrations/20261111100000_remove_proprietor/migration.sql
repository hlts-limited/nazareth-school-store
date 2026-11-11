-- The Proprietor role is gone: the Accountant approves payroll and the Super Admin pays it.
-- Anyone who had it keeps their other roles; the seed gives the Accountant and Super Admin their new permissions.
DELETE FROM "UserRole" WHERE "roleId" = 'proprietor';
DELETE FROM "Role" WHERE "id" = 'proprietor';
