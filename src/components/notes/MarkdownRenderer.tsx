import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { cn } from "@/lib/utils";

interface Props {
  markdown: string;
  className?: string;
}

export function MarkdownRenderer({ markdown, className }: Props) {
  return (
    <article
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-pre:bg-surface-2",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {markdown || "_Nothing written yet._"}
      </ReactMarkdown>
    </article>
  );
}
