import Sidebar from "@/components/Sidebar";
import { ToastProvider } from "@/components/ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex flex-col md:flex-row min-h-screen">
        <Sidebar />
        {/* pb no telemovel: espaco para a barra de navegacao de baixo */}
        <main className="flex-1 min-w-0 pb-[72px] md:pb-0">{children}</main>
      </div>
    </ToastProvider>
  );
}
