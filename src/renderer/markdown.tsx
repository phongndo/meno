import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Streamdown } from "streamdown";

const roots = new WeakMap<HTMLElement, Root>();
const plugins = { code, math, mermaid };

export const renderMarkdown = (element: HTMLElement, source: string, streaming = false): void => {
  const root = roots.get(element) ?? createRoot(element);
  roots.set(element, root);
  root.render(
    createElement(
      Streamdown,
      {
        controls: true,
        mode: streaming ? "streaming" : "static",
        plugins,
      },
      source,
    ),
  );
};
