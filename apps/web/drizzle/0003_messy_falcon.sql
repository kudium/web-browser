CREATE TABLE "auth_device_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code" text NOT NULL,
	"user_code" text NOT NULL,
	"user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"last_polled_at" timestamp with time zone,
	"polling_interval" integer,
	"client_id" text,
	"scope" text,
	CONSTRAINT "auth_device_codes_device_code_unique" UNIQUE("device_code"),
	CONSTRAINT "auth_device_codes_user_code_unique" UNIQUE("user_code")
);
--> statement-breakpoint
ALTER TABLE "auth_device_codes" ADD CONSTRAINT "auth_device_codes_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;