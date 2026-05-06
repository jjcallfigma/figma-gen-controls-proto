# Wireframe Sphere

A wireframe sphere rendered to SVG using nothing but trig. No WebGL, no three.js, no dependencies. Four stages: mesh generation, rotation, perspective projection, SVG path output.

## Types

```typescript
interface Point3D { x: number; y: number; z: number }
interface Point2D { x: number; y: number }
interface Mesh3D { vertices: Point3D[]; faces: number[][] }
```

## 1. Generate the mesh

A UV sphere. Latitude loops from pole to pole, longitude loops around the equator. Each pair of adjacent rings forms a ring of quad faces.

```typescript
function makeSphere(radius: number, segments = 12): Mesh3D {
  const vertices: Point3D[] = [];
  const faces: number[][] = [];

  for (let lat = 0; lat <= segments; lat++) {
    const theta = (lat / segments) * Math.PI;
    for (let lon = 0; lon <= segments; lon++) {
      const phi = (lon / segments) * 2 * Math.PI;
      vertices.push({
        x: radius * Math.sin(theta) * Math.cos(phi),
        y: radius * Math.cos(theta),
        z: radius * Math.sin(theta) * Math.sin(phi),
      });
    }
  }

  for (let lat = 0; lat < segments; lat++) {
    for (let lon = 0; lon < segments; lon++) {
      const a = lat * (segments + 1) + lon;
      const b = a + segments + 1;
      faces.push([a, b, b + 1, a + 1]);
    }
  }

  return { vertices, faces };
}
```

## 2. Rotate

Euler rotation in X, Y, Z order. Each axis applies a standard 2D rotation matrix to the two axes it affects.

```typescript
function rotate3D(p: Point3D, rx: number, ry: number, rz: number): Point3D {
  const toR = (d: number) => d * Math.PI / 180;
  const [ax, ay, az] = [toR(rx), toR(ry), toR(rz)];

  let { x, y, z } = p;
  let y1 = y * Math.cos(ax) - z * Math.sin(ax);
  let z1 = y * Math.sin(ax) + z * Math.cos(ax);

  let x2 = x * Math.cos(ay) + z1 * Math.sin(ay);
  let z2 = -x * Math.sin(ay) + z1 * Math.cos(ay);

  let x3 = x2 * Math.cos(az) - y1 * Math.sin(az);
  let y3 = x2 * Math.sin(az) + y1 * Math.cos(az);

  return { x: x3, y: y3, z: z2 };
}
```

## 3. Project to 2D

Perspective division. Points closer to the camera (smaller z) appear larger. `focalLength` controls how strong the perspective is -- higher values flatten toward orthographic.

```typescript
function project3D(p: Point3D, focalLength: number): Point2D {
  const denom = focalLength + p.z;
  if (Math.abs(denom) < 0.001) {
    const sign = denom >= 0 ? 1 : -1;
    return { x: p.x * focalLength / (sign * 0.001), y: p.y * focalLength / (sign * 0.001) };
  }
  const scale = focalLength / denom;
  return { x: p.x * scale, y: p.y * scale };
}
```

## 4. Extract edges

Walk every face, collect each edge pair once. The canonical key (`min:max`) deduplicates shared edges between adjacent faces.

```typescript
function meshToEdges(mesh: Mesh3D): [number, number][] {
  const seen = new Set<string>();
  const edges: [number, number][] = [];
  for (const face of mesh.faces) {
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([a, b]);
      }
    }
  }
  return edges;
}
```

## 5. Render to SVG path

Rotate all vertices, project to 2D, emit one `M...L...` segment per edge. The result is a single SVG path string.

```typescript
function meshToSinglePath(
  mesh: Mesh3D,
  rx: number, ry: number, rz: number,
  focalLength: number, cx: number, cy: number,
): string {
  const rotated = mesh.vertices.map(v => rotate3D(v, rx, ry, rz));
  const projected = rotated.map(v => project3D(v, focalLength));
  const edges = meshToEdges(mesh);
  const parts: string[] = [];
  for (const [a, b] of edges) {
    const pa = projected[a];
    const pb = projected[b];
    if (!isFinite(pa.x) || !isFinite(pa.y) || !isFinite(pb.x) || !isFinite(pb.y)) continue;
    parts.push(
      `M ${(cx + pa.x).toFixed(3)} ${(cy + pa.y).toFixed(3)} L ${(cx + pb.x).toFixed(3)} ${(cy + pb.y).toFixed(3)}`
    );
  }
  return parts.join(' ');
}
```

## Usage

```typescript
const mesh = makeSphere(100, 16);
const pathData = meshToSinglePath(mesh, 30, 45, 0, 400, 200, 200);

// Use in an SVG element:
// <svg width="400" height="400">
//   <path d={pathData} fill="none" stroke="#000" stroke-width="0.5" />
// </svg>
```

Parameters:

- `radius` -- sphere size in SVG units
- `segments` -- latitude/longitude divisions (12 = light wireframe, 24 = dense mesh)
- `rx, ry, rz` -- rotation in degrees
- `focalLength` -- perspective strength (400 = mild perspective, 1000+ = near-orthographic)
- `cx, cy` -- center offset in the SVG coordinate space

