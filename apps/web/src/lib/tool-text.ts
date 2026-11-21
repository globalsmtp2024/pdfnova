import type { ToolCategoryId, ToolDefinition } from "@/config/tools";

type Translator = {
  (key: string): string;
  has(key: string): boolean;
};

export type ToolText = { name: string; description: string };

export function toolText(t: Translator, tool: ToolDefinition): ToolText {
  return {
    name: t.has(`${tool.slug}.name`) ? t(`${tool.slug}.name`) : tool.name,
    description: t.has(`${tool.slug}.description`)
      ? t(`${tool.slug}.description`)
      : tool.description,
  };
}

export function categoryLabel(t: Translator, id: ToolCategoryId): string {
  return t(`${id}.label`);
}
