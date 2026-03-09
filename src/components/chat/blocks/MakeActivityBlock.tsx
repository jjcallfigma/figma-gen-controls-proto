import { Checkmark, Spinner, chatStyles } from "../primitives";

export function MakeActivityBlock({
  content,
  isDone,
}: {
  content: string;
  isDone: boolean;
}) {
  return (
    <div className="flex justify-start w-full">
      <div
        className="inline-flex items-center gap-1.5 text-[12px] px-3 py-3 rounded-[8px] w-full"
        style={{
          border: `1px solid ${chatStyles.border}`,
          backgroundColor: chatStyles.bg.card,
        }}
      >
        {isDone ? <Checkmark /> : <Spinner />}
        {content}
      </div>
    </div>
  );
}
