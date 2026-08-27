import type { Metadata } from "next";
import { AdminProviders } from "@/components/admin-providers";

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s · AAURIKAA Admin",
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminProviders>{children}</AdminProviders>;
}
