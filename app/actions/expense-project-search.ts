"use server";

import { searchExpenseProjects } from "@/lib/crm/expense-projects";
import type { ExpenseProjectOption } from "@/lib/crm/expense-shared";

export async function searchExpenseProjectsAction(
  query: string,
): Promise<ExpenseProjectOption[]> {
  return searchExpenseProjects(query, 20);
}
