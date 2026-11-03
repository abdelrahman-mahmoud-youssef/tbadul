import { auth_users, type Database } from '@engagement-exchange/db';

export const invalidUser =
  'config CLI_USER_ID: with DATABASE_URL set, use the id printed by user add';

export const unknownUser =
  'config CLI_USER_ID: no user has this id; create one with user add <email>';

export const userAdd = async (db: Database, email: string, name: string): Promise<number> => {
  const [created] = await db
    .insert(auth_users)
    .values({ email, name })
    .onConflictDoNothing({ target: auth_users.email })
    .returning({ id: auth_users.id });
  if (created === undefined) {
    console.error('a user with this email already exists');
    return 1;
  }
  console.log(`user ${created.id}: set CLI_USER_ID=${created.id} to link accounts as this user`);
  return 0;
};

export const userExists = async (db: Database, id: string): Promise<boolean> =>
  (await db.query.auth_users.findFirst({
    columns: { id: true },
    where: (users, { eq }) => eq(users.id, id),
  })) !== undefined;
