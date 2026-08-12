import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import DOMPurify from "dompurify";

export const SvgNode = Node.create({
  name: "svgNode",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      svg: {
        default: "",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-svg-node]",
        getAttrs: (element) => {
          if (typeof element === "string") return {};
          return { svg: element.getAttribute("data-svg") || "" };
        },
      },
      {
        tag: "svg",
        getAttrs: (element) => {
          if (typeof element === "string") return {};
          // If we encounter a raw SVG, we take its outerHTML
          return { svg: element.outerHTML };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div", 
      mergeAttributes({ "data-svg-node": "", "data-svg": HTMLAttributes.svg }), 
      "SVG Node"
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SvgComponent);
  },
});

function SvgComponent(props: any) {
  const { node } = props;
  const svgContent = node.attrs.svg;

  // Sanitize the SVG for safety (default settings allow SVG and HTML but strip scripts)
  const sanitized = DOMPurify.sanitize(svgContent, {
    ADD_TAGS: ['use'], // Ensure <use> is allowed for SVG sprites
  });

  return (
    <NodeViewWrapper className="svg-node-wrapper my-4 flex justify-center items-center rounded-md border border-border bg-surface-2 p-4 overflow-x-auto">
      <div 
        className="w-full max-w-full [&>svg]:w-full [&>svg]:h-auto"
        dangerouslySetInnerHTML={{ __html: sanitized }} 
      />
    </NodeViewWrapper>
  );
}
