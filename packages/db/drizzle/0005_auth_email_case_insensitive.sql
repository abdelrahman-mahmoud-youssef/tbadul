CREATE UNIQUE INDEX "auth_users_email_lower_unique" ON "auth_users" (lower("email"));
