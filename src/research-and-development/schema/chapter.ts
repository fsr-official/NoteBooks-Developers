export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SectionId =
  | `${number}.${number}`
  | `${number}.${number}.${number}`;
export type SectionImportance = 0 | 1 | 2 | 3;

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "emphasis" | "strong"; children: InlineNode[] }
  | { type: "inlineCode"; value: string }
  | { type: "mathInline"; value: string }
  | { type: "link"; href: string; title?: string; children: InlineNode[] }
  | { type: "glossaryRef"; termId: string; children: InlineNode[] };

export type TableCell = { type: "tableCell"; children: InlineNode[] };

export type BlockNode =
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "heading"; depth: 1 | 2 | 3 | 4 | 5 | 6; id?: SectionId | "chapter-overview"; children: InlineNode[] }
  | { type: "list"; ordered: boolean; start?: number; children: BlockNode[] }
  | { type: "listItem"; children: BlockNode[] }
  | {
      type: "table";
      align: Array<"left" | "center" | "right" | null>;
      children: Array<{ type: "tableRow"; children: TableCell[] }>;
    }
  | { type: "tableRow"; children: TableCell[] }
  | TableCell
  | { type: "blockquote"; children: BlockNode[] }
  | { type: "thematicBreak" }
  | { type: "codeBlock"; lang?: string; value: string }
  | { type: "mathBlock"; value: string }
  | { type: "image"; src: string; alt: string; title?: string }
  | ComponentNode;

export type ComponentName = "Callout" | "Example" | "Diagram" | "Desmos";

export type ComponentProps =
  | { name: "Callout"; type: "example" | "important" | "note" | "tip" | "warning" }
  | {
      name: "Example";
      id: string;
      from: SectionId[];
      concepts: SectionId[];
      title: string;
      question: BlockNode[];
      answer: BlockNode[];
    }
  | { name: "Diagram"; id: string; kind: "mermaid" | "tikz"; title?: string }
  | { name: "Desmos"; id: string; kind: "2d" | "3d"; data: JsonValue };

export type ComponentPropSchema = {
  required: readonly string[];
  optional: readonly string[];
  values?: Readonly<Record<string, readonly string[]>>;
};

export type ComponentNode = {
  [Name in ComponentName]: {
    type: "component";
    name: Name;
    props: Extract<ComponentProps, { name: Name }>;
    children?: BlockNode[];
  };
}[ComponentName];

export const COMPONENT_PROP_SCHEMAS: Record<ComponentName, ComponentPropSchema> = {
  Callout: {
    required: ["type"],
    optional: [],
    values: { type: ["example", "important", "note", "tip", "warning"] },
  },
  Example: {
    required: ["id", "from", "concepts", "title", "question", "answer"],
    optional: [],
  },
  Diagram: {
    required: ["id", "kind"],
    optional: ["title"],
    values: { kind: ["mermaid", "tikz"] },
  },
  Desmos: {
    required: ["id", "kind", "data"],
    optional: [],
    values: { kind: ["2d", "3d"] },
  },
};

export type GlossaryEntry = {
  term: string;
  definition: string;
  aliases: string[];
  common: boolean;
};

export type GlossaryMatch = { start: number; end: number; termId: string };

export type ChapterBundle = {
  schemaVersion: 2;
  id: string;
  title: string;
  rendererVersion: string;
  sourceShas: { glossary: string; notes: string; cnotes: string };
  outline: Array<{
    id: string;
    title: string;
    importance: SectionImportance;
    brief: string;
  }>;
  notes: { tree: BlockNode[] };
  facts: Array<{
    sectionId: SectionId;
    brief: string;
    points: string[];
    visuals: Array<Extract<BlockNode, { type: "component" }>>;
    glossaryRefs: { brief: GlossaryMatch[]; points: GlossaryMatch[][] };
  }>;
  examples: Array<{
    id: string;
    from: SectionId[];
    concepts: SectionId[];
    title: string;
    question: BlockNode[];
    answer: BlockNode[];
  }>;
  glossary: Record<string, GlossaryEntry>;
  diagrams: Array<{ id: string; kind: "mermaid" | "tikz"; source: string; title?: string }>;
  desmos: Array<{ id: string; kind: "2d" | "3d"; data: JsonValue }>;
};

export type ChapterManifest = {
  schemaVersion: 2;
  rendererVersion: string;
  chapters: Array<{
    id: string;
    title: string;
    bundle: string;
    sourceShas: ChapterBundle["sourceShas"];
  }>;
};
