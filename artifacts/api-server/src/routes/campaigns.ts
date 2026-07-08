import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, campaignsTable, shoppingCentersTable, campaignPlacementsTable } from "@workspace/db";
import {
  ListCampaignsQueryParams,
  GetCampaignParams,
  DeleteCampaignParams,
  BulkDeleteCampaignsBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/campaigns", async (req, res): Promise<void> => {
  const parsed = ListCampaignsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { search, status, showActiveOnly, date } = parsed.data;
  const today = date ?? new Date().toISOString().slice(0, 10);

  let rows = await db.select().from(campaignsTable);

  if (showActiveOnly) {
    rows = rows.filter((c) => c.startDate <= today && c.endDate >= today);
  }
  if (status) {
    rows = rows.filter((c) => c.status === status);
  }
  if (search) {
    const lower = search.toLowerCase();
    rows = rows.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        c.client.toLowerCase().includes(lower),
    );
  }

  res.json(rows);
});

router.post("/campaigns/bulk-delete", async (req, res): Promise<void> => {
  const parsed = BulkDeleteCampaignsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { ids } = parsed.data;
  if (ids.length === 0) {
    res.json({ success: true, deleted: 0 });
    return;
  }

  const deleted = await db
    .delete(campaignsTable)
    .where(inArray(campaignsTable.id, ids))
    .returning();

  res.json({ success: true, deleted: deleted.length });
});

router.get("/campaigns/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetCampaignParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, params.data.id));

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  // Get placements with shopping center data
  const placements = await db
    .select({ sc: shoppingCentersTable })
    .from(campaignPlacementsTable)
    .innerJoin(
      shoppingCentersTable,
      eq(campaignPlacementsTable.shoppingCenterId, shoppingCentersTable.id),
    )
    .where(eq(campaignPlacementsTable.campaignId, campaign.id));

  const shoppingCenters = placements.map((p) => p.sc);

  res.json({ ...campaign, shoppingCenters });
});

router.delete("/campaigns/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteCampaignParams.safeParse({ id: parseInt(rawId, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(campaignsTable)
    .where(eq(campaignsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  res.json({ success: true, deleted: 1 });
});

export default router;
