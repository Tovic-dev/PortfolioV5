// Builds models/*.glb from the SolidWorks exports in models/*.gltf.js.
// - bakes the 32° feature edges the site draws, as an extra LINES primitive per mesh,
//   so the browser no longer runs THREE.EdgesGeometry on load
// - Draco-compresses the triangle geometry (decoded in a Web Worker by DRACOLoader)
// No quantization: index.html resets node transforms when it splits a model into parts.
//
//   cd tools && npm install && npm run models
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import * as THREE from 'three';

const MODELS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../models');
const EDGE_ANGLE = 32; // must match the threshold in index.html (fromGLB)

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule() });

for (const name of ['seat', 'ardura', 'orbea']) {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(MODELS, name + '.gltf.js'), 'utf8'), ctx);
  const doc = await io.readJSON({ json: ctx.window.__GLTF[name], resources: {} });
  const buffer = doc.getRoot().listBuffers()[0];

  let edges = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== Primitive.Mode.TRIANGLES) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(prim.getAttribute('POSITION').getArray(), 3));
      const idx = prim.getIndices();
      if (idx) geo.setIndex(new THREE.BufferAttribute(idx.getArray(), 1));
      const lines = new THREE.EdgesGeometry(geo, EDGE_ANGLE).getAttribute('position').array;
      const acc = doc.createAccessor().setType('VEC3').setArray(new Float32Array(lines)).setBuffer(buffer);
      mesh.addPrimitive(doc.createPrimitive().setMode(Primitive.Mode.LINES).setAttribute('POSITION', acc));
      edges += lines.length / 6;
    }
  }

  await doc.transform(draco({ method: 'edgebreaker' }));
  const glb = await io.writeBinary(doc);
  fs.writeFileSync(path.join(MODELS, name + '.glb'), glb);
  console.log(`${name}.glb  ${(glb.byteLength / 1048576).toFixed(2)} MB  ${edges} edges`);
}
