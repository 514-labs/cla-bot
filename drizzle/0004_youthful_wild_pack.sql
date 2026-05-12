ALTER TABLE "users" ADD COLUMN "github_access_token_expires_at" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "github_refresh_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "github_refresh_token_expires_at" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "github_token_kind" text DEFAULT 'legacy_user' NOT NULL;