export type ExecutionMode = "api" | "static"

// Full-stack is the default; static hosting is an explicit build choice.
export const executionMode: ExecutionMode = typeof __WORKBENCH_EXECUTION_MODE__ === "undefined"
  ? "api"
  : __WORKBENCH_EXECUTION_MODE__
