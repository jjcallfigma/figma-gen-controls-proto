export interface GridArea {
  col: number; // 1-based
  row: number;
  colSpan: number;
  rowSpan: number;
}

export interface GridLayout {
  id: string;
  name: string;
  cols: number;
  rows: number;
  orientation: "landscape" | "portrait" | "any";
  areas: GridArea[];
}

export const ASPECT_RATIOS = [
  { id: "16:9", label: "16:9", w: 16, h: 9 },
  { id: "9:16", label: "9:16", w: 9, h: 16 },
  { id: "4:5", label: "4:5", w: 4, h: 5 },
  { id: "1:1", label: "1:1", w: 1, h: 1 },
  { id: "4:3", label: "4:3", w: 4, h: 3 },
] as const;

export type AspectRatioId = (typeof ASPECT_RATIOS)[number]["id"];

export const LAYOUTS: GridLayout[] = [
  {
    id: "2-up",
    name: "2-Up",
    cols: 2,
    rows: 1,
    orientation: "landscape",
    areas: [
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    id: "top-heavy",
    name: "Top Heavy",
    cols: 2,
    rows: 2,
    orientation: "landscape",
    areas: [
      { col: 1, row: 1, colSpan: 2, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 2, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    id: "3-up",
    name: "3-Up",
    cols: 3,
    rows: 1,
    orientation: "landscape",
    areas: [
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 3, row: 1, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    id: "editorial-a",
    name: "Editorial",
    cols: 12,
    rows: 6,
    orientation: "landscape",
    areas: [
      { col: 1, row: 1, colSpan: 5, rowSpan: 4 },
      { col: 6, row: 1, colSpan: 4, rowSpan: 2 },
      { col: 10, row: 1, colSpan: 3, rowSpan: 3 },
      { col: 6, row: 3, colSpan: 4, rowSpan: 2 },
      { col: 1, row: 5, colSpan: 3, rowSpan: 2 },
      { col: 4, row: 5, colSpan: 6, rowSpan: 2 },
      { col: 10, row: 4, colSpan: 3, rowSpan: 3 },
    ],
  },
  {
    id: "spread",
    name: "Spread",
    cols: 12,
    rows: 6,
    orientation: "landscape",
    areas: [
      { col: 1, row: 1, colSpan: 8, rowSpan: 4 },
      { col: 9, row: 1, colSpan: 4, rowSpan: 2 },
      { col: 9, row: 3, colSpan: 4, rowSpan: 2 },
      { col: 1, row: 5, colSpan: 4, rowSpan: 2 },
      { col: 5, row: 5, colSpan: 4, rowSpan: 2 },
      { col: 9, row: 5, colSpan: 4, rowSpan: 2 },
    ],
  },
  {
    id: "mosaic",
    name: "Mosaic",
    cols: 12,
    rows: 6,
    orientation: "landscape",
    areas: [
      { col: 1, row: 1, colSpan: 4, rowSpan: 3 },
      { col: 5, row: 1, colSpan: 5, rowSpan: 2 },
      { col: 10, row: 1, colSpan: 3, rowSpan: 2 },
      { col: 5, row: 3, colSpan: 3, rowSpan: 2 },
      { col: 8, row: 3, colSpan: 5, rowSpan: 4 },
      { col: 1, row: 4, colSpan: 4, rowSpan: 3 },
      { col: 5, row: 5, colSpan: 3, rowSpan: 2 },
    ],
  },
  {
    id: "asymmetric",
    name: "Asymmetric",
    cols: 12,
    rows: 6,
    orientation: "landscape",
    areas: [
      { col: 1, row: 1, colSpan: 7, rowSpan: 3 },
      { col: 8, row: 1, colSpan: 5, rowSpan: 2 },
      { col: 8, row: 3, colSpan: 2, rowSpan: 2 },
      { col: 10, row: 3, colSpan: 3, rowSpan: 2 },
      { col: 1, row: 4, colSpan: 4, rowSpan: 3 },
      { col: 5, row: 4, colSpan: 3, rowSpan: 3 },
      { col: 8, row: 5, colSpan: 5, rowSpan: 2 },
    ],
  },
  {
    id: "gallery",
    name: "Gallery",
    cols: 12,
    rows: 6,
    orientation: "landscape",
    areas: [
      { col: 1, row: 1, colSpan: 3, rowSpan: 3 },
      { col: 1, row: 4, colSpan: 3, rowSpan: 3 },
      { col: 4, row: 1, colSpan: 6, rowSpan: 6 },
      { col: 10, row: 1, colSpan: 3, rowSpan: 2 },
      { col: 10, row: 3, colSpan: 3, rowSpan: 2 },
      { col: 10, row: 5, colSpan: 3, rowSpan: 2 },
    ],
  },
  {
    id: "2-stack",
    name: "2-Stack",
    cols: 1,
    rows: 2,
    orientation: "portrait",
    areas: [
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    id: "3-stack",
    name: "3-Stack",
    cols: 1,
    rows: 3,
    orientation: "portrait",
    areas: [
      { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 2, colSpan: 1, rowSpan: 1 },
      { col: 1, row: 3, colSpan: 1, rowSpan: 1 },
    ],
  },
  {
    id: "stories",
    name: "Stories",
    cols: 4,
    rows: 8,
    orientation: "portrait",
    areas: [
      { col: 1, row: 1, colSpan: 4, rowSpan: 3 },
      { col: 1, row: 4, colSpan: 2, rowSpan: 2 },
      { col: 3, row: 4, colSpan: 2, rowSpan: 2 },
      { col: 1, row: 6, colSpan: 3, rowSpan: 3 },
      { col: 4, row: 6, colSpan: 1, rowSpan: 3 },
    ],
  },
  {
    id: "scroll",
    name: "Scroll",
    cols: 4,
    rows: 8,
    orientation: "portrait",
    areas: [
      { col: 1, row: 1, colSpan: 3, rowSpan: 2 },
      { col: 4, row: 1, colSpan: 1, rowSpan: 4 },
      { col: 1, row: 3, colSpan: 3, rowSpan: 2 },
      { col: 1, row: 5, colSpan: 2, rowSpan: 2 },
      { col: 3, row: 5, colSpan: 2, rowSpan: 2 },
      { col: 1, row: 7, colSpan: 4, rowSpan: 2 },
    ],
  },
];

export function getLayoutById(id: string): GridLayout | undefined {
  return LAYOUTS.find((l) => l.id === id);
}

export function getOrientationForRatio(ratioId: string): "landscape" | "portrait" {
  const ratio = ASPECT_RATIOS.find((r) => r.id === ratioId);
  if (!ratio) return "landscape";
  if (ratio.w > ratio.h) return "landscape";
  if (ratio.h > ratio.w) return "portrait";
  return "landscape"; // square defaults to landscape layouts
}

export function getLayoutsForOrientation(
  orientation: "landscape" | "portrait"
): GridLayout[] {
  return LAYOUTS.filter(
    (l) => l.orientation === orientation || l.orientation === "any"
  );
}
