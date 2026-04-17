import { TopNav } from "@/components/layout/TopNav";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <TopNav />
      {children}
    </ErrorBoundary>
  );
}
