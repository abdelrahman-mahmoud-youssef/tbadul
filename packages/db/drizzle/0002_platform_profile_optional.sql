ALTER TABLE "platform_accounts" ALTER COLUMN "handle" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_accounts" ALTER COLUMN "handle_seen_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_accounts" ALTER COLUMN "is_private" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_accounts" ALTER COLUMN "profile_fetched_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_accounts" ALTER COLUMN "profile_source" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "claim_attempts_claim_idx" ON "claim_attempts" USING btree ("claim_id");