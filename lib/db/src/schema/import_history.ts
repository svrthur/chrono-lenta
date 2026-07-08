import { pgTable, serial, integer, timestamp, text, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const importHistoryTable = pgTable("import_history", {
  id: serial("id").primaryKey(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  campaignCount: integer("campaign_count").notNull().default(0),
  placementCount: integer("placement_count").notNull().default(0),
  filename: text("filename"),
  // Snapshot of all campaign + placement data at time of import for rollback
  snapshot: jsonb("snapshot").notNull().$type<{
    campaigns: Array<{
      id?: number;
      name: string;
      client: string;
      duration: number;
      status: string;
      startDate: string;
      endDate: string;
      shoppingCenterNumbers: string[];
    }>;
    shoppingCenters: Array<{
      number: string;
      address: string | null;
      city: string;
      format: string;
    }>;
  }>(),
});

export const insertImportHistorySchema = createInsertSchema(importHistoryTable).omit({ id: true, importedAt: true });
export type InsertImportHistory = z.infer<typeof insertImportHistorySchema>;
export type ImportHistory = typeof importHistoryTable.$inferSelect;
