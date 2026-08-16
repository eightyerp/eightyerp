import type { Metadata, Viewport } from "next";
import CrmServiceWorkerRegistration from "@/components/crm/CrmServiceWorkerRegistration";
import CrmShell from "@/components/crm/CrmShell";

export const metadata: Metadata = {
  title: {
    default: "EIGHTY CRM",
    template: "%s | EIGHTY CRM",
  },
  description: "에잇티 직원용 고객·상담·일정·견적 CRM",
  manifest: "/crm-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "EIGHTY CRM",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#071426",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <CrmShell>
      <CrmServiceWorkerRegistration />
      {children}
    </CrmShell>
  );
}
