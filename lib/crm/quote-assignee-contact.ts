import type { Employee, ErpQuote } from "@/types/database";

export type QuoteAssigneeContactResolved = {
  name: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  showBusinessCard: boolean;
  cardPath: string | null;
  /** true면 quotes 스냅샷 사용, false면 employees fallback */
  fromSnapshot: boolean;
};

function hasAssigneeSnapshot(quote: {
  assignee_name?: string | null;
  assignee_title?: string | null;
  assignee_phone?: string | null;
  assignee_email?: string | null;
  assignee_card_path?: string | null;
  assignee_show_business_card?: boolean | null;
}): boolean {
  return (
    quote.assignee_name != null ||
    quote.assignee_title != null ||
    quote.assignee_phone != null ||
    quote.assignee_email != null ||
    quote.assignee_card_path != null ||
    quote.assignee_show_business_card != null
  );
}

/** 스냅샷 우선, 없으면 assigned employees 조인 fallback */
export function resolveQuoteAssigneeContact(
  quote: Pick<
    ErpQuote,
    | "assignee_name"
    | "assignee_title"
    | "assignee_phone"
    | "assignee_email"
    | "assignee_card_path"
    | "assignee_show_business_card"
    | "employees"
  >,
): QuoteAssigneeContactResolved {
  if (hasAssigneeSnapshot(quote)) {
    return {
      name: quote.assignee_name?.trim() || null,
      title: quote.assignee_title?.trim() || null,
      phone: quote.assignee_phone?.trim() || null,
      email: quote.assignee_email?.trim() || null,
      showBusinessCard: Boolean(quote.assignee_show_business_card),
      cardPath: quote.assignee_card_path?.trim() || null,
      fromSnapshot: true,
    };
  }

  const emp = quote.employees;
  if (!emp) {
    return {
      name: null,
      title: null,
      phone: null,
      email: null,
      showBusinessCard: false,
      cardPath: null,
      fromSnapshot: false,
    };
  }

  return {
    name: emp.name?.trim() || null,
    title: emp.title?.trim() || null,
    phone: emp.phone?.trim() || null,
    email: emp.email?.trim() || null,
    showBusinessCard: Boolean(emp.show_business_card_on_quote),
    cardPath: emp.business_card_path?.trim() || null,
    fromSnapshot: false,
  };
}

export function resolveLiveEmployeeAssigneeContact(
  employee: Pick<
    Employee,
    | "name"
    | "title"
    | "phone"
    | "email"
    | "business_card_path"
    | "show_business_card_on_quote"
  > | null
  | undefined,
): QuoteAssigneeContactResolved {
  if (!employee) {
    return {
      name: null,
      title: null,
      phone: null,
      email: null,
      showBusinessCard: false,
      cardPath: null,
      fromSnapshot: false,
    };
  }
  return {
    name: employee.name?.trim() || null,
    title: employee.title?.trim() || null,
    phone: employee.phone?.trim() || null,
    email: employee.email?.trim() || null,
    showBusinessCard: Boolean(employee.show_business_card_on_quote),
    cardPath: employee.business_card_path?.trim() || null,
    fromSnapshot: false,
  };
}
