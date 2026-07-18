import { createClient } from "@/lib/supabase-server";
import { normalizePhone } from "@/lib/crm/parse-inquiry";
import type { Customer } from "@/types/database";

export type DuplicateMatchReason =
  | "source_order_no"
  | "phone"
  | "name_address";

export type DuplicateCandidate = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  source_order_no: string | null;
  reason: DuplicateMatchReason;
};

function normalizeAddress(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toLowerCase();
}

export async function findInquiryDuplicates(input: {
  source_order_no?: string | null;
  phone?: string | null;
  name?: string | null;
  address?: string | null;
}): Promise<DuplicateCandidate[]> {
  const supabase = await createClient();
  const results: DuplicateCandidate[] = [];
  const seen = new Set<string>();

  const orderNo = (input.source_order_no ?? "").trim();
  if (orderNo) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone, address, source_order_no")
      .eq("source_order_no", orderNo)
      .is("deleted_at", null)
      .limit(5);
    if (!error && data) {
      for (const row of data as Customer[]) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        results.push({
          id: row.id,
          name: row.name,
          phone: row.phone,
          address: row.address,
          source_order_no: row.source_order_no ?? null,
          reason: "source_order_no",
        });
      }
    }
  }

  const phone = normalizePhone(input.phone ?? "");
  if (phone) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone, address, source_order_no")
      .eq("phone", phone)
      .is("deleted_at", null)
      .limit(5);
    if (!error && data) {
      for (const row of data as Customer[]) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        results.push({
          id: row.id,
          name: row.name,
          phone: row.phone,
          address: row.address,
          source_order_no: row.source_order_no ?? null,
          reason: "phone",
        });
      }
    }
  }

  const name = (input.name ?? "").trim();
  const addrKey = normalizeAddress(input.address);
  if (name && addrKey) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone, address, source_order_no")
      .eq("name", name)
      .is("deleted_at", null)
      .limit(20);
    if (!error && data) {
      for (const row of data as Customer[]) {
        if (normalizeAddress(row.address) !== addrKey) continue;
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        results.push({
          id: row.id,
          name: row.name,
          phone: row.phone,
          address: row.address,
          source_order_no: row.source_order_no ?? null,
          reason: "name_address",
        });
      }
    }
  }

  return results;
}
