CREATE TABLE `coach_commitments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`due_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`completion` text,
	`evidence_id` text,
	`notified_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_coach_commitments_owner_due` ON `coach_commitments` (`owner`,`due_at`);--> statement-breakpoint
CREATE TABLE `coach_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`content` text NOT NULL,
	`category` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_coach_memories_owner` ON `coach_memories` (`owner`);--> statement-breakpoint
CREATE TABLE `coach_settings` (
	`owner` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `coach_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`day_key` text,
	`user_text` text NOT NULL,
	`reply` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`proposals` text DEFAULT '[]' NOT NULL,
	`evidence` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_coach_turns_owner_created` ON `coach_turns` (`owner`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_coach_daily_opening` ON `coach_turns` (`owner`,`day_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_coach_one_pending` ON `coach_turns` (`owner`) WHERE status='pending';