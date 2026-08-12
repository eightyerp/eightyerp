"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveMyProfileAction } from "@/app/actions/my-profile";
import type { MyProfileData } from "@/lib/crm/my-profile";

type Props = {
  profile: MyProfileData;
};

export default function MyProfileWorkspace({ profile }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearCard, setClearCard] = useState(false);
  const [selectedCardName, setSelectedCardName] = useState("");
  const [showBusinessCard, setShowBusinessCard] = useState(
    profile.showBusinessCardOnQuote,
  );

  const hasCard =
    (!clearCard && Boolean(profile.businessCardPath)) || Boolean(selectedCardName);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const formData = new FormData(event.currentTarget);
    formData.set("clear_business_card", clearCard ? "1" : "0");

    startTransition(async () => {
      const result = await saveMyProfileAction(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setMessage("내 정보가 저장되었습니다.");
      setClearCard(false);
      setSelectedCardName("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="dashboard-card p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">회사 관리 정보</p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-950">
              내 소속·권한
            </h2>
          </div>
          <span className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            관리자 변경 항목
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ReadOnlyField label="이름" value={profile.name} />
          <ReadOnlyField label="소속 팀" value={profile.teamName} />
          <ReadOnlyField label="직책·직급" value={profile.title} />
          <ReadOnlyField label="ERP 회사 권한" value={profile.companyRoleLabel} />
          <ReadOnlyField
            label="로그인 이메일"
            value={profile.loginEmail || "미등록"}
          />
          <ReadOnlyField label="계정 상태" value="활성 · 승인완료" />
        </div>

        <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-700">
          이름, 소속 팀, 직책·직급, 로그인 계정 및 ERP 권한 변경은 관리자에게 요청해 주세요.
        </p>
      </section>

      <section className="dashboard-card p-5 sm:p-6">
        <div>
          <p className="text-sm font-semibold text-slate-700">본인 수정 가능</p>
          <h2 className="mt-0.5 text-lg font-bold text-slate-950">
            연락처·업무 이메일
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            견적서와 고객 담당자 정보에 사용할 연락처를 직접 관리할 수 있습니다.
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">휴대폰·연락처</span>
            <input
              name="phone"
              type="tel"
              defaultValue={profile.phone}
              maxLength={40}
              autoComplete="tel"
              placeholder="010-0000-0000"
              className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20"
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">업무 이메일</span>
            <input
              name="email"
              type="email"
              defaultValue={profile.email}
              maxLength={254}
              autoComplete="email"
              placeholder="name@company.com"
              className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20"
            />
            <span className="mt-1 block text-xs leading-relaxed text-slate-500">
              로그인 이메일과 별개인 고객·견적용 업무 이메일입니다.
            </span>
          </label>
        </div>
      </section>

      <section className="dashboard-card p-5 sm:p-6">
        <div>
          <p className="text-sm font-semibold text-slate-700">담당자 명함</p>
          <h2 className="mt-0.5 text-lg font-bold text-slate-950">
            명함 이미지 관리
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            JPG, PNG, WEBP, GIF 파일을 등록할 수 있으며 최대 10MB입니다.
          </p>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[220px_1fr]">
          <div className="flex min-h-36 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
            {!clearCard && profile.businessCardUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.businessCardUrl}
                alt={`${profile.name} 명함`}
                className="max-h-40 w-full rounded-md object-contain"
              />
            ) : selectedCardName ? (
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800">새 명함 선택됨</p>
                <p className="mt-1 break-all text-xs text-slate-500">
                  {selectedCardName}
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">등록된 명함 없음</p>
            )}
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-800">새 명함 이미지</span>
              <input
                name="business_card"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setSelectedCardName(file?.name ?? "");
                  if (file) setClearCard(false);
                }}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-800 hover:file:bg-slate-200"
              />
            </label>

            {profile.businessCardPath && !selectedCardName ? (
              <button
                type="button"
                onClick={() => {
                  setClearCard((current) => !current);
                  setShowBusinessCard(false);
                }}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {clearCard ? "기존 명함 유지" : "기존 명함 삭제"}
              </button>
            ) : null}

            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <input
                name="show_business_card_on_quote"
                type="checkbox"
                checked={hasCard && showBusinessCard}
                disabled={!hasCard}
                onChange={(event) => setShowBusinessCard(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">
                  견적서에 담당자 명함 표시
                </span>
                <span className="block text-xs text-slate-500">
                  명함이 등록되어 있을 때만 사용할 수 있습니다.
                </span>
              </span>
            </label>
          </div>
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
        >
          {error}
        </div>
      ) : null}

      {message ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
        >
          {message}
        </div>
      ) : null}

      <div className="sticky bottom-3 z-20 flex justify-end rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-11 min-w-32 items-center justify-center rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "저장 중..." : "내 정보 저장"}
        </button>
      </div>
    </form>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-slate-950">{value}</p>
    </div>
  );
}
