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
  initialCardUrls: Record<string, string>;
};

export default function EmployeeContactsWorkspace({
  employees,
  teams,
  currentEmployeeId,
  canManageAll,
  initialCardUrls,
}: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(
    () => currentEmployeeId || employees[0]?.id || "",
  );
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const selected = useMemo(
    () => employees.find((e) => e.id === selectedId) ?? null,
    [employees, selectedId],
  );

  const teamName = useMemo(() => {
    if (!selected?.team_id) return "-";
    return teams.find((t) => t.id === selected.team_id)?.name ?? "-";
  }, [selected, teams]);

  const existingCardUrl =
    selected?.business_card_path
      ? initialCardUrls[selected.business_card_path] ?? null
      : null;

  function onFileChange(file: File | null) {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
  }

  return (
    <div className="space-y-4">
      {canManageAll && employees.length > 1 ? (
        <label className="block text-sm text-slate-700">
          직원 선택
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setPreviewUrl(null);
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
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          수정할 직원 정보가 없습니다.
        </p>
      ) : (
        <form
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setMessage(null);
            setError(null);
            startTransition(async () => {
              const result = await updateEmployeeContactAction(fd);
              if (result.success) {
                setMessage("저장했습니다. 새 명함은 이후 견적부터 반영됩니다.");
                setPreviewUrl(null);
                router.refresh();
              } else {
                setError(result.error);
              }
            });
          }}
        >
          <input type="hidden" name="employee_id" value={selected.id} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-slate-500">이름</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {selected.name}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">팀</p>
              <p className="mt-1 text-sm text-slate-800">{teamName}</p>
            </div>
          </div>

          <label className="block text-sm text-slate-700">
            직책 *
            <input
              name="title"
              required
              defaultValue={selected.title}
              key={`title-${selected.id}-${selected.updated_at}`}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm text-slate-700">
            휴대전화
            <input
              name="phone"
              type="tel"
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

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-800">명함 이미지</p>
            <p className="text-xs text-slate-500">
              JPG/PNG/WEBP/GIF · 최대 10MB. 새 파일을 올려도 과거 견적이 쓰는
              이미지는 삭제되지 않습니다.
            </p>
            {(previewUrl || existingCardUrl) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl || existingCardUrl || ""}
                alt="명함 미리보기"
                className="h-28 w-48 rounded-md border border-slate-200 object-cover"
              />
            )}
            <input
              name="business_card"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600"
            />
            {selected.business_card_path ? (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="clear_business_card" value="on" />
                현재 명함 연결 해제 (파일은 보관)
              </label>
            ) : null}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              name="show_business_card_on_quote"
              value="on"
              defaultChecked={Boolean(selected.show_business_card_on_quote)}
              key={`show-${selected.id}-${selected.updated_at}`}
            />
            견적서에 명함 표시
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
