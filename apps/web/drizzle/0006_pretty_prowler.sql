CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
DROP INDEX "hook_public_cursor";--> statement-breakpoint
ALTER TABLE "hook_comments" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "hook_comments" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "hook_comments" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "hook_comments" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "hook_listings" ALTER COLUMN "published_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "hook_listings" ALTER COLUMN "published_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "hook_listings" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "hook_listings" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "hook_moderation" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "hook_moderation" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "hook_reports" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "hook_reports" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "hook_versions" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "hook_versions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
CREATE INDEX "hook_name_search" ON "hook_listings" USING gin ("name" gin_trgm_ops) WHERE "hook_listings"."status" = 'approved';--> statement-breakpoint
CREATE INDEX "hook_public_cursor" ON "hook_listings" USING btree ("published_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "hook_listings"."status" = 'approved';
--> statement-breakpoint
ALTER TABLE hook_listings ADD CONSTRAINT hook_status_valid CHECK (status IN ('pending','approved','rejected'));
--> statement-breakpoint
ALTER TABLE hook_listings ADD CONSTRAINT hook_applicability_valid CHECK (applicability IN ('site','general'));
