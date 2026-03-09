"use client";

import { useAppStore } from "@/core/state/store";
import { CanvasObject, MakeChatMessage, MakeProperties } from "@/types/canvas";
import { nanoid } from "nanoid";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface MakeVersionPanelProps {
  object: CanvasObject;
}

export default function MakeVersionPanel({ object }: MakeVersionPanelProps) {
  const dispatch = useAppStore((state) => state.dispatch);
  const props = object.properties as MakeProperties;
  const versions = props.versions ?? [];
  const currentIndex = props.currentVersionIndex ?? versions.length - 1;

  if (versions.length === 0) return null;

  const handleVersionChange = (value: string) => {
    const index = parseInt(value, 10);
    if (isNaN(index) || index === currentIndex) return;

    const version = versions[index];
    if (!version) return;

    const freshObj = useAppStore.getState().objects[object.id];
    if (!freshObj || freshObj.properties.type !== "make") return;
    const freshProps = freshObj.properties as MakeProperties;

    const restoreNote: MakeChatMessage = {
      id: nanoid(),
      role: "assistant",
      content: `Restored to Version ${index + 1}`,
      timestamp: Date.now(),
    };

    dispatch({
      type: "object.updated",
      payload: {
        id: object.id,
        changes: {
          properties: {
            ...freshProps,
            code: version.code,
            chatHistory: [...freshProps.chatHistory, restoreNote],
            currentVersionIndex: index,
          },
        },
        previousValues: { properties: freshProps },
      },
    });
  };

  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max) + "..." : text;

  const selectedVersion = versions[currentIndex];

  return (
    <div className="flex flex-col gap-1 w-full pr-6">
      <div className="w-full grid grid-cols-[1fr_1fr] gap-2 items-center">
        <span className="text-[11px] text-secondary">Version</span>
        <Select
          value={String(currentIndex)}
          onValueChange={handleVersionChange}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={`Version ${currentIndex + 1}`} />
          </SelectTrigger>
          <SelectContent position="item-aligned">
            {versions.map((v, i) => (
              <SelectItem key={v.id} value={String(i)}>
                Version {i + 1}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selectedVersion && (
        <div className="text-[11px] leading-tight py-1 w-full">
          {truncate(selectedVersion.prompt, 50)}
        </div>
      )}
    </div>
  );
}
