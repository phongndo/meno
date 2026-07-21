import {
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  MessageCircleIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SquareIcon,
  type LucideIcon,
} from "lucide-react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

const roots = new WeakMap<HTMLElement, Root>();

export const icons = {
  arrowUp: ArrowUpIcon,
  check: CheckIcon,
  chevronDown: ChevronDownIcon,
  message: MessageCircleIcon,
  plus: PlusIcon,
  search: SearchIcon,
  settings: SettingsIcon,
  square: SquareIcon,
} as const;

export const renderIcon = (element: HTMLElement, icon: LucideIcon, size = 16): void => {
  const root = roots.get(element) ?? createRoot(element);
  roots.set(element, root);
  root.render(createElement(icon, { "aria-hidden": true, size, strokeWidth: 1.8 }));
};
