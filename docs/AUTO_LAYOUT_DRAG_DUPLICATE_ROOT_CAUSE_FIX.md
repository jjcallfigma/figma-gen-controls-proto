# Auto Layout Drag Duplicate - Root Cause Fix

This document details the **real fix** for the duplicate rendering bug that occurred when dragging auto layout children outside their parent frames.

## 🐛 **Root Cause Analysis**

### **The Real Problem:**

The issue wasn't just about rendering logic - it was a **state management problem**. Here's what was actually happening:

1. **Object starts as auto layout child** → Gets tracked in `draggedAutoLayoutChildren`
2. **Live reparenting occurs** → Object's `parentId` changes, `childIds` arrays updated correctly
3. **BUT `draggedAutoLayoutChildren` never gets cleaned up** → Still contains stale tracking info
4. **Result:** Object renders **twice**:
   - **Once** in the new parent via normal `childIds` rendering
   - **Once** in the old parent via `draggedAutoLayoutChildren` rendering

### **Why DOM Had Same `object-id`:**

Both renders used the same `CanvasObject` component with the same `object.id`, creating **two DOM elements with identical `data-object-id` attributes**.

## 🔍 **Technical Deep Dive**

### **State Flow Problem:**

```typescript
// 1. Object starts in AL parent
draggedAutoLayoutChildren = {
  "child-123": { parentId: "parent-A", originalIndex: 0 },
};

// 2. Live reparenting happens
object.parentId = "parent-B"; // ✅ Object state updated
parentA.childIds = []; // ✅ Old parent cleaned up
parentB.childIds = ["child-123"]; // ✅ New parent updated

// 3. BUT draggedAutoLayoutChildren NEVER gets updated!
draggedAutoLayoutChildren = {
  "child-123": { parentId: "parent-A", originalIndex: 0 }, // ❌ STALE!
};
```

### **Rendering Logic Analysis:**

**Parent A (old parent):**

```typescript
// Renders draggedAutoLayoutChildren
Object.entries(draggedAutoLayoutChildren)
  .filter(([id, info]) => info.parentId === "parent-A") // ✅ true
  .map(([id]) => <CanvasObject key={`${id}-dragged`} object={child} />);
// Result: Renders duplicate with absolute positioning
```

**Parent B (new parent):**

```typescript
// Renders normal children
const nonDraggedChildren = object.childIds.filter(
  (id) => !(id in draggedAutoLayoutChildren) // ❌ "child-123" IS in draggedAutoLayoutChildren
);
// BUT for Parent B, draggedAutoLayoutChildren doesn't apply to this parent
// So "child-123" gets rendered normally via childIds
```

**Result:** Object renders in BOTH parents!

## ✅ **The Fix**

### **Core Solution:**

**Clean up `draggedAutoLayoutChildren` during live reparenting** - remove objects when they get reparented to different parents.

### **Implementation:**

```typescript
// In handleLiveReparenting callback
const currentParentForCleanup = currentParents[objectId] ?? object.parentId;
if (
  currentParentForCleanup !== newParentId &&
  draggedAutoLayoutChildren[objectId]
) {
  console.log("🔧 CLEANING UP DRAGGED AL CHILD on reparent:", {
    objectId,
    oldParent: currentParentForCleanup,
    newParent: newParentId,
    wasInDraggedAutoLayoutChildren: !!draggedAutoLayoutChildren[objectId],
  });

  setDraggedAutoLayoutChildren((prev) => {
    const updated = { ...prev };
    delete updated[objectId];
    return updated;
  });
}
```

### **Defense in Depth:**

I also kept the secondary fix in `CanvasObject.tsx` as an additional safety check:

```typescript
// Only render absolutely positioned duplicate if object hasn't been reparented
const isStillInOriginalParent = draggedObject?.parentId === object.id;
return isOriginalParent && isStillInOriginalParent;
```

## 🎯 **Fix Logic**

### **Before Fix:**

1. Object reparented: `parentId` changes ✅
2. `childIds` arrays updated ✅
3. `draggedAutoLayoutChildren` unchanged ❌
4. **Result:** Dual rendering

### **After Fix:**

1. Object reparented: `parentId` changes ✅
2. `childIds` arrays updated ✅
3. **`draggedAutoLayoutChildren` cleaned up** ✅
4. **Result:** Single rendering in new parent only

## 🧪 **Test Scenarios**

### **Scenario 1: AL child to different AL parent**

- ✅ Object removed from `draggedAutoLayoutChildren` on reparent
- ✅ No duplicate rendering
- ✅ Single object in new parent with placeholders

### **Scenario 2: AL child to canvas (no parent)**

- ✅ Object removed from `draggedAutoLayoutChildren`
- ✅ No duplicate rendering
- ✅ Single top-level object

### **Scenario 3: AL child to regular frame**

- ✅ Object removed from `draggedAutoLayoutChildren`
- ✅ No duplicate rendering
- ✅ Single object in regular frame

### **Scenario 4: AL child stays in same parent (reordering)**

- ✅ Object stays in `draggedAutoLayoutChildren`
- ✅ Correctly renders absolutely positioned for reordering
- ✅ No duplicate rendering

## 📋 **Files Modified**

### **Primary Fix:**

- `figma-clone/src/core/hooks/useCanvasDrag.ts` - Lines 2019-2035
  - Added cleanup logic in `handleLiveReparenting`
  - Updated dependency array to include `draggedAutoLayoutChildren` and `setDraggedAutoLayoutChildren`

### **Secondary Fix (Defense in Depth):**

- `figma-clone/src/components/canvas/CanvasObject.tsx` - Lines 1155-1162
  - Added additional check for reparented objects
  - Prevents rendering if object no longer in original parent

## 🎉 **Result**

### **Before Fix:**

- Confusing duplicate objects during drag
- DOM with duplicate `data-object-id` attributes
- Poor user experience with offset duplicates

### **After Fix:**

- ✅ **Clean single object rendering** throughout drag
- ✅ **No DOM duplication**
- ✅ **Immediate visual feedback** on reparenting
- ✅ **Professional drag experience** matching design tool standards
- ✅ **Proper state cleanup** maintaining system integrity

## 🔧 **Debug Output**

With the fix, you'll see console logs like:

```
🔧 CLEANING UP DRAGGED AL CHILD on reparent: {
  objectId: "child-123",
  oldParent: "parent-A",
  newParent: "parent-B",
  wasInDraggedAutoLayoutChildren: true
}
```

This confirms the state cleanup is working correctly and objects are no longer tracked as `draggedAutoLayoutChildren` after reparenting.

## 🚀 **Why This Fix is Robust**

1. **Addresses root cause** - State management issue, not just rendering
2. **Defense in depth** - Multiple layers of protection
3. **Maintains functionality** - Preserves all drag behaviors for same-parent operations
4. **Clean state management** - No stale tracking information
5. **Performance optimized** - Eliminates unnecessary duplicate renders

The auto layout drag system now maintains clean, consistent state throughout all drag operations while providing the smooth, professional user experience expected from a modern design tool.
