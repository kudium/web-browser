ALTER TABLE "auth_users" ALTER COLUMN "username" SET DEFAULT 'publisher_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
--> statement-breakpoint
-- Only replace legacy system-generated handles; chosen usernames are preserved.
DO $$
DECLARE
  account record;
  candidate text;
BEGIN
  FOR account IN SELECT id FROM auth_users WHERE username ~ '^publisher-[a-f0-9]{32}$' LOOP
    LOOP
      candidate := 'publisher_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
      BEGIN
        UPDATE auth_users SET username = candidate, updated_at = now() WHERE id = account.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- Generate another handle if it collides with an existing username.
      END;
    END LOOP;
  END LOOP;
END $$;
