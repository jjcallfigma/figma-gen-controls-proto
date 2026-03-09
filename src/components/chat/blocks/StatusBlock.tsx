import { chatStyles } from "../primitives";

export function StatusBlock({ content }: { content: string }) {
  return (
    <div className="flex justify-start">
      <div
        className="text-[11px] leading-relaxed"
        style={{ color: chatStyles.text.secondary }}
      >
        {content}
      </div>
    </div>
  );
}
