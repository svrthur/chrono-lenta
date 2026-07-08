import { pgTable, text, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shoppingCentersTable = pgTable("shopping_centers", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(),
  address: text("address"),
  city: text("city").notNull(),
  format: text("format").notNull(), // "ГМ" | "СМ"
});

export const insertShoppingCenterSchema = createInsertSchema(shoppingCentersTable).omit({ id: true });
export type InsertShoppingCenter = z.infer<typeof insertShoppingCenterSchema>;
export type ShoppingCenter = typeof shoppingCentersTable.$inferSelect;
