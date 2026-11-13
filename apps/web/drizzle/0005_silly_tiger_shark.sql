CREATE TABLE "hook_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"hook_id" text NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hook_likes" (
	"hook_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "hook_likes_hook_id_user_id_pk" PRIMARY KEY("hook_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "hook_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"applicability" text NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"status_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hook_moderation" (
	"id" text PRIMARY KEY NOT NULL,
	"hook_id" text NOT NULL,
	"admin_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hook_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"hook_id" text NOT NULL,
	"comment_id" text,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hook_targets" (
	"hook_id" text NOT NULL,
	"host" text NOT NULL,
	"include_subdomains" boolean NOT NULL,
	CONSTRAINT "hook_targets_hook_id_host_pk" PRIMARY KEY("hook_id","host")
);
--> statement-breakpoint
CREATE TABLE "hook_versions" (
	"hook_id" text NOT NULL,
	"version" integer NOT NULL,
	"package" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hook_versions_hook_id_version_pk" PRIMARY KEY("hook_id","version")
);
--> statement-breakpoint
ALTER TABLE "hook_comments" ADD CONSTRAINT "hook_comments_hook_id_hook_listings_id_fk" FOREIGN KEY ("hook_id") REFERENCES "public"."hook_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_comments" ADD CONSTRAINT "hook_comments_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_likes" ADD CONSTRAINT "hook_likes_hook_id_hook_listings_id_fk" FOREIGN KEY ("hook_id") REFERENCES "public"."hook_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_likes" ADD CONSTRAINT "hook_likes_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_listings" ADD CONSTRAINT "hook_listings_author_id_auth_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_moderation" ADD CONSTRAINT "hook_moderation_hook_id_hook_listings_id_fk" FOREIGN KEY ("hook_id") REFERENCES "public"."hook_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_moderation" ADD CONSTRAINT "hook_moderation_admin_id_auth_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_reports" ADD CONSTRAINT "hook_reports_hook_id_hook_listings_id_fk" FOREIGN KEY ("hook_id") REFERENCES "public"."hook_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_reports" ADD CONSTRAINT "hook_reports_comment_id_hook_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."hook_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_reports" ADD CONSTRAINT "hook_reports_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_targets" ADD CONSTRAINT "hook_targets_hook_id_hook_listings_id_fk" FOREIGN KEY ("hook_id") REFERENCES "public"."hook_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hook_versions" ADD CONSTRAINT "hook_versions_hook_id_hook_listings_id_fk" FOREIGN KEY ("hook_id") REFERENCES "public"."hook_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hook_comment_cursor" ON "hook_comments" USING btree ("hook_id","created_at","id");--> statement-breakpoint
CREATE INDEX "hook_author" ON "hook_listings" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "hook_public_cursor" ON "hook_listings" USING btree ("published_at","id");--> statement-breakpoint
CREATE INDEX "hook_target_host" ON "hook_targets" USING btree ("host","hook_id");