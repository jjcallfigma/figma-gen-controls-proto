import { CanvasObject } from "@/types/canvas";
import {
  syncComponentChangesDeep,
  syncStructuralChanges,
} from "../utils/componentSync";

/**
 * Holistic Component Sync Observer
 *
 * Observes ALL state changes and automatically propagates component changes
 * regardless of how the change was initiated (drag, resize, create, delete, etc.)
 */

export interface StateSnapshot {
  objects: Record<string, CanvasObject>;
  objectIds: string[];
}

export interface ComponentSyncObserver {
  beforeSnapshot: StateSnapshot | null;
  afterSnapshot: StateSnapshot | null;
  syncChangesToInstances: (
    beforeState: StateSnapshot,
    afterState: StateSnapshot
  ) => {
    updatedObjects: Record<string, CanvasObject>;
    newObjects: Record<string, CanvasObject>;
    deletedObjectIds: string[];
  };
}

/**
 * Creates a component sync observer that detects and propagates changes
 */
export function createComponentSyncObserver(): ComponentSyncObserver {
  let beforeSnapshot: StateSnapshot | null = null;
  let afterSnapshot: StateSnapshot | null = null;

  return {
    beforeSnapshot,
    afterSnapshot,

    syncChangesToInstances(
      beforeState: StateSnapshot,
      afterState: StateSnapshot
    ) {
      const result = {
        updatedObjects: {} as Record<string, CanvasObject>,
        newObjects: {} as Record<string, CanvasObject>,
        deletedObjectIds: [] as string[],
      };

      // Find all changes between before and after states
      const changes = detectAllChanges(beforeState, afterState);

      // Apply component sync for each type of change
      for (const change of changes) {
        switch (change.type) {
          case "object_updated": {
            const { objectId, propertyChanges } = change;
            const object = afterState.objects[objectId];

            // Should sync if object has componentId and is either:
            // 1. Part of main component (isMainComponent OR no instance flag)
            // 2. Not an instance object (to avoid syncing instance changes back to main)
            const shouldSync =
              object?.componentId && !object.isComponentInstance; // Sync main component objects (including nested), but not instance objects

            if (shouldSync && propertyChanges) {
              const syncResult = syncComponentChangesDeep(
                objectId,
                propertyChanges,
                afterState.objects
              );

              syncResult.changes.forEach(({ instanceId, objectUpdates }) => {
                objectUpdates.forEach(({ id, changes }) => {
                  // Merge multiple changes for the same object instead of overwriting
                  if (result.updatedObjects[id]) {
                    result.updatedObjects[id] = {
                      ...result.updatedObjects[id],
                      ...changes,
                    };
                  } else {
                    // Use beforeState to preserve original object properties, but exclude overrides
                    const { overrides, ...baseObjectWithoutOverrides } =
                      beforeState.objects[id];
                    result.updatedObjects[id] = {
                      ...baseObjectWithoutOverrides,
                      ...changes,
                    };
                  }
                });
              });
            }
            break;
          }

          case "object_created": {
            const { objectId, parentId } = change;
            const object = afterState.objects[objectId];
            const parent = parentId ? afterState.objects[parentId] : null;

            if (
              parent?.componentId &&
              !object?.isComponentInstance &&
              !parent.isComponentInstance
            ) {
              const isMainComponentOrChild =
                parent.isMainComponent ||
                Object.values(afterState.objects).some(
                  (obj) =>
                    obj.isMainComponent &&
                    obj.componentId === parent.componentId
                );

              if (isMainComponentOrChild && parentId) {
                const syncResult = syncStructuralChanges(
                  parentId,
                  "child_added",
                  objectId,
                  afterState.objects
                );

                // Collect sync results
                syncResult.changes.forEach(({ instanceId, objectUpdates }) => {
                  objectUpdates.forEach(({ id, changes }) => {
                    // Merge multiple changes for the same object instead of overwriting
                    if (result.updatedObjects[id]) {
                      result.updatedObjects[id] = {
                        ...result.updatedObjects[id],
                        ...changes,
                      };
                    } else {
                      result.updatedObjects[id] = {
                        ...afterState.objects[id],
                        ...changes,
                      };
                    }
                  });
                });

                if (syncResult.newObjects) {
                  Object.assign(result.newObjects, syncResult.newObjects);
                }
              }
            }
            break;
          }

          case "object_deleted": {
            const { objectId, parentId } = change;
            const parent = parentId ? beforeState.objects[parentId] : null;
            const deletedObject = beforeState.objects[objectId];

            if (
              parent?.componentId &&
              !deletedObject?.isComponentInstance &&
              !parent.isComponentInstance
            ) {
              const isMainComponentOrChild =
                parent.isMainComponent ||
                Object.values(beforeState.objects).some(
                  (obj) =>
                    obj.isMainComponent &&
                    obj.componentId === parent.componentId
                );

              if (isMainComponentOrChild && parentId) {
                const syncResult = syncStructuralChanges(
                  parentId,
                  "child_removed",
                  objectId,
                  beforeState.objects
                );

                // Collect sync results
                syncResult.changes.forEach(({ instanceId, objectUpdates }) => {
                  objectUpdates.forEach(({ id, changes }) => {
                    // Merge multiple changes for the same object instead of overwriting
                    if (result.updatedObjects[id]) {
                      result.updatedObjects[id] = {
                        ...result.updatedObjects[id],
                        ...changes,
                      };
                    } else {
                      result.updatedObjects[id] = {
                        ...afterState.objects[id],
                        ...changes,
                      };
                    }
                  });
                });

                if (syncResult.objectsToDelete) {
                  result.deletedObjectIds.push(...syncResult.objectsToDelete);
                }
              }
            }
            break;
          }

          case "object_reparented": {
            // Handle both removal from old parent and addition to new parent
            const { objectId, oldParentId, newParentId } = change;

            // Handle removal from old parent
            if (oldParentId) {
              const oldParent = beforeState.objects[oldParentId];
              const object = beforeState.objects[objectId];

              if (
                oldParent?.componentId &&
                !object?.isComponentInstance &&
                !oldParent.isComponentInstance
              ) {
                const isMainComponentOrChild =
                  oldParent.isMainComponent ||
                  Object.values(beforeState.objects).some(
                    (obj) =>
                      obj.isMainComponent &&
                      obj.componentId === oldParent.componentId
                  );

                if (isMainComponentOrChild) {
                  const syncResult = syncStructuralChanges(
                    oldParentId,
                    "child_removed",
                    objectId,
                    beforeState.objects
                  );

                  syncResult.changes.forEach(
                    ({ instanceId, objectUpdates }) => {
                      objectUpdates.forEach(({ id, changes }) => {
                        // Merge multiple changes for the same object instead of overwriting
                        if (result.updatedObjects[id]) {
                          result.updatedObjects[id] = {
                            ...result.updatedObjects[id],
                            ...changes,
                          };
                        } else {
                          result.updatedObjects[id] = {
                            ...afterState.objects[id],
                            ...changes,
                          };
                        }
                      });
                    }
                  );

                  if (syncResult.objectsToDelete) {
                    result.deletedObjectIds.push(...syncResult.objectsToDelete);
                  }
                }
              }
            }

            // Handle addition to new parent
            if (newParentId) {
              const newParent = afterState.objects[newParentId];
              const object = afterState.objects[objectId];

              if (
                newParent?.componentId &&
                !object?.isComponentInstance &&
                !newParent.isComponentInstance
              ) {
                const isMainComponentOrChild =
                  newParent.isMainComponent ||
                  Object.values(afterState.objects).some(
                    (obj) =>
                      obj.isMainComponent &&
                      obj.componentId === newParent.componentId
                  );

                if (isMainComponentOrChild) {
                  const syncResult = syncStructuralChanges(
                    newParentId,
                    "child_added",
                    objectId,
                    afterState.objects
                  );

                  syncResult.changes.forEach(
                    ({ instanceId, objectUpdates }) => {
                      objectUpdates.forEach(({ id, changes }) => {
                        // Merge multiple changes for the same object instead of overwriting
                        if (result.updatedObjects[id]) {
                          result.updatedObjects[id] = {
                            ...result.updatedObjects[id],
                            ...changes,
                          };
                        } else {
                          result.updatedObjects[id] = {
                            ...afterState.objects[id],
                            ...changes,
                          };
                        }
                      });
                    }
                  );

                  if (syncResult.newObjects) {
                    Object.assign(result.newObjects, syncResult.newObjects);
                  }
                }
              }
            }
            break;
          }

          case "object_reordered": {
            const { objectId, oldChildIds, newChildIds } = change;
            const object = afterState.objects[objectId];

            // Should sync if object has componentId and is part of main component
            const shouldSync =
              object?.componentId && !object.isComponentInstance;

            if (shouldSync) {
              const syncResult = syncStructuralChanges(
                objectId,
                "children_reordered",
                {
                  oldChildIds: oldChildIds || [],
                  newChildIds: newChildIds || [],
                },
                afterState.objects
              );

              syncResult.changes.forEach(({ instanceId, objectUpdates }) => {
                objectUpdates.forEach(({ id, changes }) => {
                  // Merge multiple changes for the same object instead of overwriting
                  if (result.updatedObjects[id]) {
                    result.updatedObjects[id] = {
                      ...result.updatedObjects[id],
                      ...changes,
                    };
                  } else {
                    result.updatedObjects[id] = {
                      ...afterState.objects[id],
                      ...changes,
                    };
                  }
                });
              });
            }
            break;
          }
        }
      }

      return result;
    },
  };
}

/**
 * Detect all changes between two state snapshots
 */
function detectAllChanges(
  beforeState: StateSnapshot,
  afterState: StateSnapshot
) {
  const changes: Array<{
    type:
      | "object_updated"
      | "object_created"
      | "object_deleted"
      | "object_reparented"
      | "object_reordered";
    objectId: string;
    parentId?: string;
    oldParentId?: string;
    newParentId?: string;
    propertyChanges?: Partial<CanvasObject>;
    oldChildIds?: string[];
    newChildIds?: string[];
  }> = [];

  // Find created objects
  for (const objectId of afterState.objectIds) {
    if (!beforeState.objects[objectId]) {
      const object = afterState.objects[objectId];
      changes.push({
        type: "object_created",
        objectId,
        parentId: object.parentId,
      });
    }
  }

  // Find deleted objects
  for (const objectId of beforeState.objectIds) {
    if (!afterState.objects[objectId]) {
      const object = beforeState.objects[objectId];
      changes.push({
        type: "object_deleted",
        objectId,
        parentId: object.parentId,
      });
    }
  }

  // Find updated objects and reparented objects
  for (const objectId of afterState.objectIds) {
    const beforeObject = beforeState.objects[objectId];
    const afterObject = afterState.objects[objectId];

    if (beforeObject && afterObject) {
      // Check for child ID changes (removed excessive logging)
      if (beforeObject.childIds && afterObject.childIds) {
        const childIdsChanged = !deepEqual(
          beforeObject.childIds,
          afterObject.childIds
        );
      }
      // Check for reparenting
      if (beforeObject.parentId !== afterObject.parentId) {
        changes.push({
          type: "object_reparented",
          objectId,
          oldParentId: beforeObject.parentId,
          newParentId: afterObject.parentId,
        });
      }

      // Check for property changes (excluding parentId since that's handled as reparenting)
      const propertyChanges: Partial<CanvasObject> = {};
      let hasChanges = false;

      for (const key in afterObject) {
        if (key === "parentId") continue; // Skip parentId changes (handled as reparenting)

        // Skip component-specific metadata fields that should not trigger sync
        if (
          key === "overrides" ||
          key === "originalId" ||
          key === "isComponentInstance" ||
          key === "isMainComponent"
        ) {
          continue;
        }

        const beforeValue = (beforeObject as any)[key];
        const afterValue = (afterObject as any)[key];

        // Removed: Auto layout sizing property debugging that ran on every change

        if (!deepEqual(beforeValue, afterValue)) {
          // Special handling for childIds - detect as reordering rather than property change
          if (
            key === "childIds" &&
            Array.isArray(beforeValue) &&
            Array.isArray(afterValue)
          ) {
            // Check if this is reordering (same children, different order) vs add/remove
            const beforeSet = new Set(beforeValue);
            const afterSet = new Set(afterValue);
            const sameChildren =
              beforeSet.size === afterSet.size &&
              [...beforeSet].every((id) => afterSet.has(id));

            if (sameChildren && beforeValue.length === afterValue.length) {
              // This is reordering - add as separate change type
              changes.push({
                type: "object_reordered",
                objectId,
                oldChildIds: beforeValue,
                newChildIds: afterValue,
              });
              continue; // Don't add to propertyChanges
            }
          }

          (propertyChanges as any)[key] = afterValue;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        changes.push({
          type: "object_updated",
          objectId,
          propertyChanges,
        });
      }
    }
  }

  return changes;
}

/**
 * Deep equality check for property comparison
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === "object") {
    if (Array.isArray(a) !== Array.isArray(b)) return false;

    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    } else {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;

      for (const key of keysA) {
        if (!keysB.includes(key)) return false;
        if (!deepEqual(a[key], b[key])) return false;
      }
      return true;
    }
  }

  // For primitives (string, number, boolean), a === b check above already handled equality
  // If we reach here, they are different primitives
  return false;
}
