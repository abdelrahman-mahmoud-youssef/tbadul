import { auth_users, type Database, type UserRole } from '@engagement-exchange/db';
import { sql } from 'drizzle-orm';

export const invalidUser =
  'config CLI_USER_ID: with DATABASE_URL set, use the id printed by user add';

export const unknownUser =
  'config CLI_USER_ID: no user has this id; create one with user add <email>';

export const userAdd = async (db: Database, email: string, name: string): Promise<number> => {
  const [created] = await db
    .insert(auth_users)
    .values({ email, name })
    .onConflictDoNothing()
    .returning({ id: auth_users.id });
  if (created === undefined) {
    console.error('a user with this email already exists');
    return 1;
  }
  console.log(`user ${created.id}: set CLI_USER_ID=${created.id} to link accounts as this user`);
  return 0;
};

export const unknownEmail = 'no user has this email; create one with user add <email>';

export const userRole = async (db: Database, email: string, role: UserRole): Promise<number> => {
  const [updated] = await db
    .update(auth_users)
    .set({ role })
    .where(sql`lower(${auth_users.email}) = ${email}`)
    .returning({ id: auth_users.id });
  if (updated === undefined) {
    console.error(unknownEmail);
    return 1;
  }
  console.log(`user ${updated.id}: role ${role}`);
  return 0;
};

export const userExists = async (db: Database, id: string): Promise<boolean> =>
  (await db.query.auth_users.findFirst({
    columns: { id: true },
    where: (users, { eq }) => eq(users.id, id),
  })) !== undefined;
