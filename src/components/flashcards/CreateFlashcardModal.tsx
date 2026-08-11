import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { addFlashcards, generateFlashcardsFromText } from "@/services/flashcardService";
import { toast } from "sonner";
import { Sparkles, Save } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateFlashcardModal({ open, onOpenChange }: Props) {
  const [activeTab, setActiveTab] = useState("manual");
  
  // Manual State
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");

  // AI Paste State
  const [notesText, setNotesText] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleSaveManual() {
    if (!front.trim() || !back.trim()) {
      toast.error("Both front and back are required");
      return;
    }
    try {
      await addFlashcards(null, [{ front, back }], "manual");
      toast.success("Flashcard created");
      setFront("");
      setBack("");
      onOpenChange(false);
    } catch (e) {
      toast.error("Failed to save flashcard");
    }
  }

  async function handleGenerateAI() {
    if (!notesText.trim()) {
      toast.error("Please paste some notes first");
      return;
    }
    setIsGenerating(true);
    const tid = toast.loading("Generating flashcards from your notes...");
    try {
      const added = await generateFlashcardsFromText(notesText, aiCount);
      toast.success(`Generated ${added.length} flashcards`, { id: tid });
      setNotesText("");
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate flashcards. Make sure your AI is configured.", { id: tid });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Flashcards</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full pt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Manual Entry</TabsTrigger>
            <TabsTrigger value="ai">Paste to AI</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Front (Question / Prompt)</label>
              <Textarea 
                value={front} 
                onChange={(e) => setFront(e.target.value)}
                placeholder="What is the powerhouse of the cell?"
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Back (Answer)</label>
              <Textarea 
                value={back} 
                onChange={(e) => setBack(e.target.value)}
                placeholder="Mitochondria"
                className="resize-none"
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveManual}>
                <Save className="mr-2 size-4" /> Save Flashcard
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="ai" className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Paste your notes</label>
              <Textarea 
                value={notesText} 
                onChange={(e) => setNotesText(e.target.value)}
                placeholder="Paste the text or notes you want to generate flashcards from..."
                className="min-h-[150px]"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">How many flashcards?</label>
              <div className="flex flex-wrap gap-2">
                {[5, 10, 15, 20].map((c) => (
                  <Button
                    key={c}
                    variant={aiCount === c ? "default" : "outline"}
                    onClick={() => setAiCount(c)}
                    size="sm"
                    className="flex-1"
                  >
                    {c}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleGenerateAI} disabled={isGenerating}>
                <Sparkles className="mr-2 size-4" /> 
                {isGenerating ? "Generating..." : "Generate AI Flashcards"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
