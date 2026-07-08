import { Router, type IRouter } from "express";
import { and, gte, lte, eq, inArray } from "drizzle-orm";
import { db, campaignsTable, shoppingCentersTable, campaignPlacementsTable } from "@workspace/db";
import { GetGridQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/grid", async (req, res): Promise<void> => {
  const parsed = GetGridQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    date,
    cities,
    format,
    status,
    showActiveOnly = true,
    loadFilter = "all",
    searchCampaign,
    searchClient,
  } = parsed.data;

  const today = date ?? new Date().toISOString().slice(0, 10);

  // Build campaign filter conditions
  const campaignConditions = [];
  if (showActiveOnly) {
    campaignConditions.push(lte(campaignsTable.startDate, today));
    campaignConditions.push(gte(campaignsTable.endDate, today));
  }

  // Fetch active campaigns (filtered by date)
  let activeCampaigns = await db
    .select()
    .from(campaignsTable)
    .where(campaignConditions.length > 0 ? and(...campaignConditions) : undefined);

  // Apply campaign-level filters
  if (status) {
    activeCampaigns = activeCampaigns.filter((c) => c.status === status);
  }
  if (searchCampaign) {
    const lower = searchCampaign.toLowerCase();
    activeCampaigns = activeCampaigns.filter((c) =>
      c.name.toLowerCase().includes(lower),
    );
  }
  if (searchClient) {
    const lower = searchClient.toLowerCase();
    activeCampaigns = activeCampaigns.filter((c) =>
      c.client.toLowerCase().includes(lower),
    );
  }

  if (activeCampaigns.length === 0) {
    // Return empty grid grouped by city
    let allSCs = await db.select().from(shoppingCentersTable);
    if (cities && cities.length > 0) {
      allSCs = allSCs.filter((sc) => cities.includes(sc.city));
    }
    if (format) {
      allSCs = allSCs.filter((sc) => sc.format === format);
    }

    const cityMap = new Map<string, typeof allSCs>();
    for (const sc of allSCs) {
      if (!cityMap.has(sc.city)) cityMap.set(sc.city, []);
      cityMap.get(sc.city)!.push(sc);
    }

    const cityEntries = [...cityMap.entries()].map(([city, scs]) => ({
      city,
      campaigns: [],
      shoppingCenters: scs.map((sc) => ({
        ...sc,
        totalDuration: 0,
        campaigns: [],
      })),
    }));

    res.json({ date: today, cities: cityEntries });
    return;
  }

  const campaignIds = activeCampaigns.map((c) => c.id);

  // Get all placements for active campaigns using proper SQL inArray filter
  const filteredPlacements = await db
    .select({
      campaignId: campaignPlacementsTable.campaignId,
      sc: shoppingCentersTable,
    })
    .from(campaignPlacementsTable)
    .innerJoin(
      shoppingCentersTable,
      eq(campaignPlacementsTable.shoppingCenterId, shoppingCentersTable.id),
    )
    .where(inArray(campaignPlacementsTable.campaignId, campaignIds));

  // Get all shopping centers, apply city/format filters
  let allSCs = await db.select().from(shoppingCentersTable);
  if (cities && cities.length > 0) {
    allSCs = allSCs.filter((sc) => cities.includes(sc.city));
  }
  if (format) {
    allSCs = allSCs.filter((sc) => sc.format === format);
  }

  // Build SC -> campaigns mapping
  const scToCampaigns = new Map<
    number,
    Map<number, (typeof activeCampaigns)[0]>
  >();
  for (const sc of allSCs) {
    scToCampaigns.set(sc.id, new Map());
  }

  for (const p of filteredPlacements) {
    const scMap = scToCampaigns.get(p.sc.id);
    if (!scMap) continue; // SC was filtered out
    const campaign = activeCampaigns.find((c) => c.id === p.campaignId);
    if (!campaign) continue;
    scMap.set(campaign.id, campaign);
  }

  // Build city grouping
  const cityMap = new Map<
    string,
    {
      city: string;
      campaignSet: Map<number, (typeof activeCampaigns)[0]>;
      shoppingCenters: Array<{
        id: number;
        number: string;
        address: string | null;
        city: string;
        format: string;
        totalDuration: number;
        campaigns: Array<{
          id: number;
          name: string;
          duration: number;
          client: string;
          status: string;
        }>;
      }>;
    }
  >();

  for (const sc of allSCs) {
    if (!cityMap.has(sc.city)) {
      cityMap.set(sc.city, {
        city: sc.city,
        campaignSet: new Map(),
        shoppingCenters: [],
      });
    }

    const cityData = cityMap.get(sc.city)!;
    const campaignsForSc = scToCampaigns.get(sc.id) ?? new Map();
    const campaignList = [...campaignsForSc.values()].map((c) => ({
      id: c.id,
      name: c.name,
      duration: c.duration,
      client: c.client,
      status: c.status,
    }));

    const totalDuration = campaignList.reduce((s, c) => s + c.duration, 0);

    // Apply load filter
    if (loadFilter === "overloaded" && totalDuration < 300) continue;
    if (loadFilter === "free" && totalDuration >= 180) continue;

    // Add to city campaigns set
    for (const [id, c] of campaignsForSc) {
      cityData.campaignSet.set(id, c);
    }

    cityData.shoppingCenters.push({
      ...sc,
      totalDuration,
      campaigns: campaignList,
    });
  }

  const result = [...cityMap.values()]
    .filter((city) => city.shoppingCenters.length > 0)
    .map((city) => ({
      city: city.city,
      campaigns: [...city.campaignSet.values()].map((c) => ({
        id: c.id,
        name: c.name,
        duration: c.duration,
        client: c.client,
        status: c.status,
      })),
      shoppingCenters: city.shoppingCenters,
    }));

  res.json({ date: today, cities: result });
});

export default router;
