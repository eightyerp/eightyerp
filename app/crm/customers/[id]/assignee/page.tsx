import Link from "next/link";
import { notFound } from "next/navigation";
import { updateCrmCustomerAssigneeAction } from "@/app/actions/crm-assignee";
import { getCurrentUserAccess } from "@/lib/crm/access";
import { getCustomerById, getEmployees } from "@/lib/crm/customers";

export default async function CrmCustomerAssigneePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [customer, access, employees] = await Promise.all([
    getCustomerById(id),
    getCurrentUserAccess(),
    getEmployees(),
  ]);

  if (!customer || customer.deleted_at) notFound();

  const currentAssignee = customer.employees
    ? [customer.employees.name, customer.employees.title].filter(Boolean).join(" ")
    : "미배정";

  return (
    <div className="space-y-5">
      <section>
        <Link href={`/crm/customers/${id}`} className="text-xs font-bold text-slate-500">
          ← 고객 상세
        </Link>
        <p className="mt-4 text-xs font-semibold text-slate-500">관리자 빠른 처리</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
          담당자 배정
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {customer.name} · 현재 {currentAssignee}
        </p>
      </section>

      {!access.isAdmin ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-black text-amber-900">담당자 변경 권한이 없습니다.</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">
            관리자 계정에서 고객 담당자를 지정해 주세요.
          </p>
        </div>
      ) : (
        <form action={updateCrmCustomerAssigneeAction} className="space-y-4">
          <input type="hidden" name="customer_id" value={customer.id} />

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="block text-xs font-bold text-slate-600">
              배정할 담당자
              <select
                name="assigned_employee_id"
                required
                defaultValue={customer.assigned_employee_id ?? ""}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3.5 text-sm font-bold text-slate-800 outline-none focus:border-navy-900"
              >
                <option value="" disabled>
                  담당자 선택
                </option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {[employee.name, employee.title].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <button
            type="submit"
            className="w-full rounded-2xl bg-navy-900 px-4 py-4 text-sm font-black text-white"
          >
            담당자 배정
          </button>

          <p className="px-2 text-center text-[11px] leading-5 text-slate-400">
            회사에서 배정된 고객은 새 담당자에게 CRM 알림 대상으로 연결됩니다.
          </p>
        </form>
      )}
    </div>
  );
}
