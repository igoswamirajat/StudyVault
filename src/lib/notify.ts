import { toast } from "sonner";

type ToastOpts = {
  description?: string;
  duration?: number;
};

export const notify = {
  success: (title: string, opts?: ToastOpts) =>
    toast.success(title, {
      description: opts?.description,
      duration: opts?.duration ?? 4000,
    }),

  error: (title: string, opts?: ToastOpts) =>
    toast.error(title, {
      description: opts?.description,
      duration: opts?.duration ?? 7000,
    }),

  warn: (title: string, opts?: ToastOpts) =>
    toast.warning(title, {
      description: opts?.description,
      duration: opts?.duration ?? 5500,
    }),

  info: (title: string, opts?: ToastOpts) =>
    toast.info(title, {
      description: opts?.description,
      duration: opts?.duration ?? 4500,
    }),

  /** AI fallbacks — makes it clear the result wasn't AI-generated */
  aiFallback: (reason: string) =>
    toast.warning("AI unavailable — using fallback", {
      description: reason,
      duration: 5500,
    }),

  /** Settings / data integrity issues */
  dataIssue: (title: string, description?: string) =>
    toast.error(title, {
      description,
      duration: 8000,
    }),
};
