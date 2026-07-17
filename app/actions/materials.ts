"use server";

/** 고객 승인 관련 액션은 비활성. 직원용은 site-materials actions 사용. */

export type MaterialActionResult = {
  success: boolean;
  error?: string;
  message?: string;
};

export async function submitCustomerChangeRequestAction(): Promise<MaterialActionResult> {
  return {
    success: false,
    error: "고객 승인 기능은 현재 제공하지 않습니다.",
  };
}

export async function approveAllCustomerMaterialsAction(): Promise<MaterialActionResult> {
  return {
    success: false,
    error: "고객 승인 기능은 현재 제공하지 않습니다.",
  };
}
