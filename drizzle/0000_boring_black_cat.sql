CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_plans_owner_kind_date` ON `plans` (`owner`,`kind`,`date`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`owner` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`payload` text NOT NULL,
	`primary_morning` integer DEFAULT 0 NOT NULL,
	`plan_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_records_owner_date` ON `records` (`owner`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_one_morning_per_day` ON `records` (`owner`,`date`) WHERE kind='body' AND primary_morning=1 AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_one_diet_per_day` ON `records` (`owner`,`date`) WHERE kind='diet' AND deleted_at IS NULL;