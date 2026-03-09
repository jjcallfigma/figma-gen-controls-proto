"use client";

import React from "react";
import { FigmaLogo } from "./icons/figma-logo";
import SettingsMenu from "./SettingsMenu";
import { Button } from "./ui/button";

interface FigmaMenuProps {
  className?: string;
}

export default function FigmaMenu({ className }: FigmaMenuProps) {
  return (
    <div className={className}>
      <SettingsMenu>
        <Button
          variant="ghost"
          className="h-8 w-8 gap-0 data-[state=open]:bg-selected data-[state=open]:text-brand"
        >
          <FigmaLogo />
        </Button>
      </SettingsMenu>
    </div>
  );
}

