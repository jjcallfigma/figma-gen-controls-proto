import type { DesignChatMessage } from "@/core/hooks/useDesignChat";
import { Spinner, chatStyles } from "../primitives";

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  inspect_canvas: "Inspecting canvas",
  get_design_overview: "Getting design overview",
  check_accessibility: "Checking accessibility",
  audit_consistency: "Auditing consistency",
  analyze_hierarchy: "Analyzing hierarchy",
  apply_operations: "Applying changes",
  search_design_references: "Searching references",
  extract_design_system: "Extracting design system",
  present_choices: "Presenting options",
  get_spatial_info: "Analyzing layout",
  move_objects: "Moving objects",
  resize_objects: "Resizing objects",
  select_objects: "Selecting objects",
  present_content_blocks: "Preparing content",
  inspect_make: "Inspecting Make",
  edit_make: "Editing Make",
  create_make: "Creating Make",
  extract_views: "Extracting views",
};

const TOOLS_WITH_ACTIVITY_MSG = new Set([
  "edit_make",
  "create_make",
  "extract_views",
]);

export function ToolCallBlock({
  toolCalls,
}: {
  toolCalls: DesignChatMessage["toolCalls"];
}) {
  if (!toolCalls || toolCalls.length === 0) return null;

  const running = toolCalls.find(
    (tc) => tc.status === "running" && !TOOLS_WITH_ACTIVITY_MSG.has(tc.name),
  );
  if (!running) return null;

  const label = TOOL_DISPLAY_NAMES[running.name] || running.name;

  return (
    <div
      className="flex items-center gap-2 my-2 text-[11px]"
      style={{ color: chatStyles.text.secondary }}
    >
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function ToolCallSummaries({
  toolCalls,
}: {
  toolCalls: NonNullable<DesignChatMessage["toolCalls"]>;
}) {
  return (
    <div className="flex flex-col gap-1">
      {toolCalls.map((tc) => (
        <div
          key={tc.id}
          className="text-[11px] leading-relaxed"
          style={{ color: chatStyles.text.secondary }}
        >
          {tc.summary || tc.name}
        </div>
      ))}
    </div>
  );
}
