import {
  convertToParentSpace,
  getAbsolutePosition,
} from "@/core/utils/coordinates";

/**
 * Nesting Observer System
 *
 * This system automatically updates child object positions and properties
 * when their parent objects change. This eliminates the need to manually
 * loop through and update all children whenever a parent changes.
 *
 * Key benefits:
 * - Automatic coordinate space conversion
 * - Efficient updates (only affected children)
 * - Future-ready for auto-layout features
 * - Prevents inconsistent state
 */

interface ObserverCallback {
  (objectId: string, changes: Record<string, any>): void;
}

interface ObservedProperty {
  objectId: string;
  property: string;
  callback: ObserverCallback;
}

class NestingObserver {
  private observers: Map<string, ObservedProperty[]> = new Map();
  private objects: Record<string, any> = {};
  private updateCallback: ObserverCallback | null = null;
  private disabled: boolean = false;

  /**
   * Initialize the observer with the current state and update callback
   */
  initialize(objects: Record<string, any>, updateCallback: ObserverCallback) {
    this.objects = objects;
    this.updateCallback = updateCallback;
    // Clear any previously accumulated observers before re-setting up
    this.observers.clear();
    this.setupDefaultObservers();
  }

  /**
   * Temporarily disable the observer (useful during drag operations)
   */
  disable() {
    this.disabled = true;
  }

  /**
   * Re-enable the observer
   */
  enable() {
    this.disabled = false;
  }

  /**
   * Update the objects reference when state changes
   */
  updateObjects(objects: Record<string, any>) {
    this.objects = objects;
  }

  /**
   * Set up default observers for nested object behavior
   */
  private setupDefaultObservers() {
    // Observe all parent objects for position changes
    Object.values(this.objects).forEach((object: any) => {
      if (object.childIds && object.childIds.length > 0) {
        this.observeProperty(object.id, "x", this.handleParentPositionChange);
        this.observeProperty(object.id, "y", this.handleParentPositionChange);
        this.observeProperty(object.id, "width", this.handleParentSizeChange);
        this.observeProperty(object.id, "height", this.handleParentSizeChange);
      }
    });
  }

  /**
   * Observe a specific property of an object
   */
  observeProperty(
    objectId: string,
    property: string,
    callback: ObserverCallback
  ) {
    const key = `${objectId}.${property}`;

    if (!this.observers.has(key)) {
      this.observers.set(key, []);
    }

    this.observers.get(key)!.push({
      objectId,
      property,
      callback,
    });
  }

  /**
   * Remove observers for an object (called when object is deleted)
   */
  removeObservers(objectId: string) {
    // Remove observers for this object
    const keysToRemove: string[] = [];
    this.observers.forEach((_, key) => {
      if (key.startsWith(`${objectId}.`)) {
        keysToRemove.push(key);
      }
    });

    keysToRemove.forEach((key) => this.observers.delete(key));
  }

  /**
   * Notify observers when an object property changes
   */
  notifyPropertyChange(
    objectId: string,
    property: string,
    oldValue: any,
    newValue: any
  ) {
    const key = `${objectId}.${property}`;
    const observers = this.observers.get(key);

    if (observers && oldValue !== newValue) {
      observers.forEach((observer) => {
        observer.callback(objectId, { [property]: newValue });
      });
    }
  }

  /**
   * Handle parent position changes - update all child positions to maintain relative positioning
   */
  private handleParentPositionChange = (
    parentId: string,
    changes: Record<string, any>
  ) => {
    const parent = this.objects[parentId];
    if (!parent || !parent.childIds) return;

    // For each child, we don't need to update their relative position
    // because in our system, child positions are already relative to parent
    // This observer is mainly for future auto-layout features

    // However, we may want to trigger re-renders or other side effects
    this.notifyChildrenOfParentChange(parentId, "position", changes);
  };

  /**
   * Handle parent size changes - important for auto-layout in the future
   */
  private handleParentSizeChange = (
    parentId: string,
    changes: Record<string, any>
  ) => {
    const parent = this.objects[parentId];
    if (!parent || !parent.childIds) return;

    // Future: This is where auto-layout logic would go
    // For now, just notify children that parent size changed
    this.notifyChildrenOfParentChange(parentId, "size", changes);
  };

  /**
   * Notify all children that their parent changed
   */
  private notifyChildrenOfParentChange(
    parentId: string,
    changeType: string,
    changes: Record<string, any>
  ) {
    const parent = this.objects[parentId];
    if (!parent || !parent.childIds) return;

    parent.childIds.forEach((childId: string) => {
      const child = this.objects[childId];
      if (child) {
        // Recursively notify grandchildren
        this.notifyChildrenOfParentChange(childId, changeType, changes);

        // Trigger any custom observers for this child
        const childObservers = this.observers.get(
          `${childId}.parent_${changeType}`
        );
        if (childObservers) {
          childObservers.forEach((observer) => {
            observer.callback(childId, { [`parent_${changeType}`]: changes });
          });
        }
      }
    });
  }

  /**
   * Handle object reparenting - update coordinate spaces
   */
  handleReparenting(
    objectId: string,
    oldParentId: string | undefined,
    newParentId: string | undefined
  ) {
    // Skip if observer is disabled (e.g., during drag operations)
    if (this.disabled) {
      return;
    }

    const object = this.objects[objectId];
    if (!object) return;

    // Get current absolute position
    const currentAbsolute = getAbsolutePosition(objectId, this.objects);

    // Convert to new parent's coordinate space
    const newRelativePosition = convertToParentSpace(
      currentAbsolute,
      newParentId,
      this.objects
    );

    // Update object position to maintain visual position during reparenting
    if (this.updateCallback) {
      this.updateCallback(objectId, {
        x: newRelativePosition.x,
        y: newRelativePosition.y,
        parentId: newParentId,
      });
    }

    // Update observers - remove from old parent, add to new parent
    if (oldParentId) {
      this.removeChildObservers(objectId, oldParentId);
    }

    if (newParentId) {
      this.addChildObservers(objectId, newParentId);
    }
  }

  /**
   * Add observers for a child object
   */
  private addChildObservers(childId: string, parentId: string) {
    // Observe parent changes that affect this child
    this.observeProperty(parentId, "x", (id, changes) => {
      this.handleParentPositionChange(id, changes);
    });

    this.observeProperty(parentId, "y", (id, changes) => {
      this.handleParentPositionChange(id, changes);
    });
  }

  /**
   * Remove observers for a child object
   */
  private removeChildObservers(childId: string, parentId: string) {
    // Remove specific observers related to this parent-child relationship
    const positionKey = `${parentId}.x`;
    const observers = this.observers.get(positionKey);

    if (observers) {
      const filtered = observers.filter(
        (obs) => !obs.callback.toString().includes(childId)
      );

      if (filtered.length === 0) {
        this.observers.delete(positionKey);
      } else {
        this.observers.set(positionKey, filtered);
      }
    }
  }

  /**
   * Get debug information about current observers
   */
  getDebugInfo() {
    return {
      observerCount: this.observers.size,
      observers: Array.from(this.observers.entries()).map(
        ([key, observers]) => ({
          key,
          count: observers.length,
        })
      ),
    };
  }
}

// Global observer instance
export const nestingObserver = new NestingObserver();

/**
 * Hook to integrate nesting observer with Zustand store
 */
export function useNestingObserver() {
  return nestingObserver;
}
