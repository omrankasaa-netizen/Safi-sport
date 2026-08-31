CREATE TABLE `audit_logs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`actorUserId` bigint unsigned,
	`action` varchar(120) NOT NULL,
	`entity` varchar(60) NOT NULL,
	`entityId` varchar(60),
	`detail` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `branch_stock` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`variantId` bigint unsigned NOT NULL,
	`branchId` bigint unsigned NOT NULL,
	`qtyOnHand` int NOT NULL DEFAULT 0,
	`reservedOnline` int NOT NULL DEFAULT 0,
	`lowStockThreshold` int NOT NULL DEFAULT 2,
	`lastSyncedAt` datetime,
	`syncSource` enum('rbmsoft','manual','seed') NOT NULL DEFAULT 'seed',
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `branch_stock_id` PRIMARY KEY(`id`),
	CONSTRAINT `branch_stock_variant_branch_idx` UNIQUE(`variantId`,`branchId`)
);
--> statement-breakpoint
CREATE TABLE `branch_transfers` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`transferNumber` varchar(32) NOT NULL,
	`variantId` bigint unsigned NOT NULL,
	`qty` int NOT NULL,
	`fromBranchId` bigint unsigned NOT NULL,
	`toBranchId` bigint unsigned NOT NULL,
	`status` enum('requested','in_transit','received','cancelled') NOT NULL DEFAULT 'requested',
	`orderId` bigint unsigned,
	`note` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`receivedAt` timestamp,
	CONSTRAINT `branch_transfers_id` PRIMARY KEY(`id`),
	CONSTRAINT `branch_transfers_transferNumber_unique` UNIQUE(`transferNumber`)
);
--> statement-breakpoint
CREATE TABLE `branches` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`code` varchar(16) NOT NULL,
	`nameEn` varchar(160) NOT NULL,
	`nameAr` varchar(160),
	`address` varchar(255) NOT NULL,
	`phone` varchar(32),
	`whatsapp` varchar(32),
	`mapsUrl` varchar(500),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `branches_id` PRIMARY KEY(`id`),
	CONSTRAINT `branches_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `contact_messages` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(40),
	`message` text NOT NULL,
	`status` enum('new','read','archived') NOT NULL DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`fullName` varchar(160) NOT NULL,
	`phone` varchar(32) NOT NULL,
	`whatsapp` varchar(32),
	`email` varchar(320),
	`address` text,
	`area` varchar(96),
	`notes` text,
	`ordersCount` int NOT NULL DEFAULT 0,
	`totalSpentCents` bigint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `discounts` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`nameEn` varchar(160) NOT NULL,
	`nameAr` varchar(160),
	`type` enum('percent','fixed') NOT NULL,
	`value` int NOT NULL,
	`appliesTo` enum('all','category','product') NOT NULL DEFAULT 'all',
	`appliesValue` varchar(160),
	`active` boolean NOT NULL DEFAULT true,
	`startsAt` timestamp,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `discounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_otps` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`codeHash` varchar(128) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`consumedAt` timestamp,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_otps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `low_stock_alerts` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`variantId` bigint unsigned NOT NULL,
	`branchId` bigint unsigned NOT NULL,
	`qtyAtAlert` int NOT NULL,
	`status` enum('open','acknowledged') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `low_stock_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`url` varchar(500) NOT NULL,
	`webpUrl` varchar(500),
	`width` int,
	`height` int,
	`sha256` char(64) NOT NULL,
	`productId` bigint unsigned,
	`color` varchar(48),
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `media_assets_id` PRIMARY KEY(`id`),
	CONSTRAINT `media_assets_sha256_unique` UNIQUE(`sha256`)
);
--> statement-breakpoint
CREATE TABLE `newsletter_subscribers` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`language` varchar(8),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `newsletter_subscribers_id` PRIMARY KEY(`id`),
	CONSTRAINT `newsletter_subscribers_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`orderId` bigint unsigned NOT NULL,
	`variantId` bigint unsigned NOT NULL,
	`productName` varchar(180) NOT NULL,
	`color` varchar(48) NOT NULL,
	`size` varchar(16) NOT NULL,
	`sku` varchar(64) NOT NULL,
	`barcode` varchar(64) NOT NULL,
	`qty` int NOT NULL,
	`unitPriceCents` int NOT NULL,
	`sourceBranchId` bigint unsigned NOT NULL,
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`orderNumber` varchar(32) NOT NULL,
	`customerId` bigint unsigned,
	`guestName` varchar(160) NOT NULL,
	`guestPhone` varchar(32) NOT NULL,
	`guestAddress` varchar(255),
	`guestArea` varchar(96),
	`fulfilment` enum('delivery','pickup') NOT NULL,
	`pickupBranchId` bigint unsigned,
	`deliveryFeeCents` int NOT NULL DEFAULT 300000,
	`subtotalCents` int NOT NULL,
	`totalCents` int NOT NULL,
	`paymentMethod` enum('cash_on_delivery') NOT NULL DEFAULT 'cash_on_delivery',
	`status` enum('new','confirmed','preparing','ready_for_pickup','out_for_delivery','delivered','returned','cancelled') NOT NULL DEFAULT 'new',
	`needsTransfer` boolean NOT NULL DEFAULT false,
	`transferFromBranchId` bigint unsigned,
	`metaEventId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_orderNumber_unique` UNIQUE(`orderNumber`)
);
--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`productId` bigint unsigned NOT NULL,
	`sku` varchar(64) NOT NULL,
	`barcode` varchar(64) NOT NULL,
	`color` varchar(48) NOT NULL,
	`colorHex` char(7),
	`size` varchar(16) NOT NULL,
	`sizeType` enum('shoe','apparel','kids') NOT NULL,
	`priceOverrideCents` int,
	`rbmsoftVariantId` varchar(64),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_variants_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_variants_sku_unique` UNIQUE(`sku`),
	CONSTRAINT `product_variants_barcode_idx` UNIQUE(`barcode`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`slug` varchar(180) NOT NULL,
	`nameEn` varchar(180) NOT NULL,
	`nameAr` varchar(180),
	`descriptionEn` text,
	`descriptionAr` text,
	`audience` enum('men','women','kids','unisex') NOT NULL,
	`category` enum('shoes','training','jackets','hoodies','pants','shorts','tees','sets','accessories') NOT NULL,
	`brand` varchar(64),
	`basePriceCents` int NOT NULL,
	`compareAtPriceCents` int,
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
	`isNew` boolean NOT NULL DEFAULT false,
	`isTrending` boolean NOT NULL DEFAULT false,
	`rbmsoftItemId` varchar(64),
	`metaTitle` varchar(200),
	`metaDescription` varchar(300),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `promo_codes` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`code` varchar(40) NOT NULL,
	`type` enum('percent','fixed') NOT NULL,
	`value` int NOT NULL,
	`minOrderCents` int,
	`maxUses` int,
	`usesCount` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`startsAt` timestamp,
	`expiresAt` timestamp,
	`createdByUserId` bigint unsigned,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `promo_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `promo_codes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `site_settings` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`key` varchar(120) NOT NULL,
	`value` json,
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `site_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `site_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `staff_roles` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(160),
	`role` enum('staff','manager','owner') NOT NULL,
	`addedByUserId` bigint unsigned,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staff_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_roles_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `stock_reservations` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`orderId` bigint unsigned NOT NULL,
	`variantId` bigint unsigned NOT NULL,
	`branchId` bigint unsigned NOT NULL,
	`qty` int NOT NULL,
	`status` enum('held','committed','released','expired') NOT NULL DEFAULT 'held',
	`expiresAt` datetime NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_reservations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_conflicts` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`variantId` bigint unsigned,
	`branchId` bigint unsigned,
	`kind` enum('negative_stock','unknown_barcode','reserved_exceeds_physical','push_failed') NOT NULL,
	`detail` json,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sync_conflicts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`driver` varchar(32) NOT NULL,
	`mode` enum('full','delta','webhook') NOT NULL,
	`startedAt` datetime NOT NULL,
	`finishedAt` datetime,
	`status` enum('ok','error','partial') NOT NULL,
	`itemsUpserted` int NOT NULL DEFAULT 0,
	`stocksUpdated` int NOT NULL DEFAULT 0,
	`error` text,
	CONSTRAINT `sync_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` serial AUTO_INCREMENT NOT NULL,
	`unionId` varchar(255) NOT NULL,
	`name` varchar(255),
	`email` varchar(320),
	`avatar` text,
	`role` enum('viewer','staff','manager','owner') NOT NULL DEFAULT 'viewer',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	`lastSignInAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_unionId_unique` UNIQUE(`unionId`)
);
--> statement-breakpoint
ALTER TABLE `branch_stock` ADD CONSTRAINT `branch_stock_variantId_product_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `branch_stock` ADD CONSTRAINT `branch_stock_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `branch_transfers` ADD CONSTRAINT `branch_transfers_variantId_product_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `branch_transfers` ADD CONSTRAINT `branch_transfers_fromBranchId_branches_id_fk` FOREIGN KEY (`fromBranchId`) REFERENCES `branches`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `branch_transfers` ADD CONSTRAINT `branch_transfers_toBranchId_branches_id_fk` FOREIGN KEY (`toBranchId`) REFERENCES `branches`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `branch_transfers` ADD CONSTRAINT `branch_transfers_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `low_stock_alerts` ADD CONSTRAINT `low_stock_alerts_variantId_product_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `low_stock_alerts` ADD CONSTRAINT `low_stock_alerts_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_variantId_product_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_sourceBranchId_branches_id_fk` FOREIGN KEY (`sourceBranchId`) REFERENCES `branches`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_customerId_customers_id_fk` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_pickupBranchId_branches_id_fk` FOREIGN KEY (`pickupBranchId`) REFERENCES `branches`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_transferFromBranchId_branches_id_fk` FOREIGN KEY (`transferFromBranchId`) REFERENCES `branches`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_reservations` ADD CONSTRAINT `stock_reservations_orderId_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_reservations` ADD CONSTRAINT `stock_reservations_variantId_product_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_reservations` ADD CONSTRAINT `stock_reservations_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sync_conflicts` ADD CONSTRAINT `sync_conflicts_variantId_product_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sync_conflicts` ADD CONSTRAINT `sync_conflicts_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `branch_stock_branch_idx` ON `branch_stock` (`branchId`);--> statement-breakpoint
CREATE INDEX `branch_transfers_status_idx` ON `branch_transfers` (`status`);--> statement-breakpoint
CREATE INDEX `customers_phone_idx` ON `customers` (`phone`);--> statement-breakpoint
CREATE INDEX `email_otps_email_idx` ON `email_otps` (`email`);--> statement-breakpoint
CREATE INDEX `low_stock_alerts_status_idx` ON `low_stock_alerts` (`status`);--> statement-breakpoint
CREATE INDEX `media_assets_product_color_idx` ON `media_assets` (`productId`,`color`);--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`orderId`);--> statement-breakpoint
CREATE INDEX `order_items_variant_idx` ON `order_items` (`variantId`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_customer_idx` ON `orders` (`customerId`);--> statement-breakpoint
CREATE INDEX `orders_guest_phone_idx` ON `orders` (`guestPhone`);--> statement-breakpoint
CREATE INDEX `product_variants_product_idx` ON `product_variants` (`productId`);--> statement-breakpoint
CREATE INDEX `product_variants_rbmsoft_variant_idx` ON `product_variants` (`rbmsoftVariantId`);--> statement-breakpoint
CREATE INDEX `products_status_idx` ON `products` (`status`);--> statement-breakpoint
CREATE INDEX `products_category_idx` ON `products` (`category`);--> statement-breakpoint
CREATE INDEX `products_audience_idx` ON `products` (`audience`);--> statement-breakpoint
CREATE INDEX `products_rbmsoft_item_idx` ON `products` (`rbmsoftItemId`);--> statement-breakpoint
CREATE INDEX `stock_reservations_order_idx` ON `stock_reservations` (`orderId`);--> statement-breakpoint
CREATE INDEX `stock_reservations_variant_idx` ON `stock_reservations` (`variantId`);--> statement-breakpoint
CREATE INDEX `stock_reservations_status_expiry_idx` ON `stock_reservations` (`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `sync_conflicts_unresolved_idx` ON `sync_conflicts` (`resolvedAt`);--> statement-breakpoint
CREATE INDEX `sync_runs_started_idx` ON `sync_runs` (`startedAt`);