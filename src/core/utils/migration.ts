/**
 * Migration utilities for canvas state
 */

// Helper function to migrate existing objects to pages
export const migrateObjectsToPages = (state: any) => {
  // If there are objects but no pages have objects, migrate them to the first page
  if (state.objectIds.length > 0 && state.pages && state.pageIds.length > 0) {
    const firstPageId = state.pageIds[0];
    const firstPage = state.pages[firstPageId];

    if (firstPage && firstPage.objectIds.length === 0) {
      // Migrate all existing objects to the first page
      firstPage.objectIds = [...state.objectIds];
      console.log("🔄 [MIGRATION] Migrated objects to first page:", {
        objectCount: state.objectIds.length,
        pageId: firstPageId,
      });
    }
  }
};

