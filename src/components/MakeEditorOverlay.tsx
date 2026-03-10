"use client";

import { ChatMessage } from "@/components/chat";
import { toast } from "@/components/ui/toast";
import { useNavigation } from "@/contexts/NavigationContext";
import { getSessionsForNode, type ChatSession } from "@/core/hooks/useDesignChat";
import { useMakeChat } from "@/core/hooks/useMakeChat";
import { useAppStore } from "@/core/state/store";
import { deriveTitle } from "@/core/utils/chatUtils";
import { buildUpdateMakePrompt, serializeDesignTree } from "@/core/utils/designSerializer";
import { getNodeRange, instrumentCode, JsxNode, parseJSX, stripInstrumentation, updatePropInCode, updateTextInCode } from "@/core/utils/jsxParser";
import { MAKE_INSPECTOR_SCRIPT } from "@/core/utils/makeInspector";
import { extractStreamedCode, extractValidatedDependencies, SANDPACK_APP_WRAPPER, SANDPACK_HTML_TEMPLATE, SANDPACK_STYLES_OVERRIDE } from "@/core/utils/makeUtils";
import { MakeChatMessageView } from "@/components/chat/blocks/MakeChatMessageView";
import { SHADCN_DEPENDENCIES, SHADCN_FILES } from "@/core/utils/shadcnBoilerplate";
import {
  SandpackCodeEditor,
  SandpackFileExplorer,
  SandpackProvider,
  useActiveCode,
  useSandpack,
} from "@codesandbox/sandpack-react";
import { nanoid } from "nanoid";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isGenAiIntent } from "@/features/gen-ai/utils/intent";
import { Icon16Close } from "./icons/icon-16-close";
import { Icon24ChevronLeftLarge } from "./icons/icon-24-chevron-left-large";
import { Icon24Close } from "./icons/icon-24-close";
import { Icon24CodeLayer } from "./icons/icon-24-code-layer";
import { Icon24InteractionClickSmall } from "./icons/icon-24-interaction-click-small";
import { Icon24LayoutSetSmall } from "./icons/icon-24-layout-set-small";
import { Icon24Reload } from "./icons/icon-24-reload";
import NodePropertiesPanel, { InspectorSelection } from "./NodePropertiesPanel";
import SameOriginInspectPreview, { SameOriginInspectPreviewHandle } from "./SameOriginInspectPreview";
import { Button } from "./ui/button";
import { PropertyInput } from "./ui/PropertyInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

/** Imperatively pushes code changes into the Sandpack bundler */
function SandpackCodeUpdater({ code }: { code: string }) {
  const { sandpack } = useSandpack();
  const prevCode = useRef(code);

  useEffect(() => {
    if (code && code !== prevCode.current) {
      prevCode.current = code;
      sandpack.updateFile("/App.js", code);
    }
    // sandpack is a stable context ref — only re-run when code changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return null;
}

/**
 * Listens for user edits in the Sandpack code editor and propagates them back.
 * `externalCode` is the code set from outside (AI / state) so we can distinguish
 * user edits from programmatic updates pushed by SandpackCodeUpdater.
 */
function SandpackCodeListener({
  externalCode,
  onCodeChange,
}: {
  externalCode: string;
  onCodeChange: (code: string) => void;
}) {
  const { code } = useActiveCode();
  const { sandpack } = useSandpack();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const externalRef = useRef(externalCode);

  // Keep track of the latest external code so we can skip echoes
  useEffect(() => {
    externalRef.current = externalCode;
  }, [externalCode]);

  useEffect(() => {
    // Only propagate changes to App.js
    if (sandpack.activeFile !== "/App.js") return;
    // Skip if the code matches what was pushed externally (not a user edit)
    if (code === externalRef.current) return;

    // Debounce to avoid thrashing on every keystroke
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Double-check it's still different from external
      if (code !== externalRef.current) {
        onCodeChange(code);
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return null;
}

/**
 * Listens for inspector selection events from the Sandpack preview via
 * Sandpack's console forwarding (`listen()`).
 *
 * The inspector script inside the preview uses `console.log("__MAKE_INSPECT__:...")`.
 * Sandpack captures this and forwards it to us — this is the only reliable
 * iframe → parent communication channel with Sandpack.
 */
function SandpackInspectorListener({
  enabled,
  onSelect,
}: {
  enabled: boolean;
  onSelect: (sel: InspectorSelection) => void;
}) {
  const { listen } = useSandpack();

  useEffect(() => {
    if (!enabled) return;

    const unsub = listen((msg: any) => {
      // Sandpack console messages have type "console" and a log array
      if (msg.type === "console" && msg.log) {
        for (const entry of msg.log) {
          const data = entry.data?.[0];
          if (typeof data === "string" && data.startsWith("__MAKE_INSPECT__:")) {
            try {
              const payload = JSON.parse(data.slice("__MAKE_INSPECT__:".length));
              onSelect(payload);
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    });
    return unsub;
  }, [enabled, listen, onSelect]);

  return null;
}

/** Watches for Sandpack runtime / bundler errors and reports them after a debounce */
function SandpackErrorWatcher({
  onError,
  enabled,
}: {
  onError: (errMsg: string) => void;
  enabled: boolean;
}) {
  const { sandpack } = useSandpack();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReportedRef = useRef<string>("");

  useEffect(() => {
    if (!enabled) return;
    const errMsg = sandpack.error?.message;

    // Clear pending timer if error resolved or changed
    if (!errMsg) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      lastReportedRef.current = "";
      return;
    }

    // Don't re-report the same error
    if (errMsg === lastReportedRef.current) return;

    // Debounce 3s — Sandpack may briefly show errors while recompiling
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // Re-check: error might have cleared during the debounce
      if (sandpack.error?.message) {
        lastReportedRef.current = sandpack.error.message;
        onError(sandpack.error.message);
      }
    }, 3000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandpack.error?.message, enabled]);

  return null;
}

/** Max number of auto-fix retries per user message */
const MAX_AUTO_FIX_RETRIES = 2;

// AIProvider type imported from useMakeChat hook

interface DevicePreset {
  label: string;
  width: number | null; // null = 100%
  height: number | null; // null = 100%
}
const DEVICE_PRESETS: DevicePreset[] = [
  { label: "Laptop", width: 1440, height: 800 },
  { label: "iPhone 16 Pro", width: 393, height: 852 },
  { label: "iPhone SE", width: 375, height: 667 },
  { label: "Pixel 9", width: 412, height: 924 },
  { label: "Galaxy S24", width: 360, height: 780 },
  { label: "Custom", width: 1280, height: 720 },
];



// ─── Design session title helper ─────────────────────────────────

function getDesignSessionTitle(session: ChatSession): string {
  if (session.title) return session.title;
  const firstUserMsg = session.chatHistory.find((m) => m.role === "user");
  let rawPrompt = firstUserMsg?.content || "Chat";
  const contextEnd = rawPrompt.indexOf("```\n\n");
  if (contextEnd !== -1) rawPrompt = rawPrompt.slice(contextEnd + 5);
  return deriveTitle(rawPrompt);
}


export default function MakeEditorOverlay() {
  const makeEditor = useAppStore((state) => state.makeEditor);
  const closeMakeEditor = useAppStore((state) => state.closeMakeEditor);
  const dispatch = useAppStore((state) => state.dispatch);
  const objects = useAppStore((state) => state.objects);
  const { isNavigationCollapsed } = useNavigation();

  const [chatWidth, setChatWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [explorerWidth, setExplorerWidth] = useState(220);
  const [showDeviceBar, setShowDeviceBar] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [selectedDevice, setSelectedDevice] = useState("Laptop");
  const [rightPanelView, setRightPanelView] = useState<"preview" | "code">("preview");

  // ─── Inspect mode state ────────────────────────────────────────────
  const [inspectMode, setInspectMode] = useState(false);
  const [inspectorSelection, setInspectorSelection] = useState<InspectorSelection | null>(null);
  const inspectPreviewRef = useRef<SameOriginInspectPreviewHandle>(null);

  // Auto-fix: tracks how many consecutive retries we've done for the current code
  const [autoFixCount, setAutoFixCount] = useState(0);
  const autoFixInProgress = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Incrementing this forces Sandpack to fully remount with the latest code
  const [sandpackKey, setSandpackKey] = useState(0);

  // Validated npm dependencies for the current code
  const [validatedDeps, setValidatedDeps] = useState<Record<string, string>>({});

  // ─── Design chat history for this Make ───────────────────────────
  const [activeDesignSessionId, setActiveDesignSessionId] = useState<string | null>(null);
  const aiSessionStatuses = useAppStore((s) => s.aiSessionStatuses);

  const designSessions = useMemo(() => {
    if (!makeEditor.objectId) return [];
    return getSessionsForNode(makeEditor.objectId);
    // aiSessionStatuses changes drive re-computation when sessions update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [makeEditor.objectId, aiSessionStatuses]);

  const activeDesignSession = useMemo(() => {
    if (!activeDesignSessionId) return null;
    return designSessions.find((s) => s.id === activeDesignSessionId) ?? null;
  }, [activeDesignSessionId, designSessions]);

  // Get the active make object
  const makeObject = makeEditor.objectId
    ? objects[makeEditor.objectId]
    : null;
  const makeProps =
    makeObject?.properties?.type === "make" ? makeObject.properties : null;

  // ─── Shared chat hook ──────────────────────────────────────────────
  const {
    chatHistory,
    setChatHistory,
    currentCode,
    setCurrentCode,
    message,
    setMessage,
    isLoading,
    setIsLoading,
    aiProvider,
    setAiProvider,
    handleSend: hookHandleSend,
    handleSendRef,
    handleStop,
    flushToStore,
    saveToStore,
  } = useMakeChat({
    objectId: makeEditor.objectId ?? undefined,
    active: makeEditor.isOpen,
    onExchangeComplete: (cleanCode) => {
      // Validate dependencies then remount Sandpack with the final code
      extractValidatedDependencies(cleanCode).then((deps) => {
        setValidatedDeps(deps);
        setSandpackKey((k) => k + 1);
      });
    },
  });

  // Sync inspector state and Sandpack when editor opens / switches object
  const pendingAutoSendRef = useRef<string | null>(null);
  useEffect(() => {
    if (makeEditor.isOpen && makeProps) {
      // Always start with inspect mode off
      setInspectMode(false);
      setInspectorSelection(null);
      // Validate deps then remount Sandpack
      extractValidatedDependencies(currentCode).then((deps) => {
        setValidatedDeps(deps);
        setSandpackKey((k) => k + 1);
      });
      // If the chatHistory is empty but we have a sourceObjectId, this is a
      // fresh "Convert to Make" — build the prompt and schedule auto-send.
      const history = makeProps.chatHistory || [];
      if (history.length === 0 && makeProps.sourceObjectId) {
        const sourceObj = objects[makeProps.sourceObjectId];
        if (sourceObj) {
          const designDescription = serializeDesignTree(sourceObj.id, objects);
          pendingAutoSendRef.current = `Recreate this design as a React component with Tailwind CSS. Match the layout, colors, typography, and spacing as closely as possible. Use semantic HTML elements and make it responsive.\n\nDesign tree:\n\`\`\`html\n${designDescription}\n\`\`\``;
        }
      }

      // If a pendingMessage was passed via openMakeEditor (e.g. "Update Make from Design"),
      // schedule it for auto-send and clear it from the store.
      if (makeEditor.pendingMessage) {
        pendingAutoSendRef.current = makeEditor.pendingMessage;
        // Clear the pending message from the store so it doesn't re-fire
        useAppStore.setState((draft) => { draft.makeEditor.pendingMessage = null; });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [makeEditor.objectId, makeEditor.isOpen]);

  // Auto-send the conversion prompt after the editor has fully mounted.
  // Uses a standalone interval so it isn't cancelled by re-renders.
  useEffect(() => {
    if (!makeEditor.isOpen) return;
    const id = setInterval(() => {
      if (pendingAutoSendRef.current && handleSendRef.current && !isLoading) {
        const prompt = pendingAutoSendRef.current;
        pendingAutoSendRef.current = null;
        handleSendRef.current(prompt);
        clearInterval(id);
      }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [makeEditor.objectId, makeEditor.isOpen]);

  // Auto-scroll chat so the latest user message sits near the top of the visible area.
  // A dynamic bottom spacer ensures there is always enough scrollable room.
  // Only triggers when a NEW user message is added (not on streaming updates).
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [chatBottomPad, setChatBottomPad] = useState(0);
  const lastScrolledUserMsgId = useRef<string | null>(null);
  const SCROLL_TOP_OFFSET = 16; // px breathing room above the message

  useEffect(() => {
    const container = chatScrollRef.current;
    if (!container || chatHistory.length === 0) {
      setChatBottomPad(0);
      return;
    }

    // Find the latest user message
    const lastUserMsg = [...chatHistory].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;

    // Only scroll when a new user message appears (not on streaming / assistant updates)
    if (lastUserMsg.id === lastScrolledUserMsgId.current) return;
    lastScrolledUserMsgId.current = lastUserMsg.id;

    // Wait one frame so the DOM has the new message rendered
    requestAnimationFrame(() => {
      const userMsgEls = container.querySelectorAll("[data-chat-role='user']");
      const lastUserMsgEl = userMsgEls[userMsgEls.length - 1] as HTMLElement | undefined;
      if (!lastUserMsgEl) return;

      // Calculate spacer so there's always room to scroll the message to the top
      const containerH = container.clientHeight;
      const msgTop = lastUserMsgEl.offsetTop;
      const msgHeight = lastUserMsgEl.offsetHeight;
      const contentH = container.scrollHeight - chatBottomPad; // exclude old spacer
      const belowMsg = contentH - msgTop;
      // Ensure enough room to show the full message + some breathing room below
      const needed = Math.max(0, containerH - belowMsg + msgHeight);
      setChatBottomPad(needed);

      // Wait for React to flush the spacer update before scrolling
      setTimeout(() => {
        requestAnimationFrame(() => {
          container.scrollTo({
            top: Math.max(0, lastUserMsgEl.offsetTop - SCROLL_TOP_OFFSET),
            behavior: "smooth",
          });
        });
      }, 50);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatHistory]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);

  // Focus textarea on open
  useEffect(() => {
    if (makeEditor.isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [makeEditor.isOpen]);

  // ─── JSX parsing & instrumentation for inspector ─────────────────
  const parsedJSX = useMemo(() => {
    if (!currentCode) return { roots: [] as JsxNode[], nodeMap: new Map<number, JsxNode>() };
    return parseJSX(currentCode);
  }, [currentCode]);

  // Always instrument code so the same-origin iframe stays warm across inspect toggles
  const instrumentedCode = useMemo(() => {
    if (!currentCode || parsedJSX.roots.length === 0) return currentCode;
    return instrumentCode(currentCode, parsedJSX.roots);
  }, [currentCode, parsedJSX.roots]);

  // Currently selected JSX node (from the parsed tree, not the instrumented one)
  const selectedJsxNode = inspectorSelection
    ? parsedJSX.nodeMap.get(inspectorSelection.nodeId) ?? null
    : null;

  // ─── Inspector selection callback (from SandpackInspectorListener) ──
  const handleInspectorSelect = useCallback((sel: InspectorSelection) => {
    // nodeId -1 signals deselection (clicking an already-selected element)
    if (sel.nodeId === -1) {
      setInspectorSelection(null);
    } else {
      setInspectorSelection(sel);
    }
  }, []);

  // Clear selection when leaving inspect mode
  useEffect(() => {
    if (!inspectMode) {
      setInspectorSelection(null);
    }
  }, [inspectMode]);

  // ─── Prop / text change handlers (inspector → code) ────────────────
  const handleInspectorPropChange = useCallback(
    (nodeId: number, propName: string, newValue: string) => {
      const node = parsedJSX.nodeMap.get(nodeId);
      if (!node || !currentCode) return;

      const newCode = updatePropInCode(currentCode, node, propName, newValue);
      setCurrentCode(newCode);
      saveToStore(newCode, chatHistory);

      // For className changes, patch the DOM directly (preserves interactive state)
      if (propName === "className") {
        inspectPreviewRef.current?.patchElement(nodeId, { className: newValue });
      }
    },
    [parsedJSX.nodeMap, currentCode, chatHistory, saveToStore]
  );

  const handleInspectorTextChange = useCallback(
    (nodeId: number, newText: string) => {
      const node = parsedJSX.nodeMap.get(nodeId);
      if (!node || !currentCode) return;

      const newCode = updateTextInCode(currentCode, node, newText);
      setCurrentCode(newCode);
      saveToStore(newCode, chatHistory);

      // Patch text directly in the DOM (preserves interactive state)
      inspectPreviewRef.current?.patchElement(nodeId, { textContent: newText });
    },
    [parsedJSX.nodeMap, currentCode, chatHistory, saveToStore]
  );

  const handleInspectorDelete = useCallback(
    (nodeId: number) => {
      const node = parsedJSX.nodeMap.get(nodeId);
      if (!node || !currentCode) return;

      const range = getNodeRange(currentCode, node);
      const snip = (start: number, end: number) => {
        const text = currentCode.slice(start, Math.min(end, start + 120));
        return text.length < end - start ? text + "..." : text;
      };

      const lineOf = (offset: number) =>
        currentCode.slice(0, offset).split("\n").length;

      const instruction = [
        `[Delete element] In the current React code, remove the <${node.name}> element (around line ${lineOf(range.start)}) and all its children.`,
        `Make sure the resulting JSX is still valid — clean up any empty ternary branches, conditional wrappers, map callbacks, or dangling syntax left behind.`,
        `\nElement to delete:\n\`\`\`\n${snip(range.start, range.end)}\n\`\`\``,
      ].join("\n");

      setInspectorSelection(null);
      setInspectMode(false);
      handleSendRef.current?.(instruction);
    },
    [parsedJSX.nodeMap, currentCode]
  );

  const handleInspectorMove = useCallback(
    (sourceNodeId: number, targetNodeId: number, position: "before" | "after") => {
      const sourceNode = parsedJSX.nodeMap.get(sourceNodeId);
      const targetNode = parsedJSX.nodeMap.get(targetNodeId);
      if (!sourceNode || !targetNode || !currentCode) return;

      // Build a short snippet for each element so the AI can identify them
      const sourceRange = getNodeRange(currentCode, sourceNode);
      const targetRange = getNodeRange(currentCode, targetNode);
      const snip = (start: number, end: number) => {
        const text = currentCode.slice(start, Math.min(end, start + 120));
        return text.length < end - start ? text + "..." : text;
      };

      // Count the line number for context
      const lineOf = (offset: number) =>
        currentCode.slice(0, offset).split("\n").length;

      const instruction = [
        `[Move element] In the current React code, move the <${sourceNode.name}> element (around line ${lineOf(sourceRange.start)}) to be placed **${position}** the <${targetNode.name}> element (around line ${lineOf(targetRange.start)}).`,
        `Keep all of the moved element's props, children, and content exactly the same. Make sure the resulting JSX is valid (proper nesting, fragments if needed).`,
        `\nElement to move:\n\`\`\`\n${snip(sourceRange.start, sourceRange.end)}\n\`\`\``,
        `\nTarget element:\n\`\`\`\n${snip(targetRange.start, targetRange.end)}\n\`\`\``,
      ].join("\n");

      setInspectorSelection(null);
      // Exit inspect mode so the Sandpack preview shows the AI update live
      setInspectMode(false);
      handleSendRef.current?.(instruction);
    },
    [parsedJSX.nodeMap, currentCode]
  );

  const handleInspectorDeselect = useCallback(() => {
    setInspectorSelection(null);
  }, []);

  // Wrap the hook's handleSend to prepend inspector context when applicable
  const handleSend = async (overrideMessage?: string) => {
    // Reset auto-fix counter on every new user message
    setAutoFixCount(0);

    // For user-typed messages (no overrideMessage): detect gen-ai intent and
    // re-route through the gen-ai pipeline if the object has genAiSpec or the
    // message looks like a controls/parametric request.
    if (!overrideMessage) {
      const msgText = message.trim();
      if (!msgText) return;

      const hasGenAiSpec = !!(makeObject?.genAiSpec);
      if (hasGenAiSpec || isGenAiIntent(msgText)) {
        const frameId = makeEditor.objectId ?? null;
        if (frameId) {
          window.dispatchEvent(
            new CustomEvent("gen-ai-modify-send", {
              detail: { message: msgText, frameId },
            }),
          );
          return;
        }
      }
    }

    // If an element is selected in inspect mode, prepend context about it
    if (!overrideMessage && inspectorSelection && currentCode) {
      const node = parsedJSX.nodeMap.get(inspectorSelection.nodeId);
      if (node) {
        const msgText = message.trim();
        if (!msgText) return;
        const range = getNodeRange(currentCode, node);
        const snip = currentCode.slice(range.start, Math.min(range.end, range.start + 200));
        const lineOf = currentCode.slice(0, range.start).split("\n").length;
        const finalMsg = `[Selected element: <${node.name}> around line ${lineOf}]\n\`\`\`\n${snip}${range.end - range.start > 200 ? "..." : ""}\n\`\`\`\n\n${msgText}`;
        setInspectorSelection(null);
        setInspectMode(false);
        return hookHandleSend(finalMsg);
      }
    }

    return hookHandleSend(overrideMessage);
  };

  // Keep the ref in sync for programmatic callers (inspector delete/move, auto-send, auto-fix)
  handleSendRef.current = handleSend;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── Auto-fix: send error back to AI for correction ────────────────
  const handleAutoFix = useCallback(
    async (errorMessage: string) => {
      // Guard: don't overlap, don't exceed retries, don't fire while user is already sending
      if (
        autoFixInProgress.current ||
        isLoading ||
        autoFixCount >= MAX_AUTO_FIX_RETRIES ||
        !currentCode
      )
        return;

      autoFixInProgress.current = true;
      const attempt = autoFixCount + 1;
      setAutoFixCount(attempt);
      setIsLoading(true);

      console.log(
        `[AutoFix] Attempt ${attempt}/${MAX_AUTO_FIX_RETRIES} — "${errorMessage.slice(0, 120)}"`
      );

      // Truncate the error for display — keep the first meaningful line
      const shortError = errorMessage.split("\n")[0].slice(0, 150);

      // Add chat bubbles: one for the error detected, one for the fix status
      const errorMsgId = nanoid();
      const fixMsgId = nanoid();
      setChatHistory((prev) => [
        ...prev,
        {
          id: errorMsgId,
          role: "assistant" as const,
          content: shortError,
          messageType: "error" as const,
          timestamp: Date.now(),
        },
        {
          id: fixMsgId,
          role: "assistant" as const,
          content: `Analyzing and fixing error (attempt ${attempt}/${MAX_AUTO_FIX_RETRIES})…`,
          messageType: "auto_fix" as const,
          timestamp: Date.now(),
        },
      ]);

      const startTime = Date.now();

      try {
        // Build conversation: the existing history + a synthetic "fix this" user message
        // Analyze the error to give the AI a better hint
        const isUndefinedError =
          errorMessage.includes("undefined") ||
          errorMessage.includes("is not defined") ||
          errorMessage.includes("Element type is invalid");

        const fixHint = isUndefinedError
          ? `\n\nThis error almost always means you imported a component or icon that does not exist in the package. Common mistakes:\n- Importing a named export that doesn't exist (e.g. \`{ Google }\` from "lucide-react" — there is no Google icon in lucide-react)\n- Using \`react-icons\` which is too large for the bundler — use inline SVGs for brand icons instead\n- Wrong Radix UI import pattern — must use \`import * as X from "@radix-ui/react-x"\`\n- Importing from a package that doesn't exist on npm\n\nFix: check every import statement. For any icon or component you're not 100% sure exists, replace it with an inline SVG or implement it with plain HTML + Tailwind.`
          : "";

        const fixPrompt = `The code you generated has a runtime error:\n\n\`\`\`\n${errorMessage}\n\`\`\`${fixHint}\n\nPlease fix the code. Return the complete corrected App.js.`;

        const apiMessages = [
          ...chatHistory
            .filter((m) => m.role === "user" || m.role === "assistant")
            .filter((m) => !m.content.startsWith("__"))
            .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user" as const, content: fixPrompt },
        ];

        const response = await fetch("/api/make-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            currentCode,
            provider: aiProvider,
          }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || "API request failed");
        }

        // Read the stream — extract reasoning + code
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let fullOutput = "";
        let reasoning = "";
        let reasoningDone = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter((l) => l.trim() !== "");
          for (const line of lines) {
            if (line === "data: [DONE]") break;
            if (line.startsWith("data: ")) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.token) {
                  fullOutput += parsed.token;

                  // Stream the <think> reasoning into the fix bubble
                  if (!reasoningDone) {
                    const thinkStart = fullOutput.indexOf("<think>");
                    const thinkEnd = fullOutput.indexOf("</think>");
                    if (thinkStart !== -1) {
                      if (thinkEnd !== -1) {
                        reasoning = fullOutput.slice(thinkStart + 7, thinkEnd).trim();
                        reasoningDone = true;
                      } else {
                        reasoning = fullOutput.slice(thinkStart + 7).trim();
                      }
                      // Show reasoning live in the fix bubble
                      setChatHistory((prev) =>
                        prev.map((m) =>
                          m.id === fixMsgId
                            ? {
                                ...m,
                                content: reasoning || "Analyzing…",
                                messageType: "auto_fix" as const,
                              }
                            : m
                        )
                      );
                    }
                  } else {
                    // After reasoning, update to show "Applying fix…"
                    setChatHistory((prev) =>
                      prev.map((m) =>
                        m.id === fixMsgId
                          ? { ...m, content: "Applying fix…", messageType: "auto_fix" as const }
                          : m
                      )
                    );
                  }
                }
              } catch {
                /* skip */
              }
            }
          }
        }

        // Extract the code between </think> and <summary> (or end)
        let codeOutput = fullOutput;
        const thinkEnd = codeOutput.indexOf("</think>");
        if (thinkEnd !== -1) codeOutput = codeOutput.slice(thinkEnd + 8);
        // Extract summary if present
        let fixSummary = "";
        const summaryStart = codeOutput.indexOf("<summary>");
        const summaryEnd = codeOutput.indexOf("</summary>");
        if (summaryStart !== -1 && summaryEnd !== -1) {
          fixSummary = codeOutput.slice(summaryStart + 9, summaryEnd).trim();
          codeOutput = codeOutput.slice(0, summaryStart);
        } else if (summaryStart !== -1) {
          codeOutput = codeOutput.slice(0, summaryStart);
        }
        const cleanCode = extractStreamedCode(codeOutput.trim());

        const elapsed = Date.now() - startTime;
        const elapsedStr = elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(1)}s`;

        // Build a verbose result message
        const resultParts: string[] = [`Auto-fixed in ${elapsedStr}`];
        if (reasoning) resultParts.push(reasoning);
        if (fixSummary) {
          // Strip suggestion arrows from the summary
          const cleanSummary = fixSummary
            .split("\n")
            .filter((l) => !l.trim().startsWith("→"))
            .join("\n")
            .trim();
          if (cleanSummary) resultParts.push(cleanSummary);
        }

        setChatHistory((prev) =>
          prev.map((m) =>
            m.id === fixMsgId
              ? { ...m, content: resultParts.join("\n"), messageType: "elapsed" as const }
              : m
          )
        );

        if (cleanCode) {
          setCurrentCode(cleanCode);
          saveToStore(cleanCode, chatHistory);
          extractValidatedDependencies(cleanCode).then((deps) => {
            setValidatedDeps(deps);
            setSandpackKey((k) => k + 1);
          });
        }
      } catch (err: any) {
        console.error("[AutoFix] Failed:", err);
        setChatHistory((prev) =>
          prev.map((m) =>
            m.id === fixMsgId
              ? { ...m, content: `Auto-fix failed: ${err.message}`, messageType: "status" as const }
              : m
          )
        );
      } finally {
        setIsLoading(false);
        autoFixInProgress.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [autoFixCount, isLoading, currentCode, chatHistory, aiProvider, saveToStore]
  );

  // Escape: exit inspect mode first, then close editor
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && makeEditor.isOpen) {
        if (inspectMode) {
          setInspectMode(false);
        } else {
          flushToStore();
          closeMakeEditor();
        }
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [makeEditor.isOpen, inspectMode, closeMakeEditor, flushToStore]);

  // Chat panel resize handler
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      const startX = e.clientX;
      const startWidth = chatWidth;
      const navOffset = isNavigationCollapsed ? 0 : 48;

      const handleMouseMove = (ev: MouseEvent) => {
        const newWidth = Math.max(300, Math.min(700, startWidth + (ev.clientX - startX)));
        setChatWidth(newWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [chatWidth, isNavigationCollapsed]
  );

  // File explorer resize handler
  const handleExplorerResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = explorerWidth;

      const handleMouseMove = (ev: MouseEvent) => {
        const newWidth = Math.max(140, Math.min(400, startWidth + (ev.clientX - startX)));
        setExplorerWidth(newWidth);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [explorerWidth]
  );

  // Viewport resize (drag handles)
  const viewportContainerRef = useRef<HTMLDivElement>(null);
  const [isViewportResizing, setIsViewportResizing] = useState(false);

  const handleViewportResizeMouseDown = useCallback(
    (e: React.MouseEvent, direction: "left" | "right" | "bottom") => {
      e.preventDefault();
      e.stopPropagation();
      setIsViewportResizing(true);

      const startX = e.clientX;
      const startY = e.clientY;
      const container = viewportContainerRef.current;
      if (!container) return;
      const startW = container.offsetWidth;
      const startH = container.offsetHeight;

      const handleMouseMove = (ev: MouseEvent) => {
        if (direction === "right") {
          const newW = Math.max(200, startW + (ev.clientX - startX) * 2);
          setViewportWidth(newW);
        } else if (direction === "left") {
          const newW = Math.max(200, startW - (ev.clientX - startX) * 2);
          setViewportWidth(newW);
        } else {
          const newH = Math.max(200, startH + (ev.clientY - startY));
          setViewportHeight(newH);
        }
        setSelectedDevice("Custom");
      };

      const handleMouseUp = () => {
        setIsViewportResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    []
  );

  /** Called when the user edits code directly in the Code tab */
  const handleEditorCodeChange = useCallback(
    (newCode: string) => {
      // If inspect mode is on, the code in the editor has data-make-* attributes;
      // strip them before storing the clean version.
      const cleanCode = inspectMode ? stripInstrumentation(newCode) : newCode;
      setCurrentCode(cleanCode);
      saveToStore(cleanCode, chatHistory);
    },
    [chatHistory, saveToStore, inspectMode]
  );

  if (!makeEditor.isOpen || !makeObject) return null;

  // Detect if the *other* consumer (sidebar) is streaming — infer from
  // chat history containing a code_streaming message or empty-assistant message.
  const lastChatMsg = chatHistory[chatHistory.length - 1];
  const externallyLoading =
    !isLoading &&
    lastChatMsg?.role === "assistant" &&
    (lastChatMsg.isCodeStreaming ||
      lastChatMsg.messageType === "code_streaming" ||
      lastChatMsg.content.startsWith("__CODE_STREAMING__") ||
      lastChatMsg.content === "");
  const effectiveLoading = isLoading || externallyLoading;
  const canSend = message.trim().length > 0 && !effectiveLoading;

  const navBarWidth = isNavigationCollapsed ? 0 : 48;

  return (
    <div
      className="fixed top-0 right-0 bottom-0 z-[100] flex"
      style={{
        left: `${navBarWidth}px`,
        backgroundColor: "var(--color-bg, #fff)",
      }}
    >
      {/* Left panel — Chat */}
      <div
        className="flex flex-col h-full border-r relative"
        style={{
          width: `${chatWidth}px`,
          minWidth: "300px",
          maxWidth: "700px",
          borderColor: "var(--color-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                flushToStore();
                closeMakeEditor();
              }}
              title="Close (Esc)"
            >
              <Icon24ChevronLeftLarge/>
            </Button>
            <div>
              <div
                className="text-[13px] font-medium"
                style={{ color: "var(--color-text)" }}
              >
                {makeObject.name}
              </div>
              
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Update from Design button — only when source object exists */}
            {makeProps?.sourceObjectId && objects[makeProps.sourceObjectId] && (
              <Button
                variant="ghost"
                onClick={() => {
                  const sourceObj = objects[makeProps.sourceObjectId!];
                  if (!sourceObj) return;
                  const currentTree = serializeDesignTree(makeProps.sourceObjectId!, objects);
                  const baselineSnapshot = sourceObj.sourceDesignSnapshot;
                  const updateMessage = buildUpdateMakePrompt(currentTree, baselineSnapshot);
                  handleSendRef.current?.(updateMessage);
                }}
                disabled={effectiveLoading}
                title={`Update from "${objects[makeProps.sourceObjectId]?.name}"`}
              >
                Update from Design
              </Button>
            )}
            {/* Design chat sessions dropdown */}
            {designSessions.length > 0 && (
              <Select
                value={activeDesignSessionId || "__none__"}
                onValueChange={(v) => setActiveDesignSessionId(v === "__none__" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Design chats" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Design chats</SelectItem>
                  {designSessions.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {getDesignSessionTitle(session)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Chat messages — show design session messages OR Make chat messages */}
        <div ref={chatScrollRef} className="flex-1 overflow-y-auto scrollbar-hide px-6 py-4 relative">
          {activeDesignSession ? (
            <div className="flex flex-col gap-3">
              {activeDesignSession.chatHistory.map((msg) => (
                <ChatMessage key={msg.id} msg={msg} variant="compact" />
              ))}
            </div>
          ) : chatHistory.length === 0 && designSessions.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center h-full text-center"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <Icon24CodeLayer className="h-8 w-8 mb-2" />
              <p className="text-[13px] font-medium mb-1">
                What do you want to make?
              </p>
              <p className="text-[12px] opacity-60">
                Describe your idea.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {chatHistory.map((msg, i) => (
                <MakeChatMessageView
                  key={msg.id}
                  msg={msg}
                  isStreaming={effectiveLoading && i === chatHistory.length - 1}
                  onSuggestionClick={(s) => {
                    setMessage(s);
                    handleSend(s);
                  }}
                />
              ))}
              <div style={{ height: chatBottomPad }} />
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div
          className="flex-shrink-0 px-4 pb-4 pt-2"
        >
          <div
            className="border rounded-xl overflow-hidden"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg)",
              lineHeight: "20px",
            }}
          >
            {/* Selected element pill */}
            {inspectorSelection && (
              <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-0">
                <span
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-[5px] text-[11px] font-medium"
                  style={{
                    backgroundColor: "transparent",
                    color: "#3b82f6",
                    border: "1px solid rgba(59,130,246,0.25)",

                  }}
                >
                  {inspectorSelection.name}
                  <button
                    onClick={() => setInspectorSelection(null)}
                    className="ml-0.5 hover:opacity-70"
                    style={{ color: "#3b82f6", lineHeight: "1" }}
                  >
                    <Icon16Close />
                  </button>
                </span>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={inspectorSelection ? `Describe changes for <${inspectorSelection.name}>...` : "Ask for changes..."}
              rows={3}
              className="w-full px-3 py-3 resize-none border-0 outline-none bg-transparent"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 400,
                fontSize: "13px",
                color: "var(--color-text)",
                minHeight: "68px",
                maxHeight: "200px",
              }}
            />
            <div className="flex items-center justify-between px-3 pb-2">
              {/* Model selector */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setAiProvider("openai")}
                  className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor:
                      aiProvider === "openai"
                        ? "var(--color-bg-selected, #e8f4ff)"
                        : "transparent",
                    color:
                      aiProvider === "openai"
                        ? "var(--color-text-brand, #0D99FF)"
                        : "var(--color-text-tertiary, #999)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  GPT-5.2
                </button>
                <button
                  onClick={() => setAiProvider("claude")}
                  className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor:
                      aiProvider === "claude"
                        ? "var(--color-bg-selected, #fef3e8)"
                        : "transparent",
                    color:
                      aiProvider === "claude"
                        ? "#D97706"
                        : "var(--color-text-tertiary, #999)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Claude
                </button>
              </div>
              {effectiveLoading ? (
                isLoading ? (
                  <button
                    onClick={handleStop}
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: "var(--color-bg-inverse, #000000)",
                      color: "white",
                      cursor: "pointer",
                      border: "none",
                    }}
                    title="Stop generation"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                      <rect width="10" height="10" rx="1.5" />
                    </svg>
                  </button>
                ) : (
                  <div
                    className="w-5 h-5 border-2 rounded-full animate-spin"
                    style={{ borderColor: "var(--color-border)", borderTopColor: "var(--color-text-secondary)" }}
                    title="Generating in assistant…"
                  />
                )
              ) : (
                <button
                  onClick={() => handleSend()}
                  disabled={!canSend}
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: canSend
                      ? "var(--color-bg-inverse, #000000)"
                      : "var(--color-bg-disabled, #e0e0e0)",
                    color: "white",
                    cursor: canSend ? "pointer" : "default",
                    border: "none",
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      d="M7 12V2M7 2L3 6M7 2L11 6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Resize handle */}
        <div
          className="absolute right-0 top-0 w-[5px] h-full cursor-ew-resize z-10"
          onMouseDown={handleResizeMouseDown}
        />
      </div>

      {/* Right panel — Preview / Code */}
      <div className="flex-1 flex flex-col h-full">
        {/* Header with Preview/Code toggle */}
        <div
          className="grid items-center px-3 py-2 border-b flex-shrink-0"
          style={{ borderColor: "var(--color-border)", gridTemplateColumns: "1fr auto 1fr" }}
        >
          {/* Left: Inspect toggle */}
          <div className="flex items-center justify-start gap-2">

            {/* Reload button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                inspectPreviewRef.current?.reload();
                setSandpackKey((k) => k + 1);
              }}
              title="Reload preview"
            >
              <Icon24Reload />
            </Button>
          <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (showDeviceBar) {
                  setShowDeviceBar(false);
                  setViewportWidth(null);
                  setViewportHeight(null);
                } else {
                  const preset = DEVICE_PRESETS.find((d) => d.label === selectedDevice);
                  if (preset) {
                    setViewportWidth(preset.width);
                    setViewportHeight(preset.height);
                  }
                  setShowDeviceBar(true);
                }
              }}
              className={showDeviceBar ? "bg-[#3b82f620] text-[#3b82f6]" : ""}
              title={showDeviceBar ? "Hide device toolbar" : "Show device toolbar"}
            >
              <Icon24LayoutSetSmall />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={ inspectMode ? "bg-[#3b82f620] text-[#3b82f6] hover:text-[#3b82f6]" : ""}
              onClick={() => {
                const newMode = !inspectMode;
                setInspectMode(newMode);
                // Switch to preview when entering inspect mode
                if (newMode) setRightPanelView("preview");
              }}
              title={inspectMode ? "Exit inspect mode" : "Inspect elements"}
            >
              <Icon24InteractionClickSmall/>
            </Button>
          </div>

          {/* Center: Preview / Code toggle */}
          <div className="flex items-center justify-center">
            <ToggleGroup
              type="single"
              value={rightPanelView}
              onValueChange={(val) => {
                if (!val) return; // Prevent deselecting
                const view = val as "preview" | "code";
                // When switching back to preview from code, force a Sandpack remount
                // so any code edits are picked up immediately
                if (view === "preview" && rightPanelView === "code") {
                  setSandpackKey((k) => k + 1);
                }
                setRightPanelView(view);
              }}
              className="bg-secondary rounded-[5px]"
            >
              <ToggleGroupItem value="preview" className="text-[11px] px-2.5 capitalize">
                Preview
              </ToggleGroupItem>
              <ToggleGroupItem value="code" className="text-[11px] px-2.5 capitalize">
                Code
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Right: device toolbar toggle + reload */}
          <div className="flex items-center justify-end gap-1">
            {/* Device toolbar toggle */}
            <Button size="sm">Share</Button>
          </div>
        </div>

        {/* Secondary header: Device toolbar */}
        {showDeviceBar && rightPanelView === "preview" && (
          <div
            className="grid items-center px-3 py-2 border-b flex-shrink-0"
            style={{ borderColor: "var(--color-border)", gridTemplateColumns: "1fr auto 1fr" }}
          >
            {/* Left: Device preset select */}
            <div className="flex items-center justify-start">
              <Select
                value={selectedDevice}
                onValueChange={(val) => {
                  setSelectedDevice(val);
                  const preset = DEVICE_PRESETS.find((d) => d.label === val);
                  if (preset) {
                    setViewportWidth(preset.width);
                    setViewportHeight(preset.height);
                  }
                }}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEVICE_PRESETS.map((preset) => (
                    <SelectItem key={preset.label} value={preset.label}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Center: Width × Height inputs */}
            <div className="flex items-center justify-center gap-1.5">
              <div className="w-[72px]">
                <PropertyInput
                  label="Width"
                  value={viewportWidth ?? ""}
                  onChange={(v) => {
                    const num = v === "" || v == null ? null : Number(v);
                    setViewportWidth(num);
                    setSelectedDevice("Custom");
                  }}
                  type="number"
                  leadingLabel="W"
                  min={100}
                />
              </div>
              <div className="w-[72px]">
                <PropertyInput
                  label="Height"
                  value={viewportHeight ?? ""}
                  onChange={(v) => {
                    const num = v === "" || v == null ? null : Number(v);
                    setViewportHeight(num);
                    setSelectedDevice("Custom");
                  }}
                  type="number"
                  leadingLabel="H"
                  min={100}
                />
              </div>
            </div>

            {/* Right: Close button */}
            <div className="flex items-center justify-end">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setShowDeviceBar(false); setViewportWidth(null); setViewportHeight(null); }}
                title="Close device toolbar"
              >
                <Icon24Close />
              </Button>
            </div>
          </div>
        )}

        {/* Content area */}
        <div
          className="flex-1 flex relative"
          style={{ backgroundColor: "var(--color-bg-secondary, #f5f5f5)" }}
        >
          {/* Preview / Code area (shrinks when inspect panel is open) */}
          <div className="flex-1 relative">
          {currentCode ? (
            <>
              {/* Global Sandpack styles */}
              <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500&display=swap');
                .sp-overlay { display: none !important; }
                .sp-wrapper { height: 100% !important; }
                .sp-layout { height: 100% !important; border: none !important; background: transparent !important; }
                .sp-stack { height: 100% !important; }
                .sp-file-explorer { border-right: none !important; }
                .sp-code-editor { height: 100% !important; }
                .sp-code-editor .cm-editor { font-family: 'Roboto Mono', monospace !important; font-size: 11px !important; }
                .sp-code-editor .cm-gutters { font-family: 'Roboto Mono', monospace !important; font-size: 12px !important; background: var(--color-bg, #fff) !important; border-right: none !important; }
                .sp-code-editor .cm-lineNumbers .cm-gutterElement { color: var(--color-text-tertiary, #999) !important; padding: 0 12px 0 8px !important; min-width: 32px !important; }
                .sp-code-editor .cm-lineNumbers { font-size: 11px !important; }
                .sp-file-explorer { font-family: 'Inter', system-ui, sans-serif !important; font-size: 11px !important; }
                .sp-file-explorer button { padding-top: 4px; padding-bottom: 4px; border-radius: 5px}
                .sp-file-explorer button:hover { background-color: var(--color-bg-secondary, #f5f5f5) !important; }
              `}</style>
              {/* ═══ Preview view — OUTSIDE SandpackProvider so sandpackKey changes don't destroy the iframe ═══ */}
              <div
                className="absolute inset-0 flex items-start justify-center overflow-auto"
                style={{
                  display: rightPanelView === "preview" ? "flex" : "none",
                  padding: showDeviceBar && (viewportWidth || viewportHeight) ? "16px 24px" : undefined,
                }}
              >
                {/* Wrapper for viewport + external handles */}
                <div style={{
                  position: "relative",
                  flexShrink: showDeviceBar ? 0 : undefined,
                  width: showDeviceBar ? undefined : "100%",
                  height: showDeviceBar ? undefined : "100%",
                }}>
                  <div
                    ref={viewportContainerRef}
                    className="overflow-hidden"
                    style={{
                      backgroundColor: "#fff",
                      borderRadius: showDeviceBar ? 8 : undefined,
                      width: viewportWidth ? `${viewportWidth}px` : "100%",
                      maxWidth: viewportWidth ? `${viewportWidth}px` : "100%",
                      height: viewportHeight ? `${viewportHeight}px` : "100%",
                      maxHeight: showDeviceBar && (viewportWidth || viewportHeight) ? undefined : "100%",
                      pointerEvents: isResizing || isViewportResizing ? "none" : "auto",
                    }}
                  >
                    {/* Single same-origin preview — inspect overlays toggled via `active` prop.
                         Using one iframe for both normal preview and inspect avoids state loss on toggle. */}
                    <SameOriginInspectPreview
                      ref={inspectPreviewRef}
                      code={instrumentedCode}
                      extraDeps={validatedDeps}
                      active={inspectMode}
                      onSelect={handleInspectorSelect}
                      onDelete={handleInspectorDelete}
                      onMove={handleInspectorMove}
                      selectedNodeId={inspectorSelection?.nodeId ?? null}
                      onError={handleAutoFix}
                    />
                  </div>

                  {/* Resize handles — outside the viewport, only when device bar is visible */}
                  {showDeviceBar && (
                    <>
                      {/* Right handle */}
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          right: -24,
                          width: 16,
                          height: "100%",
                          cursor: "col-resize",
                          zIndex: 20,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        onMouseDown={(e) => handleViewportResizeMouseDown(e, "right")}
                      >
                        <div style={{
                          width: 6,
                          height: 64,
                          borderRadius: 3,
                          backgroundColor: isViewportResizing ? "var(--color-bg-brand)" : "var(--color-border)",
                          transition: "background-color 0.15s",
                        }} />
                      </div>
                      {/* Left handle */}
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          left: -24,
                          width: 16,
                          height: "100%",
                          cursor: "col-resize",
                          zIndex: 20,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        onMouseDown={(e) => handleViewportResizeMouseDown(e, "left")}
                      >
                        <div style={{
                          width: 6,
                          height: 64,
                          borderRadius: 3,
                          backgroundColor: isViewportResizing ? "var(--color-bg-brand)" : "var(--color-border)",
                          transition: "background-color 0.15s",
                        }} />
                      </div>
                      {/* Bottom handle */}
                      <div
                        style={{
                          position: "absolute",
                          bottom: -24,
                          left: 0,
                          height: 16,
                          width: "100%",
                          cursor: "row-resize",
                          zIndex: 20,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        onMouseDown={(e) => handleViewportResizeMouseDown(e, "bottom")}
                      >
                        <div style={{
                          height: 6,
                          width: 64,
                          borderRadius: 3,
                          backgroundColor: isViewportResizing ? "var(--color-bg-brand)" : "var(--color-border)",
                          transition: "background-color 0.15s",
                        }} />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ═══ Sandpack — used only for code editor, file explorer, error detection ═══ */}
              <SandpackProvider
                key={`${makeEditor.objectId}-${sandpackKey}`}
                template="react"
                files={{
                  "/App.js": currentCode,
                  "/public/index.html": { code: SANDPACK_HTML_TEMPLATE, hidden: true, readOnly: true },
                  "/src/App.js": { code: SANDPACK_APP_WRAPPER, hidden: true },
                  "/src/make-inspector.js": { code: MAKE_INSPECTOR_SCRIPT, hidden: true },
                  "/styles.css": { code: SANDPACK_STYLES_OVERRIDE, hidden: true, readOnly: true },
                  "/src/styles.css": { code: SANDPACK_STYLES_OVERRIDE, hidden: true, readOnly: true },
                  "/freeze.css": { code: "/* active */", hidden: true },
                  ...SHADCN_FILES,
                }}
                customSetup={{
                  dependencies: { ...SHADCN_DEPENDENCIES, ...validatedDeps },
                }}
                options={{
                  recompileMode: "delayed",
                  recompileDelay: 500,
                  externalResources: [
                    "https://cdn.tailwindcss.com",
                  ],
                  activeFile: "/App.js",
                }}
                theme={{
                  font: {
                    mono: "'Roboto Mono', monospace",
                    size: "11px",
                    lineHeight: "1.6",
                  },
                }}
                style={{ height: "100%", width: "100%", display: rightPanelView === "code" ? "block" : "none" }}
              >
                <SandpackCodeUpdater code={currentCode} />
                <SandpackCodeListener
                  externalCode={currentCode}
                  onCodeChange={handleEditorCodeChange}
                />
                <SandpackErrorWatcher
                  onError={handleAutoFix}
                  enabled={!isLoading && autoFixCount < MAX_AUTO_FIX_RETRIES}
                />

                {/* Code view — file explorer + code editor */}
                {rightPanelView === "code" && (
                  <div className="absolute inset-0 flex">
                    <div
                      className="h-full overflow-y-auto flex-shrink-0"
                      style={{
                        width: `${explorerWidth}px`,
                        backgroundColor: "var(--color-bg, #fff)",
                      }}
                    >
                      <SandpackFileExplorer />
                    </div>
                    {/* Resize handle — wide hit area with thin visible line */}
                    <div
                      className="h-full flex-shrink-0 cursor-col-resize group relative"
                      style={{ width: "9px", marginLeft: "-4px", marginRight: "-4px", zIndex: 1 }}
                      onMouseDown={handleExplorerResizeMouseDown}
                    >
                      <div
                        className="absolute inset-y-0 left-1/2 -translate-x-1/2 transition-colors group-hover:bg-[color:var(--color-text-tertiary)]"
                        style={{ width: "1px", backgroundColor: "var(--color-border, #e5e5e5)" }}
                      />
                    </div>
                    <div className="flex-1 h-full overflow-auto" style={{ backgroundColor: "var(--color-bg, #fff)" }}>
                    <SandpackCodeEditor
                      showLineNumbers
                      showTabs={false}
                      style={{ height: "100%", width: "100%", fontSize: "11px", fontFamily: "'Roboto Mono', monospace" }}
                    />
                    </div>
                  </div>
                )}
              </SandpackProvider>
            </>
          ) : null}

          {/* Loading overlay — shown when AI is generating */}
          {effectiveLoading && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center"
              style={{
                backgroundColor: "var(--color-bg-secondary, #f5f5f5)",
              }}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
                <span
                  className="text-[12px] font-medium"
                  style={{ color: "var(--color-text-secondary, #999)" }}
                >
                  Generating…
                </span>
              </div>
            </div>
          )}
          </div>
          {/* ─── Inspector Properties Panel ─── */}
          {inspectMode && (
            <div
              className="h-full flex-shrink-0 border-l overflow-hidden"
              style={{
                width: "280px",
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg)",
              }}
            >
              <NodePropertiesPanel
                selection={inspectorSelection}
                jsxNode={selectedJsxNode}
                onPropChange={handleInspectorPropChange}
                onTextChange={handleInspectorTextChange}
                onDelete={handleInspectorDelete}
                onDeselect={handleInspectorDeselect}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

