import { Checkmark, ErrorIcon, Spinner, chatStyles } from "../primitives";

interface ViewStatus {
  name: string;
  status: "pending" | "ok" | "failed";
  reason?: string;
}

export function ExtractActivityBlock({
  content,
  extractResults,
}: {
  content: string;
  extractResults: {
    status: "running" | "done" | "error";
    views: ViewStatus[];
  };
}) {
  const { status, views } = extractResults;
  const isRunning = status === "running";
  const hasFailed = views.some((v) => v.status === "failed");

  return (
    <div className="flex justify-start">
      <div
        className="flex flex-col gap-1.5 text-[11px] font-medium px-3 py-2 rounded-[8px] w-full max-w-[85%]"
        style={{
          backgroundColor: chatStyles.bg.tertiary,
          color: chatStyles.text.secondary,
          border: `1px solid ${hasFailed ? "var(--color-error, #e53e3e)" : chatStyles.border}`,
        }}
      >
        <div className="flex items-center gap-1.5">
          {isRunning ? (
            <Spinner />
          ) : hasFailed ? (
            <ErrorIcon />
          ) : (
            <Checkmark />
          )}
          <span>{content}</span>
        </div>

        <div className="flex flex-col gap-0.5 ml-4">
          {views.map((v, i) => (
            <div key={i} className="flex items-center gap-1.5">
              {v.status === "ok" ? (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="flex-shrink-0"
                  style={{ color: "var(--color-success, #38a169)" }}
                >
                  <path
                    d="M3.5 8.5l3 3 6-7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : v.status === "failed" ? (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="flex-shrink-0"
                  style={{ color: "var(--color-error, #e53e3e)" }}
                >
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="flex-shrink-0 opacity-40"
                >
                  <circle cx="8" cy="8" r="3" fill="currentColor" />
                </svg>
              )}
              <span className={v.status === "failed" ? "opacity-70" : ""}>
                {v.name}
              </span>
              {v.reason && <span className="opacity-50">— {v.reason}</span>}
            </div>
          ))}
        </div>

        {hasFailed && !isRunning && (
          <div className="mt-1 text-[10px] opacity-50">
            You can ask to retry failed views with different instructions
          </div>
        )}
      </div>
    </div>
  );
}
