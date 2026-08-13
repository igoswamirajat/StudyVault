import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Loader2, Play, CheckCircle2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getDb, type Resource } from "@/db/schema";
import { buildResourceContext } from "@/services/aiContext";
import { evaluateFeynmanAI } from "@/lib/ai.functions";
import { useSettings } from "@/hooks/useSettings";
import { describeAiError } from "@/services/aiService";

interface Props {
  resource: Resource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssessmentComplete?: (score: number) => void;
}

export function FeynmanAssessmentModal({ resource, open, onOpenChange, onAssessmentComplete }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isGrading, setIsGrading] = useState(false);
  const [result, setResult] = useState<{ score: number; feedback: string } | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const { settings } = useSettings();

  useEffect(() => {
    if (!open) {
      setIsRecording(false);
      setTranscript("");
      setResult(null);
      setIsGrading(false);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    }
  }, [open]);

  const startRecording = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    
    recognition.onresult = (event: any) => {
      let currentTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        currentTranscript += event.results[i][0].transcript;
      }
      setTranscript(currentTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      // If we are still supposed to be recording but it ended (silence timeout), restart it
      if (isRecording) {
         try {
           recognition.start();
         } catch(e) {}
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const submitAssessment = async () => {
    if (!resource || !transcript.trim()) return;
    setIsGrading(true);
    
    try {
      const context = await buildResourceContext(resource);
      
      const res = await evaluateFeynmanAI({
        data: {
          title: resource.name,
          context: context,
          transcript: transcript,
          provider: (settings.aiProvider as string) || undefined,
          endpoint: (settings.openaiEndpoint as string) || undefined,
          apiKey: (settings.openaiApiKey as string) || undefined,
          model: (settings.aiModel as string) || undefined,
        }
      });
      
      setResult({ score: res.score, feedback: res.feedback });
      
      // Save score to DB
      const p = await getDb().progress.get({ resourceId: resource.id });
      if (p) {
        await getDb().progress.update(p, { feynmanScore: res.score });
      }
      
      onAssessmentComplete?.(res.score);
    } catch (err) {
      console.error(err);
      const friendlyError = describeAiError(err);
      alert(`Failed to evaluate: ${friendlyError.message}`);
    } finally {
      setIsGrading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <CheckCircle2 className="size-6 text-success" />
            Lesson Completed!
          </DialogTitle>
          <DialogDescription>
            You just finished <strong>{resource?.name}</strong>. Before you move on, use the Feynman Technique to solidify your memory. Explain what you learned out loud.
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div
              key="recording"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col gap-4 py-4"
            >
              <div className="relative min-h-[120px] rounded-md border border-border bg-surface-1 p-3 text-sm">
                {transcript || (
                  <span className="text-muted-foreground italic">
                    Press the microphone and start speaking your explanation...
                  </span>
                )}
                
                {isRecording && (
                  <span className="absolute bottom-2 right-2 flex size-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex size-3 rounded-full bg-red-500"></span>
                  </span>
                )}
              </div>

              <div className="flex justify-between items-center">
                <Button
                  variant={isRecording ? "destructive" : "secondary"}
                  className="w-1/2 rounded-r-none border-r border-background"
                  onClick={isRecording ? stopRecording : startRecording}
                >
                  <Mic className="mr-2 size-4" />
                  {isRecording ? "Stop Listening" : "Start Speaking"}
                </Button>
                <Button
                  variant="default"
                  className="w-1/2 rounded-l-none"
                  onClick={submitAssessment}
                  disabled={isGrading || transcript.length < 10}
                >
                  {isGrading ? (
                    <><Loader2 className="mr-2 size-4 animate-spin" /> Grading...</>
                  ) : (
                    "Submit for Review"
                  )}
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-4 space-y-4"
            >
              <div className="flex flex-col items-center justify-center space-y-2 rounded-xl bg-surface-1 py-6 text-center shadow-inner">
                <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">AI Assessment Score</span>
                <div className="text-5xl font-black">
                  <span className={result.score >= 8 ? "text-success" : result.score >= 5 ? "text-warning" : "text-destructive"}>
                    {result.score}
                  </span>
                  <span className="text-2xl text-muted-foreground">/10</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Strict Feedback:</h4>
                <div className="text-sm text-muted-foreground rounded bg-surface-1/50 p-3 leading-relaxed">
                  {result.feedback}
                </div>
              </div>

              <Button className="w-full mt-4" onClick={() => onOpenChange(false)}>
                Continue
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
