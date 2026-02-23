ALTER TABLE "users" ADD COLUMN "email" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "users"
SET "email" = "github_username" || '@users.noreply.github.com'
WHERE "email" = '';--> statement-breakpoint
ALTER TABLE "cla_signatures" ADD COLUMN "email_at_signature" text;--> statement-breakpoint
UPDATE "cla_signatures" AS sig
SET "email_at_signature" = u."email"
FROM "users" AS u
WHERE sig."user_id" = u."id"
  AND sig."email_at_signature" IS NULL;--> statement-breakpoint
UPDATE "cla_signatures"
SET "email_at_signature" = "github_username" || '@users.noreply.github.com'
WHERE "email_at_signature" IS NULL;--> statement-breakpoint
ALTER TABLE "cla_signatures" ALTER COLUMN "email_at_signature" SET NOT NULL;
