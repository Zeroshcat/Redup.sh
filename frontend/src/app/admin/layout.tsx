import { AdminNav } from "@/components/admin/AdminNav";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminBadgesProvider } from "@/components/admin/AdminBadgesProvider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <AdminBadgesProvider>
        <div className="flex min-h-screen">
          <AdminNav />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </AdminBadgesProvider>
    </AdminGuard>
  );
}
