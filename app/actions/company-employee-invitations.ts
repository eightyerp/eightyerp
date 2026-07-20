"use server";

import { revalidatePath } from "next/cache";
import {
  createCompanyEmployeeInvitation,
  revokeCompanyEmployeeInvitation,
} from "@/lib/crm/company-employee-invitations";

export type CompanyInvitationActionResult = {
  success: boolean;
  error?: string;
  message?: string;
  invitation?: {
    invitationId: string;
    inviteToken: string;
    expiresAt: string;
  };
};

function revalidateInvitations() {
  revalidatePath("/system/invitations");
}

export async function createCompanyEmployeeInvitationAction(
  _previousState: CompanyInvitationActionResult,
  formData: FormData,
): Promise<CompanyInvitationActionResult> {
  try {
    const defaultTitle =
      String(formData.get("default_title") ?? "").trim() || "직원";
    const teamId =
      String(formData.get("team_id") ?? "").trim() || null;
    const expiresInDays = Number(
      String(formData.get("expires_in_days") ?? "7"),
    );

    if (defaultTitle.length > 50) {
      return {
        success: false,
        error: "직급은 50자 이하로 입력해주세요.",
      };
    }

    if (
      !Number.isInteger(expiresInDays) ||
      expiresInDays < 1 ||
      expiresInDays > 30
    ) {
      return {
        success: false,
        error: "초대 유효기간은 1일에서 30일 사이여야 합니다.",
      };
    }

    const invitation = await createCompanyEmployeeInvitation({
      defaultTitle,
      teamId,
      expiresInDays,
    });

    revalidateInvitations();

    return {
      success: true,
      message: "직원 초대 링크를 생성했습니다.",
      invitation: {
        invitationId: invitation.invitation_id,
        inviteToken: invitation.invite_token,
        expiresAt: invitation.expires_at,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "직원 초대 링크 생성에 실패했습니다.",
    };
  }
}

export async function revokeCompanyEmployeeInvitationAction(
  _previousState: CompanyInvitationActionResult,
  formData: FormData,
): Promise<CompanyInvitationActionResult> {
  try {
    const invitationId = String(
      formData.get("invitation_id") ?? "",
    ).trim();

    if (!invitationId) {
      return {
        success: false,
        error: "취소할 초대 정보가 없습니다.",
      };
    }

    const revoked =
      await revokeCompanyEmployeeInvitation(invitationId);

    if (!revoked) {
      return {
        success: false,
        error: "이미 사용되었거나 취소된 초대입니다.",
      };
    }

    revalidateInvitations();

    return {
      success: true,
      message: "직원 초대를 취소했습니다.",
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "직원 초대 취소에 실패했습니다.",
    };
  }
}