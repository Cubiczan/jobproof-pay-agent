import { notFound } from "next/navigation";
import { getJob } from "@/lib/store";
import { JobDetailClient } from "@/components/JobDetailClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function JobPage({ params }: Props) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  return <JobDetailClient initialJob={job} />;
}
