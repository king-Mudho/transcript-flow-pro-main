import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/no-access")({
  head: () => ({ meta: [{ title: "No access" }, { name: "robots", content: "noindex" }] }),
  component: NoAccess,
});

function NoAccess() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="max-w-sm rounded-lg border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">No access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This account is not an administrator, and has been signed out.
        </p>
        <Button asChild className="mt-6">
          <Link to="/auth">Back to sign in</Link>
        </Button>
      </div>
    </div>
  );
}
