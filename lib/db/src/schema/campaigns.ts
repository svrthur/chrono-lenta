import { pgTable, text, serial, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  client: text("client").notNull(),
  duration: integer("duration").notNull(), // seconds
  status: text("status").notNull(), // "Платник" | "Не платник"
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({ id: true });
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
