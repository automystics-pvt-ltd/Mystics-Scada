CREATE TYPE "public"."retry_status" AS ENUM('pending', 'processing', 'done', 'failed');;
CREATE TYPE "public"."ftp_protocol" AS ENUM('ftp', 'ftps', 'sftp');;
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan_tier" text DEFAULT 'starter' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
;
CREATE TABLE "device_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"manufacturer" text NOT NULL,
	"model" text NOT NULL,
	"protocol" text NOT NULL,
	"field_map" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_poll_interval_s" integer DEFAULT 30 NOT NULL,
	"firmware_version_param" text,
	"latest_firmware_version" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
;
CREATE TABLE "gateway_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
;
CREATE TABLE "alert_history" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"alert_id" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"note" text,
	"sort_order" text NOT NULL
);
;
CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"plant_id" text NOT NULL,
	"plant_name" text NOT NULL,
	"device_type" text NOT NULL,
	"device_name" text NOT NULL,
	"device_id" text,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"severity" text NOT NULL,
	"status" text NOT NULL,
	"assigned_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone
);
;
CREATE TABLE "work_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"plant_id" text NOT NULL,
	"plant_name" text NOT NULL,
	"equipment" text NOT NULL,
	"fault_description" text NOT NULL,
	"priority" text NOT NULL,
	"status" text NOT NULL,
	"assigned_to" text,
	"source_alert_id" text,
	"root_cause" text,
	"resolution_notes" text,
	"sla_breached" boolean DEFAULT false NOT NULL,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
;
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"permissions" text[] DEFAULT '{}' NOT NULL
);
;
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role_id" text NOT NULL,
	"plant_ids" text[] DEFAULT '{}' NOT NULL,
	"status" text NOT NULL,
	"password_hash" text,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"user_preferences" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
;
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"format" text NOT NULL,
	"plant_ids" text[] DEFAULT '{}' NOT NULL,
	"status" text NOT NULL,
	"requested_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"download_url" text,
	"report_type" text,
	"date_from" timestamp with time zone,
	"date_to" timestamp with time zone
);
;
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"plant_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"protocol" text NOT NULL,
	"status" text DEFAULT 'offline' NOT NULL,
	"firmware_version" text,
	"last_seen_at" timestamp with time zone,
	"health_score" integer,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"template_id" text,
	"gateway_id" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
;
CREATE TABLE "device_readings" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"org_id" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL
);
;
CREATE TABLE "device_comm_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"event_type" text NOT NULL,
	"message" text,
	"rtt_ms" integer,
	"register_addr" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
;
CREATE TABLE "firmware_version_history" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"previous_version" text,
	"new_version" text NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
;
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
;
CREATE TABLE "notification_configs" (
	"org_id" text NOT NULL,
	"channel" text NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_configs_org_id_channel_pk" PRIMARY KEY("org_id","channel")
);
;
CREATE TABLE "fault_overrides" (
	"key" text PRIMARY KEY NOT NULL,
	"plant_id" text NOT NULL,
	"org_id" text NOT NULL,
	"target_json" jsonb NOT NULL,
	"label" text NOT NULL,
	"injected_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"alert_id" text
);
;
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"resource_url" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
;
CREATE TABLE "report_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"report_type" text NOT NULL,
	"plant_ids" text[] DEFAULT '{}' NOT NULL,
	"format" text DEFAULT 'pdf' NOT NULL,
	"frequency" text NOT NULL,
	"day_of_week" integer,
	"time_utc" text DEFAULT '08:00' NOT NULL,
	"recipients" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_schedules_org_type_freq_uq" UNIQUE("org_id","report_type","frequency")
);
;
CREATE TABLE "ingestion_retry_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"org_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"status" "retry_status" DEFAULT 'pending' NOT NULL,
	"next_retry_at" timestamp with time zone NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone NOT NULL
);
;
CREATE TABLE "ftp_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"device_id" text,
	"name" text NOT NULL,
	"host" text NOT NULL,
	"port" integer DEFAULT 21 NOT NULL,
	"protocol" "ftp_protocol" DEFAULT 'ftp' NOT NULL,
	"username" text NOT NULL,
	"password_enc" text NOT NULL,
	"remote_path" text DEFAULT '/' NOT NULL,
	"file_pattern" text DEFAULT '*.csv' NOT NULL,
	"interval_minutes" integer DEFAULT 60 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_pulled_at" timestamp with time zone,
	"last_pulled_file" text,
	"last_error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
;
ALTER TABLE "gateway_tokens" ADD CONSTRAINT "gateway_tokens_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;;
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;;
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE no action ON UPDATE no action;;
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;;
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;;
ALTER TABLE "roles" ADD CONSTRAINT "roles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;;
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;;
ALTER TABLE "reports" ADD CONSTRAINT "reports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;;
ALTER TABLE "devices" ADD CONSTRAINT "devices_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;;
ALTER TABLE "devices" ADD CONSTRAINT "devices_template_id_device_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."device_templates"("id") ON DELETE set null ON UPDATE no action;;
ALTER TABLE "devices" ADD CONSTRAINT "devices_gateway_id_gateway_tokens_id_fk" FOREIGN KEY ("gateway_id") REFERENCES "public"."gateway_tokens"("id") ON DELETE set null ON UPDATE no action;;
ALTER TABLE "device_readings" ADD CONSTRAINT "device_readings_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "device_readings" ADD CONSTRAINT "device_readings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "device_comm_logs" ADD CONSTRAINT "device_comm_logs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "firmware_version_history" ADD CONSTRAINT "firmware_version_history_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;;
ALTER TABLE "notification_configs" ADD CONSTRAINT "notification_configs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;;
ALTER TABLE "fault_overrides" ADD CONSTRAINT "fault_overrides_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;;
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;;
ALTER TABLE "ingestion_retry_queue" ADD CONSTRAINT "ingestion_retry_queue_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "ingestion_retry_queue" ADD CONSTRAINT "ingestion_retry_queue_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "ftp_sources" ADD CONSTRAINT "ftp_sources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;;
ALTER TABLE "ftp_sources" ADD CONSTRAINT "ftp_sources_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;;
CREATE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");;
CREATE INDEX "organizations_status_idx" ON "organizations" USING btree ("status");;
CREATE INDEX "device_templates_org_idx" ON "device_templates" USING btree ("org_id");;
CREATE INDEX "device_templates_protocol_idx" ON "device_templates" USING btree ("protocol");;
CREATE INDEX "gateway_tokens_org_id_idx" ON "gateway_tokens" USING btree ("org_id");;
CREATE INDEX "gateway_tokens_token_hash_idx" ON "gateway_tokens" USING btree ("token_hash");;
CREATE INDEX "alert_history_org_id_idx" ON "alert_history" USING btree ("org_id");;
CREATE INDEX "alert_history_alert_id_idx" ON "alert_history" USING btree ("alert_id");;
CREATE INDEX "alerts_org_id_idx" ON "alerts" USING btree ("org_id");;
CREATE INDEX "alerts_org_plant_idx" ON "alerts" USING btree ("org_id","plant_id");;
CREATE INDEX "alerts_org_status_idx" ON "alerts" USING btree ("org_id","status");;
CREATE INDEX "work_orders_org_id_idx" ON "work_orders" USING btree ("org_id");;
CREATE INDEX "work_orders_org_plant_idx" ON "work_orders" USING btree ("org_id","plant_id");;
CREATE INDEX "work_orders_org_status_idx" ON "work_orders" USING btree ("org_id","status");;
CREATE INDEX "roles_org_id_idx" ON "roles" USING btree ("org_id");;
CREATE INDEX "users_org_id_idx" ON "users" USING btree ("org_id");;
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");;
CREATE INDEX "users_org_email_idx" ON "users" USING btree ("org_id","email");;
CREATE INDEX "reports_org_id_idx" ON "reports" USING btree ("org_id");;
CREATE INDEX "reports_org_status_idx" ON "reports" USING btree ("org_id","status");;
CREATE INDEX "devices_org_id_idx" ON "devices" USING btree ("org_id");;
CREATE INDEX "devices_plant_id_idx" ON "devices" USING btree ("plant_id");;
CREATE INDEX "devices_org_plant_idx" ON "devices" USING btree ("org_id","plant_id");;
CREATE INDEX "devices_gateway_id_idx" ON "devices" USING btree ("gateway_id");;
CREATE INDEX "device_readings_device_ts_idx" ON "device_readings" USING btree ("device_id","ts");;
CREATE INDEX "device_readings_org_ts_idx" ON "device_readings" USING btree ("org_id","ts");;
CREATE INDEX "device_comm_logs_device_occurred_idx" ON "device_comm_logs" USING btree ("device_id","occurred_at");;
CREATE INDEX "firmware_version_history_device_detected_idx" ON "firmware_version_history" USING btree ("device_id","detected_at");;
CREATE INDEX "audit_logs_org_id_idx" ON "audit_logs" USING btree ("org_id");;
CREATE INDEX "audit_logs_org_created_idx" ON "audit_logs" USING btree ("org_id","created_at");;
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");;
CREATE INDEX "notification_configs_org_id_idx" ON "notification_configs" USING btree ("org_id");;
CREATE INDEX "notifications_org_id_idx" ON "notifications" USING btree ("org_id");;
CREATE INDEX "notifications_org_read_idx" ON "notifications" USING btree ("org_id","is_read");;
CREATE INDEX "notifications_org_created_idx" ON "notifications" USING btree ("org_id","created_at");;
CREATE INDEX "report_schedules_org_id_idx" ON "report_schedules" USING btree ("org_id");;
CREATE INDEX "irq_status_retry_idx" ON "ingestion_retry_queue" USING btree ("status","next_retry_at");;
CREATE INDEX "irq_device_idx" ON "ingestion_retry_queue" USING btree ("device_id");;
CREATE INDEX "ftp_sources_org_idx" ON "ftp_sources" USING btree ("org_id");;
CREATE INDEX "ftp_sources_active_idx" ON "ftp_sources" USING btree ("active","org_id");