ALTER TABLE `coach_commitments` ADD `expires_at` text;--> statement-breakpoint
ALTER TABLE `coach_memories` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `coach_memories` ADD `expires_at` text;