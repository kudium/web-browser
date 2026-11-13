ALTER TABLE "hook_versions" ADD COLUMN "status" text DEFAULT 'approved' NOT NULL;
--> statement-breakpoint
ALTER TABLE hook_versions ADD CONSTRAINT hook_version_status_valid CHECK (status IN ('pending','approved','rejected'));
