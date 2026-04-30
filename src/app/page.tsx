import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">PRDMaker</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          A Confluence-style PRD editor with an integrated AI assistant.
          Foundation scaffolded — auth, workspaces, and the editor land in the
          next steps of the implementation plan.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="default">Primary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
      </div>
    </main>
  );
}
