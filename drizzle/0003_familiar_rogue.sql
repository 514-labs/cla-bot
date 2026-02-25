DROP INDEX "org_cla_bypass_accounts_org_github_user_idx";--> statement-breakpoint
ALTER TABLE "org_cla_bypass_accounts" ALTER COLUMN "github_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "org_cla_bypass_accounts" ADD COLUMN "bypass_kind" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "org_cla_bypass_accounts" ADD COLUMN "actor_slug" text;--> statement-breakpoint
CREATE UNIQUE INDEX "org_cla_bypass_accounts_org_kind_github_user_idx" ON "org_cla_bypass_accounts" USING btree ("org_id","bypass_kind","github_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_cla_bypass_accounts_org_kind_actor_slug_idx" ON "org_cla_bypass_accounts" USING btree ("org_id","bypass_kind","actor_slug");