import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, campaignsTable, shoppingCentersTable, campaignPlacementsTable } from "@workspace/db";
import {
  ListCampaignsQueryParams,
  GetCampaignParams,
  DeleteCampaignParams,
  BulkDeleteCampaignsBody,
  CreateCampaignBody,
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

router.post("/campaigns", async (req, res): Promise<void> => {
  const parsed = CreateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, startDate, endDate, client, status, duration, shoppingCenterNumbers } = parsed.data;

  if (startDate > endDate) {
    res.status(400).json({ error: "Дата начала не может быть позже даты окончания" });
    return;
  }

  // Resolve SC numbers to IDs, create placeholders for unknown ones
  const existingSCs = await db.select().from(shoppingCentersTable);
  const scByNumber = new Map(existingSCs.map((sc) => [sc.number, sc.id]));

  const unknownNumbers = shoppingCenterNumbers.filter((n) => !scByNumber.has(n));
  if (unknownNumbers.length > 0) {
    const inserted = await db
      .insert(shoppingCentersTable)
      .values(unknownNumbers.map((n) => ({ number: n, city: "Неизвестный", format: "ГМ" as const, address: null })))
      .onConflictDoNothing()
      .returning();
    for (const sc of inserted) scByNumber.set(sc.number, sc.id);
  }

  const [campaign] = await db
    .insert(campaignsTable)
    .values({ name, startDate, endDate, client, status, duration })
    .returning();

  if (shoppingCenterNumbers.length > 0) {
    const placements = shoppingCenterNumbers
      .filter((n) => scByNumber.has(n))
      .map((n) => ({ campaignId: campaign.id, shoppingCenterId: scByNumber.get(n)! }));
    if (placements.length > 0) {
      await db.insert(campaignPlacementsTable).values(placements).onConflictDoNothing();
    }
  }

  const placementRows = await db
    .select({ sc: shoppingCentersTable })
    .from(campaignPlacementsTable)
    .innerJoin(shoppingCentersTable, eq(campaignPlacementsTable.shoppingCenterId, shoppingCentersTable.id))
    .where(eq(campaignPlacementsTable.campaignId, campaign.id));

  const { broadcastDataUpdated } = await import("../lib/sse.js");
  broadcastDataUpdated();

  res.status(201).json({ ...campaign, shoppingCenters: placementRows.map((p) => p.sc) });
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
