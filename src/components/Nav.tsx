import Link from "next/link";

export function Nav() {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0070BA] text-white text-sm">
            JP
          </span>
          JobProof Pay Agent
        </Link>
        <nav className="flex items-center gap-4 text-sm text-slate-600">
          <Link href="/jobs/new" className="hover:text-[#0070BA]">
            Create job
          </Link>
          <Link href="/jobs" className="hover:text-[#0070BA]">
            Jobs table
          </Link>
          <a
            href="https://paypalaihackathon.devpost.com/"
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-700"
          >
            Hackathon
          </a>
        </nav>
      </div>
    </header>
  );
}
