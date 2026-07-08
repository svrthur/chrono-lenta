import { Router, type IRouter } from "express";
import { and, gte, lte, eq, inArray } from "drizzle-orm";
import { db, campaignsTable, shoppingCentersTable, campaignPlacementsTable } from "@workspace/db";
import { GetStatisticsQueryParams, GetKpiQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/statistics", async (req, res): Promise<void> => {
  const parsed = GetStatisticsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { date, cities, format } = parsed.data;
  const today = date ?? new Date().toISOString().slice(0, 10);

  // Get all campaigns active on the date
  const activeCampaigns = await db
    .select()
    .from(campaignsTable)
    .where(and(lte(campaignsTable.startDate, today), gte(campaignsTable.endDate, today)));

  if (activeCampaigns.length === 0) {
    res.json({
      date: today,
      totalDuration: 0,
      paidDuration: 0,
      unpaidDuration: 0,
      gmDuration: 0,
      smDuration: 0,
      gmSmDuration: 0,
    });
    return;
  }

  const campaignIds = activeCampaigns.map((c) => c.id);

  // Get placements with SC data for filtering
  const placements = await db
    .select({ campaign: campaignsTable, sc: shoppingCentersTable })
    .from(campaignPlacementsTable)
    .innerJoin(campaignsTable, eq(campaignPlacementsTable.campaignId, campaignsTable.id))
    .innerJoin(shoppingCentersTable, eq(campaignPlacementsTable.shoppingCenterId, shoppingCentersTable.id))
    .where(
      and(
        lte(campaignsTable.startDate, today),
        gte(campaignsTable.endDate, today),
      ),
    );

  let filtered = placements;

  if (cities && cities.length > 0) {
    filtered = filtered.filter((p) => cities.includes(p.sc.city));
  }
  if (format) {
    filtered = filtered.filter((p) => p.sc.format === format);
  }

  // Calculate per-SC totals to avoid double-counting when a campaign spans multiple SCs
  // Statistics are sum of durations per placement (each placement counts once)
  let totalDuration = 0;
  let paidDuration = 0;
  let unpaidDuration = 0;
  let gmDuration = 0;
  let smDuration = 0;

  for (const p of filtered) {
    const dur = p.campaign.duration;
    totalDuration += dur;
    if (p.campaign.status === "Платник") paidDuration += dur;
    else unpaidDuration += dur;
    if (p.sc.format === "ГМ") gmDuration += dur;
    else if (p.sc.format === "СМ") smDuration += dur;
  }

  res.json({
    date: today,
    totalDuration,
    paidDuration,
    unpaidDuration,
    gmDuration,
    smDuration,
    gmSmDuration: gmDuration + smDuration,
  });
});

router.get("/kpi", async (req, res): Promise<void> => {
  const parsed = GetKpiQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { date, cities } = parsed.data;
  const today = date ?? new Date().toISOString().slice(0, 10);

  // Active campaigns on the date
  const activeCampaigns = await db
    .select()
    .from(campaignsTable)
    .where(and(lte(campaignsTable.startDate, today), gte(campaignsTable.endDate, today)));

  const campaignIds = activeCampaigns.map((c) => c.id);

  if (campaignIds.length === 0) {
    const totalSCs = await db.select().from(shoppingCentersTable);
    res.json({
      activeCampaigns: 0,
      uniqueClients: 0,
      totalShoppingCenters: totalSCs.length,
      totalDuration: 0,
      avgDurationPerSc: 0,
      busiestScNumber: null,
    });
    return;
  }

  // Placements for active campaigns
  let placements = await db
    .select({ campaign: campaignsTable, sc: shoppingCentersTable })
    .from(campaignPlacementsTable)
    .innerJoin(campaignsTable, eq(campaignPlacementsTable.campaignId, campaignsTable.id))
    .innerJoin(shoppingCentersTable, eq(campaignPlacementsTable.shoppingCenterId, shoppingCentersTable.id))
    .where(inArray(campaignPlacementsTable.campaignId, campaignIds));

  if (cities && cities.length > 0) {
    placements = placements.filter((p) => cities.includes(p.sc.city));
  }

  // All KPI metrics derived from the same filtered placement set for consistency
  const filteredCampaignIds = new Set(placements.map((p) => p.campaign.id));
  const filteredScIds = new Set(placements.map((p) => p.sc.id));

  const uniqueClientSet = new Set(
    placements.map((p) => p.campaign.client),
  );

  // Per-SC total duration
  const scDurations = new Map<number, { number: string; total: number }>();
  for (const p of placements) {
    const existing = scDurations.get(p.sc.id);
    if (existing) {
      existing.total += p.campaign.duration;
    } else {
      scDurations.set(p.sc.id, { number: p.sc.number, total: p.campaign.duration });
    }
  }

  const totalDuration = [...scDurations.values()].reduce((s, v) => s + v.total, 0);
  const scCount = scDurations.size;
  const avgDurationPerSc = scCount > 0 ? Math.round(totalDuration / scCount) : 0;

  let busiestScNumber: string | null = null;
  let maxDuration = 0;
  for (const v of scDurations.values()) {
    if (v.total > maxDuration) {
      maxDuration = v.total;
      busiestScNumber = v.number;
    }
  }

  const allSCs = await db.select().from(shoppingCentersTable);

  res.json({
    activeCampaigns: filteredCampaignIds.size,
    uniqueClients: uniqueClientSet.size,
    totalShoppingCenters: allSCs.length,
    totalDuration,
    avgDurationPerSc,
    busiestScNumber,
  });
});

export default router;
