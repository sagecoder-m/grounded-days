import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { actions, type Area, todayISO } from "@/lib/store";

interface Props {
  area: Area;
  trigger: ReactNode;
  projectId?: string;
  /** Set when adding an assignment from inside a course. */
  courseId?: string;
  subprojectId?: string;
  defaultDate?: string;
}

export function AddTaskDialog({ area, trigger, projectId, courseId, subprojectId, defaultDate }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(defaultDate ?? todayISO());

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    actions.addTask({ area, title: title.trim(), description: description.trim() || undefined, date, projectId, subprojectId, courseId });
    setTitle("");
    setDescription("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Add a task</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-title">Title</Label>
            <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Something small and doable" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-desc">Description</Label>
            <Textarea id="t-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes" rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-date">Due date</Label>
            <Input id="t-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" className="rounded-full">Add task</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
