import { Loader2Icon } from "lucide-react";

export default function AuthCompleteLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <Loader2Icon className="size-6 animate-spin text-primary" />
    </div>
  );
}
