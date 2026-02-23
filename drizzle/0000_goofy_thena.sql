CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"org_id" text,
	"user_id" text,
	"actor_github_id" text,
	"actor_github_username" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cla_archives" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"sha256" text NOT NULL,
	"cla_text" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cla_signatures" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"cla_sha256" text NOT NULL,
	"accepted_sha256" text NOT NULL,
	"consent_text_version" text NOT NULL,
	"assented" boolean DEFAULT true NOT NULL,
	"signed_at" text NOT NULL,
	"github_user_id_at_signature" text NOT NULL,
	"github_username" text NOT NULL,
	"email_at_signature" text NOT NULL,
	"email_verified_at_signature" boolean DEFAULT false NOT NULL,
	"email_source" text DEFAULT 'none' NOT NULL,
	"session_jti" text NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"name" text NOT NULL,
	"avatar_url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"github_org_slug" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text NOT NULL,
	"installed_at" text NOT NULL,
	"admin_user_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"installation_id" integer,
	"cla_text" text DEFAULT '' NOT NULL,
	"cla_text_sha256" text,
	CONSTRAINT "organizations_github_org_slug_unique" UNIQUE("github_org_slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"github_username" text NOT NULL,
	"github_id" text NOT NULL,
	"github_access_token_encrypted" text,
	"github_token_scopes" text,
	"github_token_updated_at" text,
	"email" text DEFAULT '' NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"email_source" text DEFAULT 'none' NOT NULL,
	"avatar_url" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'contributor' NOT NULL,
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"delivery_id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"received_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cla_archives" ADD CONSTRAINT "cla_archives_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cla_signatures" ADD CONSTRAINT "cla_signatures_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cla_signatures" ADD CONSTRAINT "cla_signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cla_archives_org_sha256_idx" ON "cla_archives" USING btree ("org_id","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "cla_signatures_org_user_sha_idx" ON "cla_signatures" USING btree ("org_id","user_id","cla_sha256");