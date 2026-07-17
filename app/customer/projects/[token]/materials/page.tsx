import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ token: string }>;
};

/** 레거시 경로 → /customer/materials/[token] */
export default async function LegacyCustomerMaterialsRedirect({ params }: Props) {
  const { token } = await params;
  redirect(`/customer/materials/${token}`);
}
