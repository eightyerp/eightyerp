"use server";

import { createClient } from "@/lib/supabase-server";

type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
};

export type CrmPushSubscriptionResult = {
  success: boolean;
  error?: string;
};

function safePushError(message: string) {
  if (/register_my_crm_push_subscription|schema cache|could not find|does not exist/i.test(message)) {
    return "모바일 푸시 저장 기능이 아직 운영 DB에 적용되지 않았습니다.";
  }
  if (/permission|row-level security|42501/i.test(message)) {
    return "푸시 알림을 등록할 권한이 없습니다. 다시 로그인해 주세요.";
  }
  return "푸시 알림 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export async function registerCrmPushSubscriptionAction(
  input: PushSubscriptionInput,
): Promise<CrmPushSubscriptionResult> {
  const endpoint = input.endpoint.trim();
  const p256dh = input.p256dh.trim();
  const auth = input.auth.trim();
  if (!endpoint || !p256dh || !auth) {
    return { success: false, error: "브라우저 푸시 구독 정보가 없습니다." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_my_crm_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth_key: auth,
    p_user_agent: input.userAgent?.slice(0, 500) || null,
  });

  if (error) {
    console.error("[crm-push] subscription register failed", error.message);
    return { success: false, error: safePushError(error.message) };
  }

  return { success: true };
}

export async function disableCrmPushSubscriptionAction(
  endpoint: string,
): Promise<CrmPushSubscriptionResult> {
  const normalized = endpoint.trim();
  if (!normalized) return { success: true };

  const supabase = await createClient();
  const { error } = await supabase.rpc("disable_my_crm_push_subscription", {
    p_endpoint: normalized,
  });
  if (error) {
    console.error("[crm-push] subscription disable failed", error.message);
    return { success: false, error: safePushError(error.message) };
  }
  return { success: true };
}
