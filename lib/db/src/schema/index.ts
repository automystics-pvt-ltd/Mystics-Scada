// Export your models here. Add one export per file
// Each model/table should ideally be split into different files.

// Core tenant model — must be exported before tables that reference it
export * from "./organizations";

// IoT device tables (templateTemplates must come before devices to avoid circular FK)
export * from "./deviceTemplates";

// Domain tables (all scoped to an org via org_id)
export * from "./alerts";
export * from "./workOrders";
export * from "./users";
export * from "./reports";
export * from "./devices";
export * from "./deviceReadings";
export * from "./deviceCommLogs";
export * from "./firmwareVersionHistory";
export * from "./auditLogs";
export * from "./faultOverrides";
export * from "./notifications";
export * from "./reportSchedules";
export * from "./ingestionRetryQueue";
export * from "./ftpSources";
