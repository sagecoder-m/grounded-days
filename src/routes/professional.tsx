import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { actions, useAppState } from "@/lib/store";
import { InlineText } from "@/components/inline-text";
import { TaskRow } from "@/components/task-row";
import { GoalCard } from "@/components/goal-card";
import { AddTaskDialog } from "@/components/add-task-dialog";
import { AddGoalDialog } from "@/components/add-goal-dialog";
import { SoftProgress } from "@/components/soft-progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Plus, Trash2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/professional")({
  component: ProfessionalPage,
});

function ProfessionalPage() {
  const state = useAppState();
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="chip" style={{ backgroundColor: "var(--brown-soft)", color: "var(--brown)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--brown)" }} /> Professional
          </p>
          <h1 className="mt-3 font-serif text-4xl">Your work, organized softly</h1>
          <p className="mt-2 text-ink-soft max-w-lg">Projects hold sub-projects, which hold goals and tasks. Roll it up when it's too much.</p>
        </div>
        <AddProjectDialog />
      </header>

      <div className="space-y-4">
        {state.projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ReturnType<typeof useAppState>["projects"][number] }) {
  const state = useAppState();
  const [open, setOpen] = useState(true);

  const projectTasks = state.tasks.filter((t) => t.projectId === project.id);
  const projectGoals = state.goals.filter((g) => g.projectId === project.id);
  const paused = project.status === "paused";
  const totalTasks = projectTasks.length;
  const doneTasks = projectTasks.filter((t) => t.done).length;
  const taskPct = totalTasks ? (doneTasks / totalTasks) * 100 : 0;
  const goalPct = projectGoals.length ? projectGoals.reduce((s, g) => s + g.progress, 0) / projectGoals.length : 0;
  const overall = Math.round((taskPct + goalPct) / (projectGoals.length && totalTasks ? 2 : projectGoals.length || totalTasks ? 1 : 1));

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("card-soft p-5 md:p-6", paused && "border-dashed")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-3 text-left flex-1 min-w-0">
            <ChevronDown className={`h-5 w-5 text-ink-soft transition-transform ${open ? "" : "-rotate-90"}`} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-serif text-2xl truncate">
                  <InlineText value={project.name} onSave={(v) => v && actions.updateProject(project.id, { name: v })} showIcon />
                </h3>
                {paused && (
                  <span className="chip border border-dashed" style={{ borderColor: "var(--tan)", color: "var(--ink-soft)" }}>
                    <Pause className="h-3 w-3" /> On pause
                  </span>
                )}
              </div>
              {project.description && <p className="text-xs text-ink-soft mt-0.5">{project.description}</p>}
            </div>
          </button>
        </CollapsibleTrigger>
        <div className="flex items-center gap-3">
          <div className="w-40">
            <SoftProgress value={overall} tint={paused ? "tan" : "brown"} />
            <div className="text-[10px] text-ink-soft mt-1 tabular-nums text-right">{overall}%</div>
          </div>
          <button
            onClick={() => actions.updateProject(project.id, { status: paused ? "active" : "paused" })}
            className="chip bg-secondary text-ink-soft"
            title={paused ? "Resume" : "Pause"}
          >
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button onClick={() => actions.deleteProject(project.id)} className="text-ink-soft hover:text-[color:var(--clay)] p-1" aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <CollapsibleContent className="mt-5 space-y-4">
        {project.subprojects.map((sub) => {
          const subTasks = projectTasks.filter((t) => t.subprojectId === sub.id);
          const subGoals = projectGoals.filter((g) => g.subprojectId === sub.id);
          const subPct = subGoals.length ? Math.round(subGoals.reduce((s, g) => s + g.progress, 0) / subGoals.length) : 0;
          return (
            <div key={sub.id} className="rounded-2xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="font-serif text-lg">
                    <InlineText value={sub.name} onSave={(v) => v && actions.updateSubproject(project.id, sub.id, { name: v })} showIcon />
                  </div>
                  <div className="w-32">
                    <SoftProgress value={subPct} tint={paused ? "tan" : "brown"} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AddTaskDialog area="professional" projectId={project.id} subprojectId={sub.id} trigger={
                    <Button variant="outline" size="sm" className="rounded-full border-tan"><Plus className="h-3 w-3" /> Task</Button>
                  } />
                  <AddGoalDialog area="professional" projectId={project.id} subprojectId={sub.id} trigger={
                    <Button variant="outline" size="sm" className="rounded-full border-tan"><Plus className="h-3 w-3" /> Goal</Button>
                  } />
                  <button onClick={() => actions.deleteSubproject(project.id, sub.id)} className="text-ink-soft hover:text-[color:var(--clay)] p-1"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              {subGoals.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2 mb-3">
                  {subGoals.map((g) => <GoalCard key={g.id} goal={g} tint={paused ? "tan" : "brown"} />)}
                </div>
              )}
              <div className="space-y-2">
                {subTasks.length === 0 && <div className="text-xs text-ink-soft italic px-2">No tasks here yet.</div>}
                {subTasks.map((t) => <TaskRow key={t.id} task={t} showArea={false} onDelete={() => actions.deleteTask(t.id)} />)}
              </div>
            </div>
          );
        })}
        <AddSubprojectRow projectId={project.id} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function AddSubprojectRow({ projectId }: { projectId: string }) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        actions.addSubproject(projectId, name.trim());
        setName("");
      }}
      className="flex gap-2"
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a sub-project" />
      <Button type="submit" variant="outline" className="rounded-full border-tan"><Plus className="h-4 w-4" /> Sub-project</Button>
    </form>
  );
}

function AddProjectDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full"><Plus className="h-4 w-4" /> New project</Button>
      </DialogTrigger>
      <DialogContent className="bg-card">
        <DialogHeader><DialogTitle className="font-serif text-2xl">New project</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            actions.addProject(name.trim(), desc.trim() || undefined);
            setName(""); setDesc(""); setOpen(false);
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div className="space-y-1.5"><Label>Description</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <DialogFooter><Button type="submit" className="rounded-full">Create</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
