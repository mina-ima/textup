ALTER TABLE "recording_sessions" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recording_sessions" ADD COLUMN "last_error_category" text;--> statement-breakpoint
ALTER TABLE "recording_sessions" ADD COLUMN "last_error_at" timestamp;