ALTER TABLE "organizations" ADD COLUMN "github_account_type" text DEFAULT 'organization' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "github_account_id" text;