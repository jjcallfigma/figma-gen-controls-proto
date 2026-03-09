/**
 * Service for handling Figma file imports
 * Step-by-step refactor - starting with URL parameter detection
 */
export class FigmaImportService {
  /**
   * Check if URL contains Figma import parameters
   */
  static hasUrlImportParams(): { token: string; fileId: string } | null {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("figma-token");
    const urlFileId = urlParams.get("figma-file");

    if (urlToken && urlFileId) {
      return { token: urlToken, fileId: urlFileId };
    }

    return null;
  }

  /**
   * Import a Figma file from URL parameters
   * Note: This requires the importFigmaObjects function to be passed in
   */
  static async importFromUrl(
    dispatch: any,
    importFigmaObjects: (
      firstPage: any,
      token: string,
      fileId: string
    ) => Promise<void>
  ): Promise<void> {
    const urlImportParams = this.hasUrlImportParams();
    if (!urlImportParams) {
      return;
    }

    const { token: urlToken, fileId: urlFileId } = urlImportParams;

    try {
      const response = await fetch(
        `https://api.figma.com/v1/files/${urlFileId}`,
        {
          headers: {
            "X-Figma-Token": urlToken,
          },
        }
      );

      if (!response.ok) {
        console.error("Failed to fetch Figma file");
        return;
      }

      const fileData = await response.json();

      // Import the file
      const firstPage = fileData.document?.children?.[0];
      if (!firstPage) {
        console.error("No pages found in Figma file");
        return;
      }

      // Clear existing objects
      dispatch({ type: "canvas.clear", payload: {} });

      // Add a small delay to prevent rapid state updates during import
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Import objects
      await importFigmaObjects(firstPage, urlToken, urlFileId);

      // Save token to localStorage
      localStorage.setItem("figma-api-token", urlToken);

      // Update URL to reflect successful import
      this.updateUrlParams(urlToken, urlFileId);

      console.log("Silent import completed successfully");
    } catch (error) {
      console.error("Silent import failed:", error);
    }
  }

  /**
   * Update URL parameters to reflect import
   */
  static updateUrlParams(token: string, fileId: string): void {
    const url = new URL(window.location.href);
    url.searchParams.set("figma-token", token);
    url.searchParams.set("figma-file", fileId);
    window.history.pushState({}, "", url.toString());
  }
}
