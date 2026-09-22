#!/usr/bin/env node
/**
 * Builds the AR Instrument Lab's 3D models.
 *
 * The models are generated rather than downloaded. A .glb found on the web
 * usually cannot be shown to be licensed for this use, and a schematic model is
 * better teaching material than a photoreal one: every part a trainee has to
 * identify is a separate, named node with its own material, so the application
 * can tint exactly one component without touching the rest.
 *
 * Output: frontend/public/models/doppler-radar.glb  (see docs/AR_ASSETS.md)
 *
 *   npm run build:models
 *
 * The radar is authored about 1.15 units tall. glTF units are metres and AR
 * places models at real size, so this is deliberately a desk-sized scale model:
 * a 30 m tower placed in a training room would be unusable.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------------------------
// Geometry. Every helper returns flat arrays in the same shape, so they can be concatenated.
// ---------------------------------------------------------------------------------------------

/** @typedef {{ positions: number[], normals: number[], indices: number[] }} Geometry */

const empty = () => ({ positions: [], normals: [], indices: [] });

/** Appends `source` to `target`, shifting its indices. */
function merge(target, source) {
  const offset = target.positions.length / 3;
  target.positions.push(...source.positions);
  target.normals.push(...source.normals);
  for (const index of source.indices) target.indices.push(index + offset);
  return target;
}

function translate(geometry, [dx, dy, dz]) {
  for (let i = 0; i < geometry.positions.length; i += 3) {
    geometry.positions[i] += dx;
    geometry.positions[i + 1] += dy;
    geometry.positions[i + 2] += dz;
  }
  return geometry;
}

/** Rotates about the X axis, for tilting the dish. */
function rotateX(geometry, radians) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  for (const array of [geometry.positions, geometry.normals]) {
    for (let i = 0; i < array.length; i += 3) {
      const y = array[i + 1];
      const z = array[i + 2];
      array[i + 1] = y * cos - z * sin;
      array[i + 2] = y * sin + z * cos;
    }
  }
  return geometry;
}

/** A box with flat shading: each face gets its own four vertices so the normals stay sharp. */
function box(width, height, depth) {
  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;
  const faces = [
    { normal: [0, 0, 1], corners: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
    { normal: [0, 0, -1], corners: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]] },
    { normal: [1, 0, 0], corners: [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]] },
    { normal: [-1, 0, 0], corners: [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]] },
    { normal: [0, 1, 0], corners: [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]] },
    { normal: [0, -1, 0], corners: [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]] },
  ];
  const geometry = empty();
  for (const face of faces) {
    const start = geometry.positions.length / 3;
    for (const corner of face.corners) {
      geometry.positions.push(...corner);
      geometry.normals.push(...face.normal);
    }
    geometry.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  return geometry;
}

/**
 * A four-sided tapered frustum: the radar tower. Flat-shaded, and the side
 * normals are tilted with the taper so the light reads correctly.
 */
function taperedBox(bottom, top, height) {
  const b = bottom / 2;
  const t = top / 2;
  const half = height / 2;
  const lower = [[-b, -half, b], [b, -half, b], [b, -half, -b], [-b, -half, -b]];
  const upper = [[-t, half, t], [t, half, t], [t, half, -t], [-t, half, -t]];
  const geometry = empty();

  for (let side = 0; side < 4; side += 1) {
    const next = (side + 1) % 4;
    const quad = [lower[side], lower[next], upper[next], upper[side]];
    // Outward normal of the sloped face, from its two edge vectors.
    const edgeA = [quad[1][0] - quad[0][0], quad[1][1] - quad[0][1], quad[1][2] - quad[0][2]];
    const edgeB = [quad[3][0] - quad[0][0], quad[3][1] - quad[0][1], quad[3][2] - quad[0][2]];
    const normal = [edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1], edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2], edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0]];
    const length = Math.hypot(...normal) || 1;
    const unit = normal.map((value) => value / length);

    const start = geometry.positions.length / 3;
    for (const corner of quad) {
      geometry.positions.push(...corner);
      geometry.normals.push(...unit);
    }
    geometry.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }

  // Cap the top so the platform does not sit on a hole.
  const start = geometry.positions.length / 3;
  for (const corner of upper) {
    geometry.positions.push(...corner);
    geometry.normals.push(0, 1, 0);
  }
  geometry.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  return geometry;
}

/** A closed cylinder, smooth around its side. */
function cylinder(radius, height, segments = 20) {
  const geometry = empty();
  const half = height / 2;

  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    geometry.positions.push(x * radius, -half, z * radius, x * radius, half, z * radius);
    geometry.normals.push(x, 0, z, x, 0, z);
  }
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2;
    geometry.indices.push(a, a + 2, a + 3, a, a + 3, a + 1);
  }

  for (const [y, normalY] of [[half, 1], [-half, -1]]) {
    const centre = geometry.positions.length / 3;
    geometry.positions.push(0, y, 0);
    geometry.normals.push(0, normalY, 0);
    const rim = geometry.positions.length / 3;
    for (let i = 0; i <= segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      geometry.positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      geometry.normals.push(0, normalY, 0);
    }
    for (let i = 0; i < segments; i += 1) {
      if (normalY > 0) geometry.indices.push(centre, rim + i, rim + i + 1);
      else geometry.indices.push(centre, rim + i + 1, rim + i);
    }
  }
  return geometry;
}

/** A UV sphere. Used for the radome, which is why it is smooth-shaded. */
function sphere(radius, segments = 28, rings = 16) {
  const geometry = empty();
  for (let ring = 0; ring <= rings; ring += 1) {
    const phi = (ring / rings) * Math.PI;
    for (let segment = 0; segment <= segments; segment += 1) {
      const theta = (segment / segments) * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(theta);
      geometry.positions.push(x * radius, y * radius, z * radius);
      geometry.normals.push(x, y, z);
    }
  }
  const stride = segments + 1;
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = ring * stride + segment;
      geometry.indices.push(a, a + stride, a + stride + 1, a, a + stride + 1, a + 1);
    }
  }
  return geometry;
}

/**
 * A parabolic dish: the antenna's reflector, with a rim so it is solid from
 * behind. y = (r^2 / (4f)) describes the paraboloid; `depth` sets the focus.
 */
function dish(radius, depth, segments = 28, rings = 8) {
  const geometry = empty();
  const focal = (radius * radius) / (4 * depth);
  const surfaceY = (r) => (r * r) / (4 * focal);

  // Concave front face.
  for (let ring = 0; ring <= rings; ring += 1) {
    const r = (ring / rings) * radius;
    for (let segment = 0; segment <= segments; segment += 1) {
      const theta = (segment / segments) * Math.PI * 2;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      geometry.positions.push(x, surfaceY(r), z);
      // Normal of the paraboloid, pointing into the dish.
      const slope = r / (2 * focal);
      const nx = -Math.cos(theta) * slope;
      const nz = -Math.sin(theta) * slope;
      const length = Math.hypot(nx, 1, nz);
      geometry.normals.push(nx / length, 1 / length, nz / length);
    }
  }
  const stride = segments + 1;
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = ring * stride + segment;
      geometry.indices.push(a, a + 1, a + stride + 1, a, a + stride + 1, a + stride);
    }
  }

  // Convex back face: the same surface offset downwards, wound the other way.
  const backStart = geometry.positions.length / 3;
  const thickness = radius * 0.035;
  for (let ring = 0; ring <= rings; ring += 1) {
    const r = (ring / rings) * radius;
    for (let segment = 0; segment <= segments; segment += 1) {
      const theta = (segment / segments) * Math.PI * 2;
      geometry.positions.push(Math.cos(theta) * r, surfaceY(r) - thickness, Math.sin(theta) * r);
      const slope = r / (2 * focal);
      const nx = Math.cos(theta) * slope;
      const nz = Math.sin(theta) * slope;
      const length = Math.hypot(nx, 1, nz);
      geometry.normals.push(nx / length, -1 / length, nz / length);
    }
  }
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = backStart + ring * stride + segment;
      geometry.indices.push(a, a + stride + 1, a + 1, a, a + stride, a + stride + 1);
    }
  }

  // Rim joining the two surfaces.
  const rimFront = rings * stride;
  const rimBack = backStart + rings * stride;
  for (let segment = 0; segment < segments; segment += 1) {
    const f = rimFront + segment;
    const b = rimBack + segment;
    geometry.indices.push(f, b, b + 1, f, b + 1, f + 1);
  }
  return geometry;
}

/** A cone, point upwards by default: the feed horn at the dish focus. */
function cone(radius, height, segments = 16) {
  const geometry = empty();
  const half = height / 2;
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    const b = ((i + 1) / segments) * Math.PI * 2;
    const p1 = [Math.cos(a) * radius, -half, Math.sin(a) * radius];
    const p2 = [Math.cos(b) * radius, -half, Math.sin(b) * radius];
    const apex = [0, half, 0];
    const edgeA = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    const edgeB = [apex[0] - p1[0], apex[1] - p1[1], apex[2] - p1[2]];
    const normal = [edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1], edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2], edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0]];
    const length = Math.hypot(...normal) || 1;
    const unit = normal.map((value) => value / length);
    const start = geometry.positions.length / 3;
    for (const point of [p1, p2, apex]) {
      geometry.positions.push(...point);
      geometry.normals.push(...unit);
    }
    geometry.indices.push(start, start + 1, start + 2);
  }
  return geometry;
}

// ---------------------------------------------------------------------------------------------
// glTF assembly
// ---------------------------------------------------------------------------------------------

/**
 * Writes a .glb from a list of named parts, one mesh and one material each.
 * A material per part is what lets the application highlight a single
 * component at runtime without touching the others.
 */
function buildGlb(parts, { generator, copyright }) {
  const json = {
    asset: { version: '2.0', generator, copyright },
    scene: 0,
    scenes: [{ nodes: parts.map((_, index) => index) }],
    nodes: [],
    meshes: [],
    materials: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
  };

  const chunks = [];
  let offset = 0;
  const addBufferView = (data, target) => {
    // Accessor data must start on a multiple of its component size; 4 satisfies both float and ushort.
    const padding = (4 - (offset % 4)) % 4;
    if (padding > 0) {
      chunks.push(Buffer.alloc(padding));
      offset += padding;
    }
    chunks.push(data);
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length, target });
    offset += data.length;
    return json.bufferViews.length - 1;
  };

  parts.forEach((part, index) => {
    const { geometry, material, name } = part;

    const positions = Float32Array.from(geometry.positions);
    const normals = Float32Array.from(geometry.normals);
    const indices = Uint16Array.from(geometry.indices);
    if (geometry.positions.length / 3 > 65535) throw new Error(`${name} needs more than 16-bit indices`);

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], positions[i + axis]);
        max[axis] = Math.max(max[axis], positions[i + axis]);
      }
    }

    const positionView = addBufferView(Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength), 34962);
    const normalView = addBufferView(Buffer.from(normals.buffer, normals.byteOffset, normals.byteLength), 34962);
    const indexView = addBufferView(Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength), 34963);

    const positionAccessor = json.accessors.push({ bufferView: positionView, componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max }) - 1;
    const normalAccessor = json.accessors.push({ bufferView: normalView, componentType: 5126, count: normals.length / 3, type: 'VEC3' }) - 1;
    const indexAccessor = json.accessors.push({ bufferView: indexView, componentType: 5123, count: indices.length, type: 'SCALAR' }) - 1;

    const materialIndex = json.materials.push({ name, doubleSided: Boolean(material.doubleSided), ...material.definition }) - 1;
    const meshIndex = json.meshes.push({ name, primitives: [{ attributes: { POSITION: positionAccessor, NORMAL: normalAccessor }, indices: indexAccessor, material: materialIndex }] }) - 1;
    json.nodes.push({ name, mesh: meshIndex });
    void index;
  });

  const binary = Buffer.concat(chunks);
  json.buffers.push({ byteLength: binary.length });

  const jsonChunk = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadded = Buffer.concat([jsonChunk, Buffer.alloc((4 - (jsonChunk.length % 4)) % 4, 0x20)]);
  const binPadded = Buffer.concat([binary, Buffer.alloc((4 - (binary.length % 4)) % 4, 0)]);

  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binPadded.length, 8);

  const chunkHeader = (length, type) => {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE(length, 0);
    buffer.write(type, 4, 'ascii');
    return buffer;
  };

  return Buffer.concat([header, chunkHeader(jsonPadded.length, 'JSON'), jsonPadded, chunkHeader(binPadded.length, 'BIN\0'), binPadded]);
}

/** Convenience for the common material shape. */
const pbr = (colour, { metallic = 0.2, roughness = 0.6, opacity = 1 } = {}) => ({
  definition: {
    pbrMetallicRoughness: { baseColorFactor: [...colour, opacity], metallicFactor: metallic, roughnessFactor: roughness },
    ...(opacity < 1 ? { alphaMode: 'BLEND' } : {}),
  },
  doubleSided: opacity < 1,
});

// ---------------------------------------------------------------------------------------------
// The Doppler weather radar
// ---------------------------------------------------------------------------------------------

/**
 * Part names match `ARComponent.key` in the database, so a component in the
 * lesson can be tied to the material the viewer highlights.
 */
function dopplerRadar() {
  const TOWER_HEIGHT = 0.8;
  const PLATFORM_Y = TOWER_HEIGHT; // the tower is centred on TOWER_HEIGHT / 2
  const DISH_RADIUS = 0.16;

  const antenna = empty();
  // The reflector, tilted back so it reads as "looking up" rather than straight at the sky.
  merge(antenna, translate(rotateX(dish(DISH_RADIUS, 0.05, 28, 8), -Math.PI / 2.9), [0, PLATFORM_Y + 0.2, 0.015]));
  // The feed horn sits at the focus, pointing back into the dish.
  merge(antenna, translate(rotateX(cone(0.02, 0.06, 14), Math.PI / 2.9), [0, PLATFORM_Y + 0.225, -0.062]));
  // Two support struts from the dish rim to the feed horn.
  for (const side of [-1, 1]) {
    merge(antenna, translate(rotateX(box(0.007, 0.14, 0.007), -0.35 * side + 0.25), [side * 0.07, PLATFORM_Y + 0.222, -0.032]));
  }

  return [
    {
      name: 'base',
      geometry: translate(cylinder(0.26, 0.035, 28), [0, 0.0175, 0]),
      material: pbr([0.74, 0.75, 0.77], { metallic: 0.05, roughness: 0.95 }),
    },
    {
      name: 'controlUnit',
      geometry: translate(box(0.22, 0.15, 0.17), [0.27, 0.075 + 0.035, 0.05]),
      material: pbr([0.16, 0.26, 0.42], { metallic: 0.25, roughness: 0.5 }),
    },
    {
      name: 'tower',
      geometry: translate(taperedBox(0.185, 0.1, TOWER_HEIGHT), [0, TOWER_HEIGHT / 2 + 0.035, 0]),
      material: pbr([0.58, 0.61, 0.65], { metallic: 0.8, roughness: 0.45 }),
    },
    {
      name: 'platform',
      geometry: translate(box(0.25, 0.02, 0.25), [0, PLATFORM_Y + 0.045, 0]),
      material: pbr([0.45, 0.48, 0.52], { metallic: 0.6, roughness: 0.55 }),
    },
    {
      name: 'receiver',
      geometry: translate(box(0.09, 0.07, 0.07), [-0.082, PLATFORM_Y + 0.09, 0.075]),
      material: pbr([0.2, 0.34, 0.5], { metallic: 0.4, roughness: 0.4 }),
    },
    {
      name: 'rotator',
      geometry: translate(cylinder(0.05, 0.07, 22), [0, PLATFORM_Y + 0.09, 0]),
      material: pbr([0.85, 0.6, 0.18], { metallic: 0.7, roughness: 0.4 }),
    },
    {
      name: 'antenna',
      geometry: antenna,
      material: pbr([0.88, 0.89, 0.92], { metallic: 0.85, roughness: 0.25 }),
    },
    {
      name: 'radome',
      // Encloses the antenna, as it does on a real installation. Translucent so the
      // dish inside stays visible: a trainee has to be able to see what it protects.
      geometry: translate(sphere(0.195, 30, 18), [0, PLATFORM_Y + 0.21, 0]),
      material: pbr([0.95, 0.96, 0.98], { metallic: 0, roughness: 0.15, opacity: 0.28 }),
    },
  ];
}

// ---------------------------------------------------------------------------------------------

const parts = dopplerRadar();
const glb = buildGlb(parts, {
  generator: 'Capacity Connect build-ar-models.mjs',
  copyright: 'Original work created for Capacity Connect (IMD). Schematic, not to scale.',
});

const outputDir = path.join(root, 'frontend', 'public', 'models');
mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, 'doppler-radar.glb');
writeFileSync(outputPath, glb);

const triangles = parts.reduce((sum, part) => sum + part.geometry.indices.length / 3, 0);
const vertices = parts.reduce((sum, part) => sum + part.geometry.positions.length / 3, 0);
console.log(`doppler-radar.glb  ${(glb.length / 1024).toFixed(1)} KB  ${parts.length} parts  ${vertices} vertices  ${triangles} triangles`);
console.log(`  parts: ${parts.map((part) => part.name).join(', ')}`);
console.log(`  written to ${path.relative(root, outputPath)}`);
