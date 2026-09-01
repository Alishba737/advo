import { Suspense } from "react";

import { ChatView } from "@/components/advo/chat-view";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Chat — ADVO",
};

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-6 sm:px-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="ml-auto h-12 w-1/2" />
        </div>
      }
    >
      <ChatView />
    </Suspense>
  );
}
