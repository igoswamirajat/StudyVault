import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

export const SandboxNode = Node.create({
  name: "sandboxNode",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      code: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-sandbox-node]",
        getAttrs: (element) => {
          if (typeof element === "string") return {};
          return { code: element.getAttribute("data-code") || "" };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div", 
      mergeAttributes({ "data-sandbox-node": "", "data-code": HTMLAttributes.code }), 
      "Sandbox Node"
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SandboxComponent);
  },
});

function SandboxComponent(props: any) {
  const { node } = props;
  const codeContent = node.attrs.code;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(300);

  // We can inject a small script to report iframe height back to parent via postMessage
  // so the iframe resizes dynamically.
  const srcDoc = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; overflow: hidden; background: transparent; color: inherit; }
        </style>
        <script>
          function reportHeight() {
            window.parent.postMessage({ type: 'resize', height: document.documentElement.scrollHeight }, '*');
          }
          window.addEventListener('load', reportHeight);
          window.addEventListener('resize', reportHeight);
          
          // Use MutationObserver to catch dynamic content changes
          const observer = new MutationObserver(reportHeight);
          window.addEventListener('DOMContentLoaded', () => {
             observer.observe(document.body, { childList: true, subtree: true, attributes: true });
          });
        </script>
      </head>
      <body>
        ${codeContent}
      </body>
    </html>
  `;

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      // Validate the message comes from our iframe
      if (iframeRef.current && e.source === iframeRef.current.contentWindow) {
        if (e.data && e.data.type === "resize" && typeof e.data.height === "number") {
          // Add a small buffer for safety
          setHeight(Math.max(100, e.data.height + 10));
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <NodeViewWrapper className="sandbox-node-wrapper my-4 rounded-md border border-border bg-surface-2 overflow-hidden shadow-sm relative">
      {/* 
        sandbox="allow-scripts" ensures JS can run. 
        Omit "allow-same-origin" to keep it fully isolated from the parent app's domain context.
      */}
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-popups"
        style={{ width: "100%", height: `${height}px`, border: "none", display: "block" }}
        title="Interactive Sandbox"
      />
    </NodeViewWrapper>
  );
}
