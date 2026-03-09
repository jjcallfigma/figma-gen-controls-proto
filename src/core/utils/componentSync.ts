import { CanvasObject, ComponentOverrides } from "@/types/canvas";
import { nanoid } from "nanoid";

/**
 * Utility functions for synchronizing component changes to instances
 */

export interface ComponentSyncResult {
  affectedInstanceIds: string[];
  changes: Array<{
    instanceId: string;
    objectUpdates: Array<{
      id: string;
      changes: Partial<CanvasObject>;
      previousValues: Partial<CanvasObject>;
    }>;
  }>;
  newObjects?: Record<string, CanvasObject>; // For structural changes (adding objects)
  objectsToDelete?: string[]; // For structural changes (removing objects)
}

/**
 * Determines if a property can be overridden in instances
 * Some properties should always sync from the main component
 */
export function canPropertyBeOverridden(
  propertyPath: string,
  isTopLevelInstance: boolean = false
): boolean {
  const restrictedProperties = [
    "type",
    "componentId",
    "isMainComponent",
    "isComponentInstance",
    "createdAt",
    "id",
    "parentId",
    "childIds",
    // Auto Layout properties typically shouldn't be overridden
    // TEMPORARILY DISABLED - Testing sync mechanism without restrictions
    // "properties.autoLayout.mode",
    // "properties.autoLayout.direction",
    // "properties.autoLayout.gap",
    // "properties.autoLayout.padding",
    // "properties.autoLayout.alignItems",
    // "properties.autoLayout.justifyContent",

    // autoLayoutOrder should always sync from main to instances (not overridable)
    "autoLayoutOrder",
  ];

  // Position and size are always overridable for top-level instances
  if (isTopLevelInstance) {
    const instanceOverridableProperties = ["x", "y", "width", "height"];
    if (instanceOverridableProperties.includes(propertyPath)) {
      return true; // Always allow position and size overrides for top-level instances
    }
  }

  return !restrictedProperties.includes(propertyPath);
}

/**
 * Gets the effective value for a property, considering component overrides
 */
export function getEffectivePropertyValue(
  mainComponentValue: any,
  overrides: ComponentOverrides,
  instanceId: string,
  propertyPath: string
): any {
  // Check if this property has an override for this instance
  const instanceOverrides = overrides[instanceId];
  if (instanceOverrides && instanceOverrides[propertyPath] !== undefined) {
    return instanceOverrides[propertyPath];
  }

  // Use the main component value
  return mainComponentValue;
}

/**
 * Checks if a property has been manually overridden in an instance
 */
export function hasPropertyOverride(
  overrides: ComponentOverrides,
  objectId: string,
  propertyPath: string
): boolean {
  const objectOverrides = overrides[objectId];
  return objectOverrides && objectOverrides[propertyPath] !== undefined;
}

/**
 * Sets a property override for an instance
 * This marks the property as manually overridden and prevents sync from main component
 */
export function setPropertyOverride(
  overrides: ComponentOverrides,
  objectId: string,
  propertyPath: string,
  value: any
): ComponentOverrides {
  const newOverrides = { ...overrides };

  if (!newOverrides[objectId]) {
    newOverrides[objectId] = {};
  }

  newOverrides[objectId] = {
    ...newOverrides[objectId],
    [propertyPath]: value,
  };

  return newOverrides;
}

/**
 * Removes a property override for an instance
 * This allows the property to sync from main component again
 */
export function removePropertyOverride(
  overrides: ComponentOverrides,
  objectId: string,
  propertyPath: string
): ComponentOverrides {
  const newOverrides = { ...overrides };

  if (newOverrides[objectId]) {
    const objectOverrides = { ...newOverrides[objectId] };
    delete objectOverrides[propertyPath];

    // If no more overrides for this object, remove the object entry
    if (Object.keys(objectOverrides).length === 0) {
      delete newOverrides[objectId];
    } else {
      newOverrides[objectId] = objectOverrides;
    }
  }

  return newOverrides;
}

/**
 * Synchronizes changes from a main component to all its instances
 * Now supports deep synchronization of nested children within components
 */
export function syncComponentToInstances(
  componentId: string,
  mainComponentChanges: Partial<CanvasObject>,
  instances: CanvasObject[],
  allObjects: Record<string, CanvasObject>
): ComponentSyncResult {
  const result: ComponentSyncResult = {
    affectedInstanceIds: [],
    changes: [],
  };

  if (instances.length === 0) {
    return result;
  }

  for (const instance of instances) {
    if (!instance.isComponentInstance || instance.componentId !== componentId) {
      continue;
    }

    const instanceChanges: Array<{
      id: string;
      changes: Partial<CanvasObject>;
      previousValues: Partial<CanvasObject>;
    }> = [];

    // Apply changes from main component, respecting overrides
    console.log("🔍 MAIN COMPONENT CHANGES TO SYNC:", {
      instanceId: instance.id,
      mainComponentChanges: Object.keys(mainComponentChanges),
      hasChildIds: mainComponentChanges.hasOwnProperty("childIds"),
      allChanges: mainComponentChanges,
    });

    Object.entries(mainComponentChanges).forEach(([propertyPath, newValue]) => {
      // Skip restricted properties like childIds - they're handled by structural sync
      if (propertyPath === "childIds") {
        console.log("🚨 SKIPPING CHILDIDS PROPERTY SYNC:", {
          propertyPath,
          instanceId: instance.id,
          reason: "childIds managed by structural sync only",
          attemptedValue: newValue,
        });
        return;
      }

      if (!canPropertyBeOverridden(propertyPath)) {
        // Property cannot be overridden, always sync from main component
        const currentValue = getNestedProperty(instance, propertyPath);
        if (currentValue !== newValue) {
          instanceChanges.push({
            id: instance.id,
            changes: { [propertyPath]: newValue },
            previousValues: { [propertyPath]: currentValue },
          });
        }
      } else {
        // Property can be overridden, only sync if not overridden
        const effectiveValue = getEffectivePropertyValue(
          newValue,
          instance.overrides || {},
          instance.id,
          propertyPath
        );

        const currentValue = getNestedProperty(instance, propertyPath);
        if (currentValue !== effectiveValue) {
          instanceChanges.push({
            id: instance.id,
            changes: { [propertyPath]: effectiveValue },
            previousValues: { [propertyPath]: currentValue },
          });
        }
      }
    });

    if (instanceChanges.length > 0) {
      result.affectedInstanceIds.push(instance.id);
      result.changes.push({
        instanceId: instance.id,
        objectUpdates: instanceChanges,
      });
    }
  }

  return result;
}

/**
 * Enhanced sync function that handles deep synchronization
 * Synchronizes changes to any object within a component to all corresponding objects in instances
 */
export function syncComponentChangesDeep(
  changedObjectId: string,
  changes: Partial<CanvasObject>,
  allObjects: Record<string, CanvasObject>
): ComponentSyncResult {
  console.log("🔄 syncComponentChangesDeep called:", {
    changedObjectId,
    propertyChanges: Object.keys(changes),
    propertyValues: changes,
    changedObjectInfo: {
      isMainComponent: allObjects[changedObjectId]?.isMainComponent,
      isComponentInstance: allObjects[changedObjectId]?.isComponentInstance,
      componentId: allObjects[changedObjectId]?.componentId,
      parentId: allObjects[changedObjectId]?.parentId,
    },
  });

  // Special debugging for auto layout properties
  if (changes.properties && (changes.properties as any)?.autoLayout) {
    console.log("🎯 AUTO LAYOUT CHANGE DETECTED:", {
      changedObjectId,
      autoLayoutChanges: (changes.properties as any).autoLayout,
      isMainComponent: allObjects[changedObjectId]?.isMainComponent,
      componentId: allObjects[changedObjectId]?.componentId,
    });
  }

  const result: ComponentSyncResult = {
    affectedInstanceIds: [],
    changes: [],
  };

  const changedObject = allObjects[changedObjectId];
  if (!changedObject?.componentId) {
    return result; // Object is not part of a component
  }

  const componentId = changedObject.componentId;

  // Find the main component object (could be the changed object itself or an ancestor)
  const mainComponent = Object.values(allObjects).find(
    (obj) => obj.componentId === componentId && obj.isMainComponent
  );

  if (!mainComponent) {
    return result; // No main component found
  }

  // Find all instances of this component
  const allComponentObjects = Object.values(allObjects).filter(
    (obj) => obj.componentId === componentId
  );

  const instances = Object.values(allObjects).filter(
    (obj) => obj.isComponentInstance && obj.componentId === componentId
  );

  console.log("🔍 Found instances for component sync:", {
    componentId,
    instanceCount: instances.length,
    instanceIds: instances.map((i) => i.id),
  });

  if (instances.length === 0) {
    return result; // No instances to sync
  }

  // Calculate the path from main component to the changed object
  const pathFromMain = getPathFromAncestor(
    changedObjectId,
    mainComponent.id,
    allObjects
  );

  if (!pathFromMain) {
    console.log("❌ PATH FROM MAIN FAILED:", {
      changedObjectId,
      mainComponentId: mainComponent.id,
      reason: "Changed object is not within the main component",
    });
    return result; // Changed object is not within the main component
  }

  console.log("🔄 Deep syncing component changes:", {
    componentId,
    changedObjectId,
    pathFromMain,
    instanceCount: instances.length,
    changes: Object.keys(changes),
  });

  // For each instance, find the corresponding object and apply changes
  for (const instance of instances) {
    console.log(
      `🔄 Processing instance ${instance.id} of ${instances.length} total instances`
    );

    // Find the corresponding object in this instance using ID-based mapping
    const correspondingObjectId = findCorrespondingObjectById(
      changedObjectId,
      instance.id,
      allObjects
    );

    if (!correspondingObjectId) {
      console.warn(
        `Could not find corresponding object in instance ${instance.id} for original object ${changedObjectId}`
      );
      continue;
    }

    const correspondingObject = allObjects[correspondingObjectId];
    console.log(
      `✅ Found corresponding object ${correspondingObjectId} in instance ${instance.id}`,
      {
        originalObjectId: changedObjectId,
        correspondingObjectId,
        instanceId: instance.id,
        correspondingObjectExists: !!correspondingObject,
        correspondingObjectType: correspondingObject?.type,
        isNested: changedObjectId !== instance.id,
      }
    );
    if (!correspondingObject) {
      continue;
    }

    // CRITICAL FIX: Convert proxy objects to plain objects to avoid proxy corruption
    // Zustand/Immer creates proxy objects that get revoked after state updates
    const plainCorrespondingObject = JSON.parse(
      JSON.stringify(correspondingObject)
    );
    console.log(`🔧 CONVERTED PROXY TO PLAIN OBJECT:`, {
      correspondingObjectId,
      originalWasProxy: correspondingObject.constructor?.name,
      plainObjectType: typeof plainCorrespondingObject,
      plainAutoLayout:
        plainCorrespondingObject.properties?.type === "frame"
          ? plainCorrespondingObject.properties?.autoLayout
          : "not-a-frame",
    });

    // Accumulate all changes for this object into single objects
    const accumulatedChanges: Partial<CanvasObject> = {};
    const accumulatedPreviousValues: Partial<CanvasObject> = {};

    // Check if this is the top-level instance object
    const isTopLevelInstance = correspondingObjectId === instance.id;

    // Debug the instance object state before sync
    // Also check if properties are proxies (which can cause issues)
    const isPropertiesProxy =
      correspondingObject.properties &&
      correspondingObject.properties.constructor.name === "Object" &&
      typeof correspondingObject.properties === "object";

    console.log(`🔍 INSTANCE OBJECT BEFORE SYNC:`, {
      correspondingObjectId,
      instanceId: instance.id,
      objectType: plainCorrespondingObject.type,
      objectProperties: plainCorrespondingObject.properties,
      objectAutoLayout:
        plainCorrespondingObject.properties?.type === "frame"
          ? (plainCorrespondingObject.properties as any)?.autoLayout
          : "not-a-frame",
      propertiesIsProxy: !isPropertiesProxy,
      propertiesType: typeof plainCorrespondingObject.properties,
      propertiesConstructor:
        plainCorrespondingObject.properties?.constructor?.name,
    });

    // Apply changes, respecting overrides
    // Break down complex property changes into granular paths for better override handling
    const granularChanges = expandPropertyChanges(changes);

    console.log(
      `🔧 Expanded ${Object.keys(changes).length} changes into ${
        granularChanges.length
      } granular changes:`,
      {
        originalChanges: Object.keys(changes),
        granularPaths: granularChanges.map((c) => c.propertyPath),
        correspondingObjectId,
      }
    );

    granularChanges.forEach(({ propertyPath, newValue }) => {
      // CRITICAL: Skip childIds - they're managed exclusively by structural sync
      if (propertyPath === "childIds") {
        console.log("🚨 SKIPPING CHILDIDS IN DEEP SYNC:", {
          propertyPath,
          correspondingObjectId,
          reason: "childIds managed by structural sync only",
          attemptedValue: newValue,
        });
        return;
      }

      console.log(
        `🔄 Processing property: ${propertyPath} = ${JSON.stringify(
          newValue
        )} for object ${correspondingObjectId} (isTopLevel: ${isTopLevelInstance})`
      );

      // Debug all property paths for instance frames
      if (plainCorrespondingObject.isComponentInstance) {
        console.log(`🔍 INSTANCE PROPERTY DEBUG:`, {
          propertyPath,
          correspondingObjectId,
          newValue,
          isInstanceFrame: plainCorrespondingObject.isComponentInstance,
          isAutoLayoutProperty: propertyPath.includes("autoLayout"),
        });
      }

      // Special debugging for autoLayoutSizing
      if (propertyPath === "autoLayoutSizing") {
        console.log(`🎯 AUTO LAYOUT SIZING DEBUG:`, {
          propertyPath,
          newValue,
          correspondingObjectId,
          canBeOverridden: canPropertyBeOverridden(
            propertyPath,
            isTopLevelInstance
          ),
          isTopLevelInstance,
          originalObjectId: changedObjectId,
        });
      }

      // Special debugging for auto layout property changes
      if (propertyPath.includes("autoLayout")) {
        const existingAutoLayout = getNestedProperty(
          plainCorrespondingObject,
          "properties.autoLayout"
        );
        console.log(`🎯 AUTO LAYOUT PROPERTY SYNC DEBUG:`, {
          propertyPath,
          newValue,
          correspondingObjectId,
          existingAutoLayout,
          existingMode: existingAutoLayout?.mode,
          willOverwrite:
            propertyPath.includes("autoLayout") && typeof newValue === "object",
          canBeOverridden: canPropertyBeOverridden(
            propertyPath,
            isTopLevelInstance
          ),
          isTopLevelInstance,
          originalObjectId: changedObjectId,
        });
      }

      // Special case: Never sync position for top-level instances, but allow size
      if (isTopLevelInstance) {
        const positionOnlyProperties = ["x", "y"];
        if (positionOnlyProperties.includes(propertyPath)) {
          console.log(
            `📍 Skipping position sync for top-level instance: ${propertyPath}`
          );
          return; // Skip position properties for top-level instances
        }
      }

      const canBeOverridden = canPropertyBeOverridden(
        propertyPath,
        isTopLevelInstance
      );

      console.log(`🔍 PROPERTY OVERRIDE CHECK:`, {
        propertyPath,
        canBeOverridden,
        isTopLevelInstance,
        willTakeRestrictedPath: !canBeOverridden,
        willTakeOverridablePath: canBeOverridden,
      });

      if (!canBeOverridden) {
        // Property cannot be overridden, always sync
        const currentValue = getNestedProperty(
          plainCorrespondingObject,
          propertyPath
        );
        if (currentValue !== newValue) {
          // Debug instance detection for auto layout properties
          if (propertyPath.startsWith("properties.autoLayout.")) {
            console.log(`🔍 AUTO LAYOUT INSTANCE DETECTION:`, {
              propertyPath,
              correspondingObjectId,
              hasPropertiesType: !!plainCorrespondingObject.properties?.type,
              propertiesType: plainCorrespondingObject.properties?.type,
              isComponentInstance: plainCorrespondingObject.isComponentInstance,
              hasDirectAutoLayout: !!(plainCorrespondingObject as any)
                .autoLayout,
              directAutoLayoutMode: (plainCorrespondingObject as any).autoLayout
                ?.mode,
              propertiesAutoLayoutMode:
                plainCorrespondingObject.properties?.autoLayout?.mode,
              willRemapToInstance: plainCorrespondingObject.isComponentInstance,
            });
          }

          // Special handling for auto layout properties on instances
          // Instances store auto layout data in (obj as any).autoLayout, not properties.autoLayout
          if (
            propertyPath.startsWith("properties.autoLayout.") &&
            plainCorrespondingObject.isComponentInstance
          ) {
            // This is an instance - store auto layout data in direct autoLayout property
            const autoLayoutProperty = propertyPath.replace(
              "properties.autoLayout.",
              ""
            );
            const instancePropertyPath = `autoLayout.${autoLayoutProperty}`;

            console.log(`🔧 INSTANCE AUTO LAYOUT REMAP:`, {
              originalPath: propertyPath,
              instancePath: instancePropertyPath,
              newValue,
              correspondingObjectId,
              isInstanceFrame: !plainCorrespondingObject.properties?.type,
            });

            setNestedProperty(
              accumulatedChanges,
              instancePropertyPath,
              newValue
            );
            setNestedProperty(
              accumulatedPreviousValues,
              instancePropertyPath,
              getNestedProperty(plainCorrespondingObject, instancePropertyPath)
            );
          } else {
            // Normal property sync
            setNestedProperty(accumulatedChanges, propertyPath, newValue);
            setNestedProperty(
              accumulatedPreviousValues,
              propertyPath,
              currentValue
            );
          }

          console.log(`🔧 RESTRICTED PROPERTY SYNC:`, {
            propertyPath,
            fromValue: currentValue,
            toValue: newValue,
            correspondingObjectId,
            accumulatedChanges: { ...accumulatedChanges },
          });
        } else {
          console.log(`⚠️ RESTRICTED PROPERTY NO CHANGE:`, {
            propertyPath,
            currentValue,
            newValue,
            correspondingObjectId,
          });
        }
      } else {
        // Property can be overridden, only sync if not manually overridden
        const hasManualOverride = hasPropertyOverride(
          instance.overrides || {},
          correspondingObjectId,
          propertyPath
        );

        console.log(
          `🔍 Override check for ${propertyPath} on object ${correspondingObjectId}:`,
          {
            hasManualOverride,
            hasOverrides:
              !!instance.overrides &&
              Object.keys(instance.overrides).length > 0,
            instanceId: instance.id,
            isNested: correspondingObjectId !== instance.id,
            instanceOverridesKeys: instance.overrides
              ? Object.keys(instance.overrides)
              : [],
            hasOverrideForThisObject: instance.overrides
              ? !!instance.overrides[correspondingObjectId]
              : false,
            overrideForThisObject: instance.overrides
              ? instance.overrides[correspondingObjectId]
              : undefined,
            newValue,
            currentValue: getNestedProperty(
              JSON.parse(JSON.stringify(allObjects[correspondingObjectId])),
              propertyPath
            ),
          }
        );

        if (!hasManualOverride) {
          // No manual override, sync from main component
          const currentValue = getNestedProperty(
            plainCorrespondingObject,
            propertyPath
          );
          console.log(
            `✅ OVERRIDABLE PROPERTY SYNC: ${propertyPath} from ${currentValue} to ${newValue} for object ${correspondingObjectId}`
          );
          if (currentValue !== newValue) {
            // Accumulate changes into the shared objects instead of creating separate ones
            setNestedProperty(accumulatedChanges, propertyPath, newValue);
            setNestedProperty(
              accumulatedPreviousValues,
              propertyPath,
              currentValue
            );
          }
        } else {
          // Has manual override, don't sync - let the instance keep its override
          console.log(
            `🔒 Property ${propertyPath} has manual override, not syncing for object ${correspondingObjectId}`
          );
        }
      }
    });

    // Create a single object change with all accumulated changes
    if (Object.keys(accumulatedChanges).length > 0) {
      const objectChanges = [
        {
          id: correspondingObjectId,
          changes: accumulatedChanges,
          previousValues: accumulatedPreviousValues,
        },
      ];

      result.affectedInstanceIds.push(instance.id);
      result.changes.push({
        instanceId: instance.id,
        objectUpdates: objectChanges,
      });
      console.log(`✅ Added accumulated changes for instance ${instance.id}:`, {
        correspondingObjectId,
        accumulatedChanges,
        propertyPaths: Object.keys(accumulatedChanges),
      });
    } else {
      console.log(`⚠️ No changes generated for instance ${instance.id}`);
    }
  }

  console.log(
    `🏁 Final sync result: ${result.changes.length} instances affected out of ${instances.length} total`,
    {
      affectedInstanceIds: result.affectedInstanceIds,
      totalInstances: instances.length,
    }
  );

  return result;
}

/**
 * Helper function to get nested property value from an object
 */
function getNestedProperty(obj: any, path: string): any {
  const keys = path.split(".");
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * Helper function to set nested property value in an object
 */
function setNestedProperty(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  let current = obj;

  // Debug auto layout modifications
  if (path.includes("autoLayout")) {
    const beforeAutoLayout = getNestedProperty(obj, "properties.autoLayout");
    console.log(`🚨 SET NESTED PROPERTY BEFORE:`, {
      path,
      value,
      beforeAutoLayout: beforeAutoLayout
        ? { ...beforeAutoLayout }
        : "NO_AUTOLAYOUT",
      beforeMode: beforeAutoLayout?.mode,
    });
  }

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
}

/**
 * Gets the path from an ancestor object to a descendant object
 * Returns an array of child indices that can be used to navigate from ancestor to descendant
 */
function getPathFromAncestor(
  descendantId: string,
  ancestorId: string,
  allObjects: Record<string, CanvasObject>
): number[] | null {
  if (descendantId === ancestorId) {
    return []; // Same object, empty path
  }

  const descendant = allObjects[descendantId];
  if (!descendant?.parentId) {
    return null; // No parent, can't find path
  }

  // Find path to parent first
  const pathToParent = getPathFromAncestor(
    descendant.parentId,
    ancestorId,
    allObjects
  );
  if (pathToParent === null) {
    return null; // Parent is not descendant of ancestor
  }

  // Find this object's index in its parent's children
  const parent = allObjects[descendant.parentId];
  if (!parent) {
    return null;
  }

  const childIndex = parent.childIds.indexOf(descendantId);
  if (childIndex === -1) {
    return null; // Object not found in parent's children
  }

  return [...pathToParent, childIndex];
}

/**
 * Gets the object ID at a specific path from a root object
 * Uses the path array returned by getPathFromAncestor
 */
function getObjectAtPath(
  rootId: string,
  path: number[],
  allObjects: Record<string, CanvasObject>
): string | null {
  let currentId = rootId;

  for (const childIndex of path) {
    const currentObject = allObjects[currentId];
    if (
      !currentObject ||
      !currentObject.childIds ||
      childIndex >= currentObject.childIds.length
    ) {
      return null; // Path doesn't exist
    }
    currentId = currentObject.childIds[childIndex];
  }

  return currentId;
}

/**
 * Resets all overrides on a component instance to match the main component
 */
export function resetInstanceToMainComponent(
  instanceId: string,
  allObjects: Record<string, CanvasObject>
): {
  updatedObjects: Record<string, CanvasObject>;
  resetCount: number;
} {
  const result = {
    updatedObjects: {} as Record<string, CanvasObject>,
    resetCount: 0,
  };

  const instance = allObjects[instanceId];
  if (!instance?.isComponentInstance || !instance.componentId) {
    console.warn("Object is not a component instance:", instanceId);
    return result;
  }

  // Find the main component
  const mainComponent = Object.values(allObjects).find(
    (obj) => obj.componentId === instance.componentId && obj.isMainComponent
  );

  if (!mainComponent) {
    console.warn("Main component not found for instance:", instanceId);
    return result;
  }

  console.log("🔄 Resetting instance to main component:", {
    instanceId,
    componentId: instance.componentId,
    mainComponentId: mainComponent.id,
    currentOverrides: instance.overrides,
  });

  // Clear all overrides
  const resetInstance = {
    ...instance,
    overrides: {},
  };

  result.updatedObjects[instanceId] = resetInstance;
  result.resetCount++;

  // Now sync all properties from main component to instance objects
  const syncResult = syncComponentChangesDeep(
    mainComponent.id,
    mainComponent, // Sync all properties from main
    {
      ...allObjects,
      [instanceId]: resetInstance, // Use the reset instance
    }
  );

  // Merge sync results
  syncResult.changes.forEach(
    ({ instanceId: affectedInstanceId, objectUpdates }) => {
      if (affectedInstanceId === instanceId) {
        objectUpdates.forEach(({ id, changes }) => {
          if (result.updatedObjects[id]) {
            // Merge changes if object already has updates
            result.updatedObjects[id] = {
              ...result.updatedObjects[id],
              ...changes,
            };
          } else {
            result.updatedObjects[id] = {
              ...allObjects[id],
              ...changes,
            };
          }
          result.resetCount++;
        });
      }
    }
  );

  console.log("✅ Instance reset complete:", {
    instanceId,
    resetObjectCount: result.resetCount,
    updatedObjectIds: Object.keys(result.updatedObjects),
  });

  return result;
}

/**
 * Expands complex property changes into granular paths for better override handling
 * For example: { properties: { fills: [...] } } becomes { "properties.fills": [...] }
 */
function expandPropertyChanges(changes: Partial<CanvasObject>): Array<{
  propertyPath: string;
  newValue: any;
}> {
  const result: Array<{ propertyPath: string; newValue: any }> = [];

  Object.entries(changes).forEach(([key, value]) => {
    if (key === "properties" && typeof value === "object" && value !== null) {
      // Special handling for properties object - break it down into sub-properties
      Object.entries(value).forEach(([subKey, subValue]) => {
        if (subKey === "fills" && Array.isArray(subValue)) {
          // Handle fills array specially - track the entire fills array as one unit
          result.push({
            propertyPath: `properties.fills`,
            newValue: subValue,
          });
        } else if (
          subKey === "autoLayout" &&
          typeof subValue === "object" &&
          subValue !== null
        ) {
          // CRITICAL FIX: For autoLayout, sync the entire object to prevent property loss
          // When instances don't have autoLayout yet, individual property setting loses other properties
          console.log(`🔧 EXPANDING AUTO LAYOUT (COMPLETE OBJECT):`, {
            autoLayoutObject: subValue,
            autoLayoutKeys: Object.keys(subValue),
          });

          result.push({
            propertyPath: `properties.autoLayout`,
            newValue: subValue, // Use the complete auto layout object
          });
        } else {
          // Handle other properties sub-keys
          result.push({
            propertyPath: `properties.${subKey}`,
            newValue: subValue,
          });
        }
      });
    } else {
      // Simple properties - use as-is
      result.push({
        propertyPath: key,
        newValue: value,
      });
    }
  });

  console.log(`🔧 EXPAND PROPERTY CHANGES:`, {
    originalChanges: Object.keys(changes),
    expandedPaths: result.map((r) => r.propertyPath),
    expandedChanges: result,
  });

  return result;
}

/**
 * Finds the corresponding object in an instance based on the original object ID
 * This replaces index-based mapping with more robust ID-based mapping
 */
function findCorrespondingObjectById(
  originalObjectId: string,
  instanceId: string,
  allObjects: Record<string, CanvasObject>
): string | null {
  const instance = allObjects[instanceId];
  if (!instance) {
    console.warn(`❌ Instance ${instanceId} not found`);
    return null;
  }

  // Special case: If we're looking for the main component object,
  // and this instance corresponds to it, return the instance itself
  if (
    instance.isComponentInstance &&
    instance.originalId === originalObjectId
  ) {
    console.log(
      `📍 Found main component correspondence: ${originalObjectId} → ${instanceId}`
    );
    return instanceId;
  }

  // Search all objects that belong to this specific component instance
  // We need to find objects that belong to this instance's hierarchy
  for (const [objectId, object] of Object.entries(allObjects)) {
    if (
      object.componentId === instance.componentId &&
      object.originalId === originalObjectId
    ) {
      // Additional check: ensure this object belongs to the specific instance
      // by checking if it's a child of the instance or has the instance as an ancestor
      if (isObjectInInstanceHierarchy(objectId, instanceId, allObjects)) {
        console.log(
          `📍 Found child object correspondence: ${originalObjectId} → ${objectId} (instance: ${instanceId})`
        );
        return objectId;
      }
    }
  }

  console.warn(
    `❌ Could not find correspondence for ${originalObjectId} in instance ${instanceId}. Check that all objects have proper originalId.`
  );
  return null;
}

/**
 * Checks if an object belongs to a specific instance's hierarchy
 */
function isObjectInInstanceHierarchy(
  objectId: string,
  instanceId: string,
  allObjects: Record<string, CanvasObject>
): boolean {
  // If the object is the instance itself, it belongs to the hierarchy
  if (objectId === instanceId) {
    return true;
  }

  // Check if the object has the instance as an ancestor
  let currentId: string | undefined = objectId;
  const visited = new Set<string>(); // Prevent infinite loops

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const currentObject: CanvasObject | undefined = allObjects[currentId];

    if (!currentObject) {
      break;
    }

    // If we reached the instance, this object belongs to its hierarchy
    if (currentId === instanceId) {
      return true;
    }

    // Move up to the parent
    currentId = currentObject.parentId;
  }

  return false;
}

/**
 * Synchronizes structural changes (adding/removing children) from main component to instances
 */
export function syncStructuralChanges(
  parentObjectId: string,
  changeType: "child_added" | "child_removed" | "children_reordered",
  childObjectIdOrReorderData:
    | string
    | { oldChildIds: string[]; newChildIds: string[] },
  allObjects: Record<string, CanvasObject>
): ComponentSyncResult {
  const result: ComponentSyncResult = {
    affectedInstanceIds: [],
    changes: [],
  };

  const parentObject = allObjects[parentObjectId];
  if (!parentObject?.componentId) {
    return result; // Parent is not part of a component
  }

  const componentId = parentObject.componentId;

  // Find the main component object
  const mainComponent = Object.values(allObjects).find(
    (obj) => obj.componentId === componentId && obj.isMainComponent
  );

  if (!mainComponent) {
    return result; // No main component found
  }

  // Find all instances of this component
  const instances = Object.values(allObjects).filter(
    (obj) => obj.isComponentInstance && obj.componentId === componentId
  );

  if (instances.length === 0) {
    return result; // No instances to sync
  }

  // Calculate the path from main component to the parent object
  const pathFromMain = getPathFromAncestor(
    parentObjectId,
    mainComponent.id,
    allObjects
  );

  if (!pathFromMain) {
    return result; // Parent object is not within the main component
  }

  console.log("🔄 Syncing structural changes:", {
    componentId,
    changeType,
    parentObjectId,
    childObjectIdOrData: childObjectIdOrReorderData,
    pathFromMain,
    instanceCount: instances.length,
  });

  if (changeType === "child_added") {
    return syncChildAddition(
      parentObjectId,
      childObjectIdOrReorderData as string,
      pathFromMain,
      instances,
      allObjects,
      componentId
    );
  } else if (changeType === "child_removed") {
    return syncChildRemoval(
      parentObjectId,
      childObjectIdOrReorderData as string,
      pathFromMain,
      instances,
      allObjects
    );
  } else if (changeType === "children_reordered") {
    return syncChildrenReordering(
      parentObjectId,
      childObjectIdOrReorderData as {
        oldChildIds: string[];
        newChildIds: string[];
      },
      pathFromMain,
      instances,
      allObjects
    );
  }

  return result;
}

/**
 * Helper function to sync adding a child to all instances
 */
function syncChildAddition(
  parentObjectId: string,
  newChildId: string,
  pathFromMain: number[],
  instances: CanvasObject[],
  allObjects: Record<string, CanvasObject>,
  componentId: string
): ComponentSyncResult {
  const result: ComponentSyncResult = {
    affectedInstanceIds: [],
    changes: [],
    newObjects: {},
  };

  const newChild = allObjects[newChildId];
  if (!newChild) {
    return result;
  }

  // Find the position of the new child in its parent's childIds
  const parent = allObjects[parentObjectId];
  if (!parent) {
    return result;
  }

  const childIndex = parent.childIds.indexOf(newChildId);
  if (childIndex === -1) {
    return result;
  }

  // For each instance, clone the new child and add it to the corresponding parent
  for (const instance of instances) {
    const correspondingParentId = findCorrespondingObjectById(
      parentObjectId,
      instance.id,
      allObjects
    );

    if (!correspondingParentId) {
      console.warn(
        `Could not find corresponding parent in instance ${instance.id} for original parent ${parentObjectId}`
      );
      continue;
    }

    const correspondingParent = allObjects[correspondingParentId];
    if (!correspondingParent) {
      continue;
    }

    // Clone the new child for this instance (but don't modify allObjects yet)
    const clonedObjects: Record<string, CanvasObject> = {};
    const clonedChild = cloneObjectForInstance(
      newChild,
      correspondingParentId,
      componentId,
      allObjects,
      clonedObjects
    );

    // Collect all the new objects (including nested children)
    Object.assign(result.newObjects!, clonedObjects);

    // Update the parent's childIds
    const newChildIds = [...correspondingParent.childIds];
    newChildIds.splice(childIndex, 0, clonedChild.id);

    const parentChanges = {
      childIds: newChildIds,
    };

    result.affectedInstanceIds.push(instance.id);
    result.changes.push({
      instanceId: instance.id,
      objectUpdates: [
        {
          id: correspondingParentId,
          changes: parentChanges,
          previousValues: { childIds: correspondingParent.childIds },
        },
      ],
    });

    console.log("📦 Cloned child for instance:", {
      instanceId: instance.id,
      originalChildId: newChildId,
      clonedChildId: clonedChild.id,
      parentId: correspondingParentId,
    });
  }

  return result;
}

/**
 * Helper function to sync removing a child from all instances
 */
function syncChildRemoval(
  parentObjectId: string,
  removedChildId: string,
  pathFromMain: number[],
  instances: CanvasObject[],
  allObjects: Record<string, CanvasObject>
): ComponentSyncResult {
  const result: ComponentSyncResult = {
    affectedInstanceIds: [],
    changes: [],
  };

  // For each instance, find and remove the corresponding child
  for (const instance of instances) {
    const correspondingParentId = findCorrespondingObjectById(
      parentObjectId,
      instance.id,
      allObjects
    );

    if (!correspondingParentId) {
      console.warn(
        `Could not find corresponding parent in instance ${instance.id} for original parent ${parentObjectId}`
      );
      continue;
    }

    const correspondingParent = allObjects[correspondingParentId];
    if (!correspondingParent) {
      continue;
    }

    // Find the corresponding child to remove using ID-based mapping
    const correspondingChildId = findCorrespondingObjectById(
      removedChildId,
      instance.id,
      allObjects
    );

    if (!correspondingChildId) {
      console.warn(
        `Could not find corresponding child in instance ${instance.id} for removed child ${removedChildId}`
      );
      continue;
    }

    // Remove the corresponding child from the instance parent
    const childToRemove = correspondingChildId;
    const newChildIds = correspondingParent.childIds.filter(
      (id) => id !== correspondingChildId
    );

    console.log("🔍 CHILD REMOVAL DEBUG:", {
      instanceId: instance.id,
      parentId: correspondingParentId,
      childToRemove: correspondingChildId,
      originalRemovedId: removedChildId,
      beforeChildIds: [...correspondingParent.childIds],
      afterChildIds: [...newChildIds],
      removedChildIndex:
        correspondingParent.childIds.indexOf(correspondingChildId),
      childrenCount: {
        before: correspondingParent.childIds.length,
        after: newChildIds.length,
      },
    });

    const parentChanges = {
      childIds: newChildIds,
    };

    result.affectedInstanceIds.push(instance.id);
    result.changes.push({
      instanceId: instance.id,
      objectUpdates: [
        {
          id: correspondingParentId,
          changes: parentChanges,
          previousValues: { childIds: correspondingParent.childIds },
        },
      ],
    });

    console.log("🗑️ Child removed from instance:", {
      instanceId: instance.id,
      parentId: correspondingParentId,
      removedChildId: childToRemove,
      originalRemovedId: removedChildId,
      beforeChildIds: correspondingParent.childIds,
      afterChildIds: newChildIds,
    });

    // Mark the removed child for deletion from the instance
    // We need to collect all objects to delete (including nested children)
    const objectsToDelete = new Set<string>();
    const collectObjectsToDelete = (objectId: string) => {
      const obj = allObjects[objectId];
      if (obj) {
        objectsToDelete.add(objectId);
        if (obj.childIds) {
          obj.childIds.forEach(collectObjectsToDelete);
        }
      }
    };
    collectObjectsToDelete(childToRemove);

    // Add deletion information to the result
    if (!result.objectsToDelete) {
      result.objectsToDelete = [];
    }
    result.objectsToDelete.push(...Array.from(objectsToDelete));
  }

  return result;
}

/**
 * Helper function to clone an object for an instance
 */
function cloneObjectForInstance(
  sourceObject: CanvasObject,
  newParentId: string,
  componentId: string,
  allObjects: Record<string, CanvasObject>,
  outputObjects: Record<string, CanvasObject>
): CanvasObject {
  const newId = nanoid();

  // Clone children recursively
  const newChildIds: string[] = [];
  if (sourceObject.childIds && sourceObject.childIds.length > 0) {
    sourceObject.childIds.forEach((childId) => {
      const childObject = allObjects[childId];
      if (childObject) {
        const clonedChild = cloneObjectForInstance(
          childObject,
          newId,
          componentId,
          allObjects,
          outputObjects
        );
        newChildIds.push(clonedChild.id);
      }
    });
  }

  // Create the cloned object with deep-cloned nested properties
  const clonedObject: CanvasObject = {
    ...sourceObject,
    id: newId,
    parentId: newParentId,
    childIds: newChildIds,
    createdAt: Date.now(),
    // Deep clone properties to prevent shared-reference mutations
    properties: sourceObject.properties
      ? JSON.parse(JSON.stringify(sourceObject.properties))
      : sourceObject.properties,
    fills: sourceObject.fills
      ? JSON.parse(JSON.stringify(sourceObject.fills))
      : [],
    strokes: sourceObject.strokes
      ? JSON.parse(JSON.stringify(sourceObject.strokes))
      : [],
    effects: sourceObject.effects
      ? JSON.parse(JSON.stringify(sourceObject.effects))
      : sourceObject.effects,
    autoLayoutSizing: sourceObject.autoLayoutSizing
      ? { ...sourceObject.autoLayoutSizing }
      : sourceObject.autoLayoutSizing,
    // Mark as part of the component but not as main or instance
    componentId: componentId,
    isMainComponent: false,
    isComponentInstance: false,
    // Track which original object this corresponds to for ID-based mapping
    originalId: sourceObject.id,
  };

  // Add to the output collection
  outputObjects[newId] = clonedObject;

  return clonedObject;
}

/**
 * Helper function to sync children reordering to all instances
 */
function syncChildrenReordering(
  parentObjectId: string,
  reorderData: { oldChildIds: string[]; newChildIds: string[] },
  pathFromMain: number[],
  instances: CanvasObject[],
  allObjects: Record<string, CanvasObject>
): ComponentSyncResult {
  const result: ComponentSyncResult = {
    affectedInstanceIds: [],
    changes: [],
  };

  console.log("🔄 Syncing children reordering:", {
    parentObjectId,
    oldChildIds: reorderData.oldChildIds,
    newChildIds: reorderData.newChildIds,
    pathFromMain,
    instanceCount: instances.length,
  });

  // For each instance, find the corresponding parent and reorder its children
  for (const instance of instances) {
    // Navigate to the corresponding parent using the path
    const correspondingParentId = getObjectAtPath(
      instance.id,
      pathFromMain,
      allObjects
    );

    if (!correspondingParentId) {
      console.warn(
        `Could not find corresponding parent in instance ${instance.id} for reordering`
      );
      continue;
    }

    const correspondingParent = allObjects[correspondingParentId];
    if (!correspondingParent) {
      console.warn(
        `Corresponding parent ${correspondingParentId} not found in instance ${instance.id}`
      );
      continue;
    }

    // Map the main component child IDs to instance child IDs
    const mappedNewChildIds: string[] = [];
    for (const mainChildId of reorderData.newChildIds) {
      const correspondingChildId = findCorrespondingObjectById(
        mainChildId,
        instance.id,
        allObjects
      );

      if (correspondingChildId) {
        mappedNewChildIds.push(correspondingChildId);
      } else {
        console.warn(
          `Could not find corresponding child ${mainChildId} in instance ${instance.id}`
        );
      }
    }

    // Only update if we found all corresponding children
    if (mappedNewChildIds.length === reorderData.newChildIds.length) {
      const changes = {
        childIds: mappedNewChildIds,
      };

      result.affectedInstanceIds.push(instance.id);
      result.changes.push({
        instanceId: instance.id,
        objectUpdates: [
          {
            id: correspondingParentId,
            changes,
            previousValues: { childIds: correspondingParent.childIds },
          },
        ],
      });

      console.log("🔄 Reordered children for instance:", {
        instanceId: instance.id,
        parentId: correspondingParentId,
        oldChildIds: correspondingParent.childIds,
        newChildIds: mappedNewChildIds,
      });
    } else {
      console.warn(
        `Incomplete child mapping for instance ${instance.id}, skipping reorder`
      );
    }
  }

  return result;
}
