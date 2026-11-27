import Link from "next/link";
import { MessageSquareText } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#070a11] text-slate-100">
      <div className="ms-panel rounded-xl p-8 sm:p-12 text-center max-w-md w-full border border-slate-800/80">
        <MessageSquareText className="mx-auto h-10 w-10 text-slate-500 mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Page not found</h1>
        <p className="text-slate-400 mb-6">
          The ClarifyAI page you're looking for doesn't exist.
        </p>
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 rounded-lg bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300 hover:bg-sky-500/20 transition-colors"
        >
          <MessageSquareText className="h-3.5 w-3.5" /> Open workspace
        </Link>
      </div>
    </div>
  );
}