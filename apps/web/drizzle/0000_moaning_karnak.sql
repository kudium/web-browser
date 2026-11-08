CREATE TABLE "sync_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"history_bytes" integer DEFAULT 0 NOT NULL,
	"used_bytes" integer DEFAULT 0 NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_changes" (
	"account_id" text NOT NULL,
	"revision" bigint NOT NULL,
	"record_id" text NOT NULL,
	"envelope" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_changes_account_id_revision_pk" PRIMARY KEY("account_id","revision")
);
--> statement-breakpoint
CREATE TABLE "sync_records" (
	"account_id" text NOT NULL,
	"id" text NOT NULL,
	"revision" bigint NOT NULL,
	"envelope" jsonb,
	"bytes" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_records_account_id_id_pk" PRIMARY KEY("account_id","id")
);
--> statement-breakpoint
CREATE TABLE "app_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"platform" text NOT NULL,
	"arch" text NOT NULL,
	"channel" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_changes" ADD CONSTRAINT "sync_changes_account_id_sync_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."sync_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_records" ADD CONSTRAINT "sync_records_account_id_sync_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."sync_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "release_target_version" ON "app_releases" USING btree ("platform","arch","channel","version");