# Figma Clone - Non-Negotiable Constraints

## Core Requirements (DO NOT CHANGE)

### Selection System

- **Selection changes MUST be undoable** - This is a hard requirement
- Selection state changes must be saved to undo/redo history
- Never suppress or skip selection events from history

### Live Reparenting

- **Reparenting MUST be live during drag** - Visual feedback is critical
- Objects must visually change parents as you drag over frames
- This is essential for UX and cannot be deferred to drop time
- Real-time coordinate conversion is required

### Event Sourcing

- All state changes must go through events
- Undo/redo must work for all user actions (except zoom and pan)
- State must always be traceable

### Performance

- 60fps during drag operations is non-negotiable
- Smooth visual feedback always

## Current Issues to Solve

### The Intermediary State Problem

- **Problem**: After drag-and-reparent, undo lands object in new parent but with wrong coordinates
- **Root Cause**: Live reparenting events mutate objects that exist in saved history snapshots
- **Constraint**: Must solve this WITHOUT removing live reparenting or making selection non-undoable

### What NOT to Try Again

1. ❌ Removing live reparenting
2. ❌ Making selection changes non-undoable
3. ❌ Deferring all reparenting to drop time
4. ❌ Suppressing selection from history

## Architecture Notes

- DOM-based approach with CSS transforms
- Dual coordinate system (world space + screen space)
- Zustand store with Immer for immutability
- Custom hooks for modular drag/selection logic