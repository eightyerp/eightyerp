"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { updateEmployeeContactAction } from "@/app/actions/employee-contacts";
import type { Employee, Team } from "@/types/database";

type Props = {
  employees: Employee[];
  teams: Team[];
  currentEmployeeId: string | null;
  canManageAll: boolean;
};

export default function EmployeeContactsWorkspace({
  employees,
  teams,
  currentEmployeeId,
  canManageAll,
}: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(
    () => currentEmployeeId || employees[0]?.id || "",
  );
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => employees.find((e) => e.id === selectedId) ?? null,
    [employees, selectedId],
  );

  const teamName = useMemo(() => {
    if (!selected?.team_id) return "-";
    return teams.find((t) => t.id === selected.team_id)?.name ?? "-";
  }, [selected, teams]);

  return (
    <div className="space-y-4">
      {canManageAll && employees.length > 1 ? (
        <label className="block text-sm text-slate-700">
          직원 선택
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setMessage(null);
              setError(null);
            }}
            className="mt-1 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} {e.title}
                {e.phone ? ` · ${e.phone}` : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {!selected ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          표시할 직원이 없습니다.
        </p>
      ) : (
        <form
          className="max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-5"
          action={(formData) => {
            setMessage(null);
            setError(null);
            startTransition(async () => {
              const result = await updateEmployeeContactAction(formData);
              if (result.success) {
                setMessage("저장했습니다.");
                router.refresh();
              } else {
                setError(result.error);
              }
            });
          }}
        >
          <input type="hidden" name="employee_id" value={selected.id} />

          <div>
            <p className="text-xs text-slate-500">이름</p>
            <p className="mt-0.5 text-base font-semibold text-slate-900">
              {selected.name}
            </p>
            <p className="mt-1 text-xs text-slate-500">팀 · {teamName}</p>
          </div>

          <label className="block text-sm text-slate-700">
            직책
            <input
              name="title"
              required
              defaultValue={selected.title ?? ""}
              key={`title-${selected.id}-${selected.updated_at}`}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm text-slate-700">
            휴대전화
            <input
              name="phone"
              defaultValue={selected.phone ?? ""}
              key={`phone-${selected.id}-${selected.updated_at}`}
              placeholder="010-0000-0000"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm text-slate-700">
            이메일
            <input
              name="email"
              type="email"
              defaultValue={selected.email ?? ""}
              key={`email-${selected.id}-${selected.updated_at}`}
              placeholder="name@example.com"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          {message ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
        </form>
      )}
    </div>
  );
}
