import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { Editor } from "@tiptap/core";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editor: Editor | null;
}

export function CodeSnippetDialog({ open, onOpenChange, editor }: Props) {
  const [type, setType] = useState<"svg" | "sandbox">("svg");
  const [code, setCode] = useState("");

  const handleInsert = () => {
    if (!editor || !code.trim()) return;

    if (type === "svg") {
      editor.chain().focus().insertContent({
        type: "svgNode",
        attrs: { svg: code.trim() },
      }).run();
    } else {
      editor.chain().focus().insertContent({
        type: "sandboxNode",
        attrs: { code: code.trim() },
      }).run();
    }

    setCode("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Insert Rich Code Widget</DialogTitle>
          <DialogDescription>
            Paste raw SVG code or interactive HTML/JS into your notes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="widget-type">Widget Type</Label>
            <Select value={type} onValueChange={(v: "svg" | "sandbox") => setType(v)}>
              <SelectTrigger id="widget-type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="svg">Native SVG Rendering</SelectItem>
                <SelectItem value="sandbox">Interactive HTML/JS Sandbox</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="code-input">Raw Code</Label>
            <Textarea
              id="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={
                type === "svg"
                  ? '<svg width="100" height="100">...</svg>'
                  : '<div id="app">Hello</div>\n<script>\n  console.log("Interactive!");\n</script>'
              }
              className="font-mono h-48"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleInsert}>Insert</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
