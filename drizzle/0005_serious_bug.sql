CREATE TABLE `custom_dishes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name_key` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_custom_dishes_owner_name` ON `custom_dishes` (`owner`,`name_key`) WHERE deleted_at IS NULL;