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

const ALLOWED_FORMATS = ["ГМ", "СМ", "част.ГМ", "част.СМ", "ГМ+СМ"];

function normalizePayerStatus(raw: unknown): "Платник" | "Не платник" {
  if (!raw) return "Не платник";
  const s = String(raw).trim().toLowerCase();
  if (s === "платный" || s === "платник") return "Платник";
  return "Не платник";
}

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
    const normStatus = normalizePayerStatus(status);
    rows = rows.filter((c) => normalizePayerStatus(c.status) === normStatus);
  }
  if (search) {
    const lower = search.toLowerCase();
    rows = rows.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        c.client.toLowerCase().includes(lower),
    );
  }

  // Подгружаем список ТК для всех кампаний
  const allPlacements = await db
    .select({
      campaignId: campaignPlacementsTable.campaignId,
      sc: shoppingCentersTable,
    })
    .from(campaignPlacementsTable)
    .innerJoin(
      shoppingCentersTable,
      eq(campaignPlacementsTable.shoppingCenterId, shoppingCentersTable.id),
    );

  const scByCampaign = new Map<number, (typeof shoppingCentersTable.$inferSelect)[]>();
  for (const p of allPlacements) {
    if (!scByCampaign.has(p.campaignId)) {
      scByCampaign.set(p.campaignId, []);
    }
    scByCampaign.get(p.campaignId)!.push(p.sc);
  }

  const enrichedRows = rows.map((r) => ({
    ...r,
    shoppingCenters: scByCampaign.get(r.id) ?? [],
  }));

  res.json(enrichedRows);
});

router.post("/campaigns", async (req, res): Promise<void> => {
  const normalizedBody = {
    ...req.body,
    status: normalizePayerStatus(req.body?.status ?? req.body?.type),
  };

  const parsed = CreateCampaignBody.safeParse(normalizedBody);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, startDate, endDate, client, status, duration, shoppingCenterNumbers } = parsed.data;
  const note = (req.body?.note as string | undefined) ?? null;
  const tkTypeRaw = (req.body && (req.body.tkType || req.body.tk_type || req.body.format)) as string | undefined;
  const tkType = tkTypeRaw && ALLOWED_FORMATS.includes(tkTypeRaw) ? tkTypeRaw : null;

  if (startDate > endDate) {
    res.status(400).json({ error: "Дата старта не может быть позже даты окончания" });
    return;
  }

  const existingSCs = await db.select().from(shoppingCentersTable);
  const scByNumber = new Map(existingSCs.map((sc) => [sc.number, sc.id]));

  const unknownNumbers = shoppingCenterNumbers.filter((n) => !scByNumber.has(n));
  if (unknownNumbers.length > 0) {
    const defaultFormat = tkType && tkType.includes("СМ") ? "СМ" : "ГМ";
    const inserted = await db
      .insert(shoppingCentersTable)
      .values(unknownNumbers.map((n) => ({ number: n, city: "Неизвестный", format: defaultFormat, address: null })))
      .onConflictDoNothing()
      .returning();
    for (const sc of inserted) scByNumber.set(sc.number, sc.id);
  }

  const [campaign] = await db
    .insert(campaignsTable)
    .values({ name, startDate, endDate, client, status, duration, note, tkType })
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

  const { broadcastDataUpdated } = await import("../lib/sse.js");
  broadcastDataUpdated();

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

  const { broadcastDataUpdated } = await import("../lib/sse.js");
  broadcastDataUpdated();

  res.json({ success: true, deleted: 1 });
});

router.put("/campaigns/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const idParsed = parseInt(rawId, 10);
  if (Number.isNaN(idParsed)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const normalizedBody = {
    ...req.body,
    status: normalizePayerStatus(req.body?.status ?? req.body?.type),
  };

  const parsed = CreateCampaignBody.safeParse(normalizedBody);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, startDate, endDate, client, status, duration, shoppingCenterNumbers } = parsed.data;
  const note = (req.body?.note as string | undefined) ?? null;
  const tkTypeRaw = (req.body && (req.body.tkType || req.body.tk_type || req.body.format)) as string | undefined;
  const tkType = tkTypeRaw && ALLOWED_FORMATS.includes(tkTypeRaw) ? tkTypeRaw : null;

  if (startDate > endDate) {
    res.status(400).json({ error: "Дата старта не может быть позже даты окончания" });
    return;
  }

  const existingSCs = await db.select().from(shoppingCentersTable);
  const scByNumber = new Map(existingSCs.map((sc) => [sc.number, sc.id]));

  const unknownNumbers = shoppingCenterNumbers.filter((n) => !scByNumber.has(n));
  if (unknownNumbers.length > 0) {
    const defaultFormat = tkType && tkType.includes("СМ") ? "СМ" : "ГМ";
    const inserted = await db
      .insert(shoppingCentersTable)
      .values(unknownNumbers.map((n) => ({ number: n, city: "Неизвестный", format: defaultFormat, address: null })))
      .onConflictDoNothing()
      .returning();
    for (const sc of inserted) scByNumber.set(sc.number, sc.id);
  }

  const [updated] = await db
    .update(campaignsTable)
    .set({ name, startDate, endDate, client, status, duration, note, tkType })
    .where(eq(campaignsTable.id, idParsed))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  await db.delete(campaignPlacementsTable).where(eq(campaignPlacementsTable.campaignId, idParsed));

  if (shoppingCenterNumbers.length > 0) {
    const placements = shoppingCenterNumbers
      .filter((n) => scByNumber.has(n))
      .map((n) => ({ campaignId: idParsed, shoppingCenterId: scByNumber.get(n)! }));
    if (placements.length > 0) {
      await db.insert(campaignPlacementsTable).values(placements).onConflictDoNothing();
    }
  }

  const placementRows = await db
    .select({ sc: shoppingCentersTable })
    .from(campaignPlacementsTable)
    .innerJoin(shoppingCentersTable, eq(campaignPlacementsTable.shoppingCenterId, shoppingCentersTable.id))
    .where(eq(campaignPlacementsTable.campaignId, idParsed));

  const { broadcastDataUpdated } = await import("../lib/sse.js");
  broadcastDataUpdated();

  res.json({ ...updated, shoppingCenters: placementRows.map((p) => p.sc) });
});

export default router;
