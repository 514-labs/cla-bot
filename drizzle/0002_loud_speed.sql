CREATE TABLE "org_cla_bypass_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"github_user_id" text NOT NULL,
	"github_username" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_cla_bypass_accounts" ADD CONSTRAINT "org_cla_bypass_accounts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_cla_bypass_accounts" ADD CONSTRAINT "org_cla_bypass_accounts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_cla_bypass_accounts_org_github_user_idx" ON "org_cla_bypass_accounts" USING btree ("org_id","github_user_id");