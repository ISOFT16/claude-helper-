/* ================= LOD бойцов ================= */
// Модели бойцов детальные (~45 тыс. треугольников и ~75 мешей у каждого), поэтому:
//  • мелкие детали (радиус < 3,5 см: винты, планки, клапаны) видны только вблизи (до 14 м);
//  • дальше 30 м боец не отбрасывает тень (минус проход теней);
//  • оружие у бойцов тень не отбрасывает никогда — она почти не видна, а стоит дорого;
//  • поза бойца за кадром не пересчитывается, вдали — через кадр (положение и звук шагов — всегда).
const LOD_NEAR = 14, LOD_FAR = 30, _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();
let lodFrame = 0;
function markRigDetail(R) {
  R.root.traverse(o => {
    if (!o.isMesh || o.userData.lodTagged) return;
    o.userData.lodTagged = true;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    let inGun = false; for (let p = o; p; p = p.parent) if (p === R.gunHolder) { inGun = true; break; }
    o.userData.detail = o.geometry.boundingSphere.radius < 0.035 && !o.userData.isHat;
    o.userData.noShadow = inGun || o.userData.detail || !!o.userData.gear;
  });
  R.lod = -1;
}
function applyRigLOD(R, level) {
  R.lod = level;
  R.root.traverse(o => {
    if (!o.isMesh) return;
    if (!o.userData.lodTagged) { markRigDetail(R); }
    if (o.userData.detail) o.visible = level === 0;
    o.castShadow = SET.charShadows && level < 2 && !o.userData.noShadow;
  });
}
function updateLOD() {
  lodFrame++;
  camera.updateMatrixWorld(); _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _frustum.setFromProjectionMatrix(_pm);
  for (const a of agents) {
    const R = a.rig; if (!R) continue;
    if (!a.model.visible) { R.lodSkip = false; continue; }
    const d = camera.position.distanceTo(a.pos), level = d < LOD_NEAR ? 0 : d < LOD_FAR ? 1 : 2;
    if (R.lod !== level || R.lodDirty) { R.lodDirty = false; applyRigLOD(R, level); }
    _sph.center.set(a.pos.x, a.pos.y + 0.9, a.pos.z); _sph.radius = 1.4;
    const inView = _frustum.intersectsSphere(_sph);
    R.lodSkip = a.alive && (!inView || (level === 2 && (lodFrame & 1) === 1));
  }
}
