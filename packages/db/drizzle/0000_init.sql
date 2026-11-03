CREATE TABLE "account_claims" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"platform_account_id" uuid NOT NULL,
	"handle" text NOT NULL,
	"verification_platform_account_id" uuid,
	"state" text NOT NULL,
	"rejection" text,
	"eligibility" jsonb NOT NULL,
	"next_verify_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_claims_platform_check" CHECK ("account_claims"."platform" in ('tiktok')),
	CONSTRAINT "account_claims_state_check" CHECK ("account_claims"."state" in ('eligibility_failed', 'awaiting_follow', 'verified', 'expired', 'rejected')),
	CONSTRAINT "account_claims_rejection_check" CHECK ("account_claims"."rejection" in ('pool_exhausted', 'account_already_claimed'))
);
--> statement-breakpoint
CREATE TABLE "claim_attempts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"claim_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"source" text,
	"latency_ms" integer,
	CONSTRAINT "claim_attempts_outcome_check" CHECK ("claim_attempts"."outcome" in ('not_following', 'private', 'not_found'))
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auth_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linked_accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"platform_account_id" uuid NOT NULL,
	"status" text NOT NULL,
	"linked_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"claim_id" uuid NOT NULL,
	CONSTRAINT "linked_accounts_platform_check" CHECK ("linked_accounts"."platform" in ('tiktok')),
	CONSTRAINT "linked_accounts_status_check" CHECK ("linked_accounts"."status" in ('active', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "platform_accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"platform" text NOT NULL,
	"external_id" text NOT NULL,
	"numeric_id" text,
	"handle" text NOT NULL,
	"handle_seen_at" timestamp with time zone NOT NULL,
	"is_private" boolean NOT NULL,
	"following_visible" boolean,
	"likes_visible" boolean,
	"follower_count" integer,
	"following_count" integer,
	"video_count" integer,
	"account_created_at" timestamp with time zone,
	"avatar_url" text,
	"profile_fetched_at" timestamp with time zone NOT NULL,
	"profile_source" text NOT NULL,
	"extras" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "platform_accounts_platform_external_id_unique" UNIQUE("platform","external_id"),
	CONSTRAINT "platform_accounts_platform_check" CHECK ("platform_accounts"."platform" in ('tiktok'))
);
--> statement-breakpoint
CREATE TABLE "verification_accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"platform_account_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"assigned_count" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_accounts_platform_account_id_unique" UNIQUE("platform_account_id")
);
--> statement-breakpoint
CREATE TABLE "verification_checks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"check_kind" text NOT NULL,
	"platform" text NOT NULL,
	"source" text NOT NULL,
	"outcome" text NOT NULL,
	"error_kind" text,
	"latency_ms" integer NOT NULL,
	"cost_unit" text,
	"cost_amount" numeric,
	"subject_hash" text,
	"performer_hash" text,
	"target_hash" text,
	CONSTRAINT "verification_checks_platform_check" CHECK ("verification_checks"."platform" in ('tiktok')),
	CONSTRAINT "verification_checks_check_kind_check" CHECK ("verification_checks"."check_kind" in ('profile', 'follows', 'liked')),
	CONSTRAINT "verification_checks_outcome_check" CHECK ("verification_checks"."outcome" in ('verified', 'not_following', 'private', 'not_found', 'source_error')),
	CONSTRAINT "verification_checks_error_kind_check" CHECK ("verification_checks"."error_kind" in ('timeout', 'network', 'http', 'auth', 'rate_limited', 'blocked', 'parse', 'unknown_status', 'incomplete_list', 'unexpected')),
	CONSTRAINT "verification_checks_cost_unit_check" CHECK ("verification_checks"."cost_unit" in ('request', 'units', 'usd'))
);
--> statement-breakpoint
ALTER TABLE "account_claims" ADD CONSTRAINT "account_claims_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_claims" ADD CONSTRAINT "account_claims_platform_account_id_platform_accounts_id_fk" FOREIGN KEY ("platform_account_id") REFERENCES "public"."platform_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_claims" ADD CONSTRAINT "account_claims_verification_platform_account_id_platform_accounts_id_fk" FOREIGN KEY ("verification_platform_account_id") REFERENCES "public"."platform_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_attempts" ADD CONSTRAINT "claim_attempts_claim_id_account_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."account_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_platform_account_id_platform_accounts_id_fk" FOREIGN KEY ("platform_account_id") REFERENCES "public"."platform_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_claim_id_account_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."account_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_accounts" ADD CONSTRAINT "verification_accounts_platform_account_id_platform_accounts_id_fk" FOREIGN KEY ("platform_account_id") REFERENCES "public"."platform_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_claims_open_unique" ON "account_claims" USING btree ("user_id","platform_account_id") WHERE "account_claims"."state" = 'awaiting_follow';--> statement-breakpoint
CREATE INDEX "account_claims_user_platform_idx" ON "account_claims" USING btree ("user_id","platform");--> statement-breakpoint
CREATE INDEX "auth_accounts_userId_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "linked_accounts_active_account_unique" ON "linked_accounts" USING btree ("platform_account_id") WHERE "linked_accounts"."status" = 'active';--> statement-breakpoint
CREATE INDEX "linked_accounts_user_idx" ON "linked_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "platform_accounts_platform_handle_idx" ON "platform_accounts" USING btree ("platform",lower("handle"));--> statement-breakpoint
CREATE INDEX "verification_checks_at_brin" ON "verification_checks" USING brin ("at");