import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });

type UnitInput = { unit_name: string; unit_order?: number; window_type?: string; extension_status?: string };
type LocationInput = { location_name: string; location_order?: number; orientation?: string; units: UnitInput[] };
type Payload = {
  site_display_name: string;
  customer_display_name?: string;
  address_summary?: string;
  building?: string;
  unit?: string;
  consent_confirmed?: boolean;
  app_version?: string;
  locations: LocationInput[];
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  const authorization = req.headers.get("Authorization");
  if (!authorization) return reply(401, { error: "unauthorized" });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return reply(500, { error: "server_configuration_error" });

  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData.user;
  if (userError || !user) return reply(401, { error: "unauthorized" });

  const { data: employee } = await admin.from("window_employee_links").select("active").eq("window_auth_user_id", user.id).maybeSingle();
  if (!employee?.active) return reply(403, { error: "inactive_or_unlinked_employee" });

  let payload: Payload;
  try { payload = await req.json(); } catch { return reply(400, { error: "invalid_json" }); }

  if (!payload.site_display_name?.trim() || !Array.isArray(payload.locations) || payload.locations.length === 0) {
    return reply(400, { error: "missing_required_fields" });
  }
  if (payload.locations.some((location) => !location.location_name?.trim() || !Array.isArray(location.units) || location.units.length === 0)) {
    return reply(400, { error: "each_location_requires_units" });
  }

  const { data: inspection, error: inspectionError } = await admin.from("window_inspections").insert({
    created_by: user.id,
    assigned_employee_id: user.id,
    status: "capturing",
    site_display_name: payload.site_display_name.trim(),
    customer_display_name: payload.customer_display_name?.trim() || null,
    address_summary: payload.address_summary?.trim() || null,
    building: payload.building?.trim() || null,
    unit: payload.unit?.trim() || null,
    consent_confirmed: Boolean(payload.consent_confirmed),
    consent_confirmed_at: payload.consent_confirmed ? new Date().toISOString() : null,
    app_version: payload.app_version || "0.3.0-dev",
  }).select("id, status, created_at").single();

  if (inspectionError) return reply(500, { error: "inspection_create_failed" });

  const createdLocations = [];
  try {
    for (const [locationIndex, location] of payload.locations.entries()) {
      const { data: locationRow, error: locationError } = await admin.from("window_inspection_locations").insert({
        inspection_id: inspection.id,
        location_name: location.location_name.trim(),
        location_order: location.location_order ?? locationIndex,
        orientation: location.orientation?.trim() || null,
      }).select("id, location_name, location_order").single();
      if (locationError) throw locationError;

      const unitsPayload = location.units.map((unit, unitIndex) => ({
        inspection_id: inspection.id,
        location_id: locationRow.id,
        unit_name: unit.unit_name.trim(),
        unit_order: unit.unit_order ?? unitIndex,
        window_type: unit.window_type?.trim() || null,
        extension_status: unit.extension_status?.trim() || null,
      }));
      const { data: units, error: unitError } = await admin.from("window_units").insert(unitsPayload).select("id, unit_name, unit_order");
      if (unitError) throw unitError;
      createdLocations.push({ ...locationRow, units: units ?? [] });
    }
  } catch (error) {
    await admin.from("window_inspections").delete().eq("id", inspection.id);
    return reply(500, { error: "inspection_tree_create_failed", detail: error instanceof Error ? error.message : "unknown" });
  }

  await admin.from("window_audit_logs").insert({
    user_id: user.id,
    action: "window_inspection_created",
    entity_type: "window_inspection",
    entity_id: inspection.id,
    metadata_without_personal_data: {
      location_count: createdLocations.length,
      window_unit_count: createdLocations.reduce((total, item) => total + item.units.length, 0),
    },
  });

  return reply(201, { inspection, locations: createdLocations });
});
