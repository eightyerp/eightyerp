/**
 * 현장(project_id) 기준 안정적 색상 배정.
 * DB 컬럼 없이 해시로 팔레트 인덱스를 고정한다.
 */

export type ProjectColorTone = {
  /** Tailwind 배경 */
  bg: string;
  /** Tailwind 글자 */
  text: string;
  /** Tailwind 테두리 */
  border: string;
  /** 인라인 style 보조 (간트 등) */
  bgHex: string;
  textHex: string;
};

/** 연한 배경 + 진한 글자, 구분 쉬운 12색 */
export const PROJECT_COLOR_PALETTE: ProjectColorTone[] = [
  { bg: "bg-sky-100", text: "text-sky-900", border: "border-sky-300", bgHex: "#e0f2fe", textHex: "#0c4a6e" },
  { bg: "bg-emerald-100", text: "text-emerald-900", border: "border-emerald-300", bgHex: "#d1fae5", textHex: "#064e3b" },
  { bg: "bg-violet-100", text: "text-violet-900", border: "border-violet-300", bgHex: "#ede9fe", textHex: "#4c1d95" },
  { bg: "bg-amber-100", text: "text-amber-950", border: "border-amber-300", bgHex: "#fef3c7", textHex: "#78350f" },
  { bg: "bg-rose-100", text: "text-rose-900", border: "border-rose-300", bgHex: "#ffe4e6", textHex: "#881337" },
  { bg: "bg-teal-100", text: "text-teal-900", border: "border-teal-300", bgHex: "#ccfbf1", textHex: "#134e4a" },
  { bg: "bg-orange-100", text: "text-orange-950", border: "border-orange-300", bgHex: "#ffedd5", textHex: "#7c2d12" },
  { bg: "bg-indigo-100", text: "text-indigo-900", border: "border-indigo-300", bgHex: "#e0e7ff", textHex: "#312e81" },
  { bg: "bg-lime-100", text: "text-lime-950", border: "border-lime-400", bgHex: "#ecfccb", textHex: "#365314" },
  { bg: "bg-cyan-100", text: "text-cyan-900", border: "border-cyan-300", bgHex: "#cffafe", textHex: "#164e63" },
  { bg: "bg-fuchsia-100", text: "text-fuchsia-900", border: "border-fuchsia-300", bgHex: "#fae8ff", textHex: "#701a75" },
  { bg: "bg-stone-200", text: "text-stone-900", border: "border-stone-400", bgHex: "#e7e5e4", textHex: "#1c1917" },
];

export function hashStableId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function projectColorIndex(projectId: string | null | undefined): number {
  const key = projectId && projectId.trim() ? projectId : "__unassigned__";
  return hashStableId(key) % PROJECT_COLOR_PALETTE.length;
}

export function getProjectColor(projectId: string | null | undefined): ProjectColorTone {
  return PROJECT_COLOR_PALETTE[projectColorIndex(projectId)];
}
