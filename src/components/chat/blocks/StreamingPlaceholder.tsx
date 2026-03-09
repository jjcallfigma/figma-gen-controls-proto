import { Spinner, chatStyles } from "../primitives";

export function StreamingPlaceholder() {
  return (
    <div
      className="flex items-center gap-2 my-2 text-[11px]"
      style={{ color: chatStyles.text.secondary }}
    >
      <Spinner />
      <span>Thinking…</span>
    </div>
  );
}
