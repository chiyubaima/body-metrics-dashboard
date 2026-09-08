CREATE TABLE `annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`message` text NOT NULL,
	`target` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_annotations_owner_created` ON `annotations` (`owner`,`created_at`);