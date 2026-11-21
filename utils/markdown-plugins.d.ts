declare module "markdown-it-footnote" {
  const plugin: (md: InstanceType<typeof import("markdown-it").default>) => void;
  export default plugin;
}

declare module "markdown-it-sub" {
  const plugin: (md: InstanceType<typeof import("markdown-it").default>) => void;
  export default plugin;
}

declare module "markdown-it-sup" {
  const plugin: (md: InstanceType<typeof import("markdown-it").default>) => void;
  export default plugin;
}

declare module "markdown-it-task-lists" {
  const plugin: (
    md: InstanceType<typeof import("markdown-it").default>,
    options?: { enabled?: boolean; label?: boolean; labelAfter?: boolean },
  ) => void;
  export default plugin;
}

declare module "markdown-it-texmath" {
  const plugin: (
    md: InstanceType<typeof import("markdown-it").default>,
    options?: Record<string, unknown>,
  ) => void;
  export default plugin;
}
