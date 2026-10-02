import { JobForm } from "@/components/JobForm";

export default function NewJobPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create job</h1>
        <p className="mt-1 text-sm text-slate-500">
          Amount, contractor PayPal email, and title. Next step: attach proof photos.
        </p>
      </div>
      <JobForm />
    </div>
  );
}
