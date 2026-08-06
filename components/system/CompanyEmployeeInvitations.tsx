"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import {
  createCompanyEmployeeInvitationAction,
  revokeCompanyEmployeeInvitationAction,
  type CompanyInvitationActionResult,
} from "@/app/actions/company-employee-invitations";
import type { CompanyEmployeeInvitation } from "@/lib/crm/company-employee-invitations";
import type { Team } from "@/types/database";

type Props = {
  invitations: CompanyEmployeeInvitation[];
  teams: Team[];
};

const initialState: CompanyInvitationActionResult = {
  success: false,
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const fieldClassName =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-gold-500 focus:ring-2 focus:ring-gold-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-900 disabled:opacity-100";

const selectClassName = `${fieldClassName} text-slate-900`;

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return dateFormatter.format(new Date(value));
}

function getInvitationStatus(invitation: CompanyEmployeeInvitation) {
  if (invitation.revoked_at) {
    return {
      label: "취소됨",
      className: "bg-red-100 text-red-800",
    };
  }

  if (invitation.use_count >= invitation.max_uses) {
    return {
      label: "사용 완료",
      className: "bg-slate-200 text-slate-900",
    };
  }

  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return {
      label: "기간 만료",
      className: "bg-amber-100 text-amber-900",
    };
  }

  if (invitation.is_available) {
    return {
      label: "사용 가능",
      className: "bg-emerald-100 text-emerald-900",
    };
  }

  return {
    label: "비활성",
    className: "bg-slate-200 text-slate-900",
  };
}

function subscribeNoop() {
  return () => {};
}

function getClientOrigin() {
  return window.location.origin;
}

function getServerOrigin() {
  return "";
}

export default function CompanyEmployeeInvitations({
  invitations,
  teams,
}: Props) {
  const origin = useSyncExternalStore(
    subscribeNoop,
    getClientOrigin,
    getServerOrigin,
  );
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [suppressedInviteToken, setSuppressedInviteToken] = useState<
    string | null
  >(null);

  const [createState, createAction, createPending] = useActionState(
    createCompanyEmployeeInvitationAction,
    initialState,
  );

  const [revokeState, revokeAction, revokePending] = useActionState(
    revokeCompanyEmployeeInvitationAction,
    initialState,
  );

  const createdInviteToken = createState.invitation?.inviteToken ?? "";
  const showCreatedLink =
    Boolean(createState.invitation) &&
    createdInviteToken !== suppressedInviteToken;

  const invitePath = showCreatedLink
    ? `/signup?invite=${encodeURIComponent(createdInviteToken)}`
    : "";

  const inviteUrl = invitePath ? `${origin}${invitePath}` : "";

  const copied =
    Boolean(createdInviteToken) &&
    showCreatedLink &&
    copiedToken === createdInviteToken;

  function suppressCreatedLinkIfMatches(invitationId: string) {
    if (
      createState.invitation &&
      createState.invitation.invitationId === invitationId
    ) {
      setSuppressedInviteToken(createState.invitation.inviteToken);
      setCopiedToken(null);
    }
  }

  async function copyInviteLink() {
    if (!invitePath || !showCreatedLink) return;

    const url = `${window.location.origin}${invitePath}`;

    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(createdInviteToken);
    } catch {
      setCopiedToken(null);
      window.prompt("아래 초대 링크를 복사해주세요.", url);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            새 직원 초대
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            회사 전용 1회용 가입 링크를 생성합니다. 기본 유효기간은
            7일입니다.
          </p>
        </div>

        <form
          action={createAction}
          className="mt-5 grid gap-4 md:grid-cols-3"
        >
          <label className="block">
            <span className="text-sm font-medium text-slate-900">
              기본 직급
            </span>
            <input
              type="text"
              name="default_title"
              defaultValue="직원"
              maxLength={50}
              disabled={createPending}
              className={fieldClassName}
              placeholder="예: 실장, 팀장, 직원"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-900">
              소속 팀
            </span>
            <select
              name="team_id"
              defaultValue=""
              disabled={createPending}
              className={selectClassName}
            >
              <option value="" className="text-slate-900">
                팀 미지정
              </option>
              {teams.map((team) => (
                <option
                  key={team.id}
                  value={team.id}
                  className="text-slate-900"
                >
                  {team.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-900">
              유효기간
            </span>
            <select
              name="expires_in_days"
              defaultValue="7"
              disabled={createPending}
              className={selectClassName}
            >
              <option value="1" className="text-slate-900">
                1일
              </option>
              <option value="3" className="text-slate-900">
                3일
              </option>
              <option value="7" className="text-slate-900">
                7일
              </option>
              <option value="14" className="text-slate-900">
                14일
              </option>
              <option value="30" className="text-slate-900">
                30일
              </option>
            </select>
          </label>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={createPending}
              className="rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-75"
            >
              {createPending ? "생성 중..." : "직원 초대 링크 생성"}
            </button>
          </div>
        </form>

        {createState.error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {createState.error}
          </div>
        )}

        {showCreatedLink && createState.invitation && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-900">
              초대 링크가 생성됐습니다.
            </p>
            <p className="mt-1 text-xs text-emerald-900/90">
              보안을 위해 원본 링크는 지금 한 번만 확인할 수 있습니다.
              직원에게 전달하기 전에 반드시 복사해주세요.
            </p>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                readOnly
                value={inviteUrl}
                className="min-w-0 flex-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <button
                type="button"
                onClick={copyInviteLink}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
              >
                {copied ? "복사 완료" : "링크 복사"}
              </button>
            </div>

            <p className="mt-2 text-xs font-medium text-emerald-900">
              만료일:{" "}
              {formatDate(createState.invitation.expiresAt)}
            </p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">
            직원 초대 내역
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            원본 초대 토큰은 저장하거나 다시 표시하지 않습니다.
          </p>
        </div>

        {revokeState.error && (
          <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            {revokeState.error}
          </div>
        )}

        {revokeState.success && revokeState.message && (
          <div className="mx-5 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
            {revokeState.message}
          </div>
        )}

        {invitations.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-600">
            아직 생성된 직원 초대가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-semibold tracking-wide text-slate-900">
                  <th className="px-5 py-3">직급·팀</th>
                  <th className="px-5 py-3">상태</th>
                  <th className="px-5 py-3">사용</th>
                  <th className="px-5 py-3">생성일</th>
                  <th className="px-5 py-3">만료일</th>
                  <th className="px-5 py-3 text-right">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {invitations.map((invitation) => {
                  const status = getInvitationStatus(invitation);

                  return (
                    <tr key={invitation.invitation_id}>
                      <td className="whitespace-nowrap px-5 py-4">
                        <p className="font-medium text-slate-900">
                          {invitation.default_title}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600">
                          {invitation.team_name || "팀 미지정"}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-900">
                        {invitation.use_count}/{invitation.max_uses}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-900">
                        {formatDate(invitation.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-900">
                        {formatDate(invitation.expires_at)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right">
                        {invitation.is_available ? (
                          <form action={revokeAction}>
                            <input
                              type="hidden"
                              name="invitation_id"
                              value={invitation.invitation_id}
                            />
                            <button
                              type="submit"
                              disabled={revokePending}
                              onClick={() =>
                                suppressCreatedLinkIfMatches(
                                  invitation.invitation_id,
                                )
                              }
                              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-800 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-75"
                            >
                              {revokePending ? "처리 중..." : "초대 취소"}
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs font-medium text-slate-600">
                            처리 완료
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
