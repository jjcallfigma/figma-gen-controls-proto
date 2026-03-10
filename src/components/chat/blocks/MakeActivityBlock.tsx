import { Button } from "@/components/ui/button";
import { Checkmark, Spinner, chatStyles } from "../primitives";

export function MakeActivityBlock({
  content,
  isDone,
  onOpen,
}: {
  content: string;
  isDone: boolean;
  onOpen?: () => void;
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
        <span className="flex-1">{content}</span>
        {isDone && onOpen && (
          <Button variant="outline" size="sm" onClick={onOpen}>
            Open
          </Button>
        )}
      </div>
    </div>
  );
}
