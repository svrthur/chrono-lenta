import { pgTable, serial, integer, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";
import { shoppingCentersTable } from "./shopping_centers";

export const campaignPlacementsTable = pgTable("campaign_placements", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
  shoppingCenterId: integer("shopping_center_id").notNull().references(() => shoppingCentersTable.id, { onDelete: "cascade" }),
}, (t) => [
  unique("unique_campaign_placement").on(t.campaignId, t.shoppingCenterId),
]);

export const insertCampaignPlacementSchema = createInsertSchema(campaignPlacementsTable).omit({ id: true });
export type InsertCampaignPlacement = z.infer<typeof insertCampaignPlacementSchema>;
export type CampaignPlacement = typeof campaignPlacementsTable.$inferSelect;
