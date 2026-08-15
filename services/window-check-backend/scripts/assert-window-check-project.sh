#!/usr/bin/env bash
set -euo pipefail

EXPECTED_PROJECT_REF="bnscmhkrjruguwfbutnm"
FORBIDDEN_ERP_REF="zhihbyarqpkudqyomcxv"
ACTUAL_PROJECT_REF="${SUPABASE_PROJECT_REF:-${1:-}}"

if [[ -z "${ACTUAL_PROJECT_REF}" ]]; then
  echo "사용법: SUPABASE_PROJECT_REF=<ref> $0 또는 $0 <ref>" >&2
  exit 2
fi

if [[ "${ACTUAL_PROJECT_REF}" == "${FORBIDDEN_ERP_REF}" ]]; then
  echo "중단: 창호체크 Migration을 ERP 운영 프로젝트에 적용할 수 없습니다." >&2
  exit 10
fi

if [[ "${ACTUAL_PROJECT_REF}" != "${EXPECTED_PROJECT_REF}" ]]; then
  echo "중단: 허용되지 않은 Supabase 프로젝트입니다. expected=${EXPECTED_PROJECT_REF}, actual=${ACTUAL_PROJECT_REF}" >&2
  exit 11
fi

echo "OK: 창호체크 개발 프로젝트 확인 완료 (${ACTUAL_PROJECT_REF})"
