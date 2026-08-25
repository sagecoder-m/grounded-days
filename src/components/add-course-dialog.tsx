import { useState, type ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { actions } from "@/lib/store";

/**
 * Add a course to the Education area.
 *
 * Only the name is required. A course code and a term are the kind of detail
 * that is obvious to some people and friction for everyone else — "Statistics"
 * is a complete answer, and being made to invent "STAT 101" before you can
 * track an assignment is exactly the setup cost that stops people using a tool.
 */
export function AddCourseDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [term, setTerm] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    actions.addCourse(name.trim(), code.trim() || undefined, term.trim() || undefined);
    setName("");
    setCode("");
    setTerm("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Add a course</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="course-name">Course</Label>
            <Input
              id="course-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Statistics"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="course-code">Code</Label>
              <Input
                id="course-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-term">Term</Label>
              <Input
                id="course-term"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" className="rounded-full">
              Add course
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
