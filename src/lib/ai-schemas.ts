import { z } from "zod";

export const QuizSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).length(4),
        correctIndex: z.number().int().min(0).max(3),
        explanation: z.string(),
      }),
    )
    .max(15),
});

export const FlashcardSchema = z.object({
  cards: z
    .array(
      z.object({
        front: z.string(),
        back: z.string(),
        hint: z.string().optional(),
      }),
    )
    .max(15),
});

export const AiInput = z.object({
  title: z.string(),
  contentMarkdown: z.string(),
  resourceType: z.string().optional(),
  count: z.number().int().min(3).max(15).optional(),
  provider: z.string().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  images: z.array(z.string()).optional(),
  videoDataUrl: z.string().optional(),
});

export const SummaryInput = z.object({
  title: z.string(),
  content: z.string(),
  provider: z.string().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  images: z.array(z.string()).optional(),
  videoDataUrl: z.string().optional(),
});

export const JourneyInput = z.object({
  resources: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      folderPath: z.string().optional(),
      addedAt: z.number().optional(),
    }),
  ),
  notes: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      isSummary: z.boolean().optional(),
      resourceId: z.string().optional(),
    }),
  ),
  folders: z.array(
    z.object({
      path: z.string(),
      name: z.string(),
    }),
  ),
  progress: z.record(z.string(), z.string()).optional(),
  provider: z.string().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

export const JourneyPhase = z.object({
  id: z.string().optional(),
  title: z.string(),
  description: z.string(),
  order: z.number().optional(),
  resources: z.array(
    z.object({
      id: z.string(),
      title: z.string().optional(),
      status: z.string(),
      reason: z.string().optional(),
    }),
  ),
});

export const JourneyOutput = z.object({
  phases: z.array(JourneyPhase),
  startingPoint: z.string().optional(),
  reasoning: z.string(),
});

export const AutoNoteInput = z.object({
  title: z.string(),
  content: z.string(),
  resourceType: z.string().optional(),
  provider: z.string().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  images: z.array(z.string()).optional(),
  videoDataUrl: z.string().optional(),
});

export const ChatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const DoubtInput = z.object({
  title: z.string(),
  context: z.string(),
  history: z.array(ChatTurnSchema).min(1),
  provider: z.string().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  images: z.array(z.string()).optional(),
  videoDataUrl: z.string().optional(),
});

export const SortInput = z.object({
  resources: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      folderPath: z.string().optional(),
    }),
  ),
  provider: z.string().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

export const AssistantActionSchema = z.object({
  type: z.enum([
    "open_resource",
    "go_to_route",
    "next",
    "prev",
    "mark_complete",
    "create_unit",
    "move_to_unit",
    "start_studying",
    "generate_summary",
    "generate_flashcards",
    "generate_quiz",
    "create_note_from_chat",
  ]),
  resourceName: z.string().optional(),
  resourceId: z.string().optional(),
  route: z.string().optional(),
  unitName: z.string().optional(),
  parentPath: z.string().optional(),
  resourceNames: z.array(z.string()).optional(),
  reason: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
});

export const AssistantSchema = z.object({
  reply: z.string(),
  actions: z.array(AssistantActionSchema).max(6),
});

export const AssistantInput = z.object({
  history: z.array(ChatTurnSchema).min(1),
  sessionContext: z.string(),
  provider: z.string().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

export const WebExtractionInput = z.object({
  url: z.string().url(),
  provider: z.string().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

export const FeynmanInput = z.object({
  title: z.string(),
  context: z.string(),
  transcript: z.string(),
  provider: z.string().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

export const PlannerSchema = z.object({
  days: z.array(
    z.object({
      dayNumber: z.number(),
      title: z.string().describe("e.g. Day 1: Introduction, or Monday - Basics"),
      resourceIds: z.array(z.string()),
    })
  )
});

export const PlannerInput = z.object({
  resources: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      durationSeconds: z.number().nullable().optional(),
    })
  ),
  prompt: z.string().describe("User constraints or instructions for scheduling"),
  provider: z.string().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});
