"use server";

import { listMyCollectionNotifications } from "@/lib/crm/collections";
import type { CollectionNotificationItem } from "@/lib/crm/collection-shared";
import {
  listMyCustomerPushes,
  type CustomerPushItem,
} from "@/lib/crm/customer-push";
import { listMyExpenseNotifications } from "@/lib/crm/expenses";
import type { ExpenseNotificationItem } from "@/lib/crm/expense-shared";

export type ErpNotificationBundle = {
  customers: CustomerPushItem[];
  collections: CollectionNotificationItem[];
  expenses: ExpenseNotificationItem[];
};

/** 상단 알림 3종을 한 Server Action 왕복으로 묶는다. */
export async function getErpNotificationsAction(): Promise<ErpNotificationBundle> {
  const [customers, collections, expenses] = await Promise.all([
    listMyCustomerPushes(10).catch(() => [] as CustomerPushItem[]),
    listMyCollectionNotifications(10).catch(
      () => [] as CollectionNotificationItem[],
    ),
    listMyExpenseNotifications(10).catch(() => [] as ExpenseNotificationItem[]),
  ]);

  return { customers, collections, expenses };
}
