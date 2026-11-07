/* ================= main loop ================= */
function updateGame(dt) {
  if (G.state === 'lobby') lobbyTick(dt);
  else if (G.state === 'freeze') { G.timer -= dt; if (G.timer <= 0) { G.state = 'live'; G.timer = ROUND_TIME; goFx(); netEvent({ k: 'go' }); } }
  else if (G.state === 'live') {
    G.timer -= dt; G.liveT += dt;
    if (G.liveT >= ZONE_OPEN && G.liveT - dt < ZONE_OPEN) { zoneOpenFx(); netEvent({ k: 'zo' }); }
    if (G.liveT >= ZONE_OPEN) {
      const n = [0, 0]; for (const a of agents) if (a.alive && inZone(a.pos)) n[a.team]++;
      if (!(n[0] && n[1]) && (n[0] || n[1])) {
        const tm = n[0] ? 0 : 1; G.prog[tm] = Math.min(1, G.prog[tm] + dt / CAP_TIME * (1 + 0.25 * (n[tm] - 1)));
        if (Math.floor(now * 2) !== Math.floor((now - dt) * 2)) tone(tm ? 420 : 640, 0.05, 'sine', 0.05);
        if (G.prog[tm] >= 1) endRound(tm, 'rCap');
      }
    }
    if (G.timer <= 0 && G.state === 'live') {
      const al = [0, 1].map(tm => agents.filter(a => a.team === tm && a.alive).length);
      const w = G.prog[0] !== G.prog[1] ? (G.prog[0] > G.prog[1] ? 0 : 1) : al[0] !== al[1] ? (al[0] > al[1] ? 0 : 1) : -1;
      endRound(w, 'rTime');
    }
  } else if (G.state === 'end') {
    G.timer -= dt;
    if (G.timer <= 0) {
      if (G.over) {
        G.state = 'over'; showOver();
      } else startRound();
    }
  }
  zoneVisual(dt);
  updatePlayer(dt);
  for (const a of agents) {
    if (a.net === 'bot') updateBot(a, dt); else if (a.net === 'remote') followNet(a, dt);
    a.spot[0] -= dt; a.spot[1] -= dt;
  }
  if (!P.alive && P.rig.deadT < 3) animateSoldier(P, dt);
  localSpot(dt);
  separate();
  updateNades(dt);
  updateSmokes(dt);
  if (NET.mode === 'host') hostCheckTeams();
  updateFx(dt);
}
function zoneVisual(dt) {
  ring.rotation.z += dt * 0.8; ring.position.y = 1.5 + Math.sin(now * 2) * 0.2;
  if ((G.state === 'live' || G.state === 'end') && G.liveT >= ZONE_OPEN) {
    const n = [0, 0]; for (const a of agents) if (a.alive && inZone(a.pos)) n[a.team]++;
    const col = n[0] && n[1] ? 0xffffff : n[0] ? 0x4fb3ff : n[1] ? 0xff8a3d : 0xc7a6ff;
    zoneMat.color.setHex(col); beamMat.color.setHex(col); ring.material.color.setHex(col); zoneEdge.material.color.setHex(col); zoneLight.color.setHex(col);
    beamMat.opacity = 0.25 + Math.sin(now * 4) * 0.08;
  } else { beamMat.opacity = 0.06; for (const m of [zoneMat, beamMat, ring.material, zoneEdge.material]) m.color.setHex(0x6a5a90); zoneLight.color.setHex(0x6a5a90); }
}
let spotT = 0;
function localSpot(dt) {
  spotT -= dt; if (spotT > 0 || !P.alive) return; spotT = 0.2;
  for (const e of agents) if (e.alive && e.team !== P.team && e.pos.distanceTo(P.pos) < 75 && canSee(P, e)) e.spot[P.team] = 1.2;
}
function updateCamera(dt) {
  if (window.__camOverride) { window.__camOverride(camera, dt); return; }
  if (P.alive) {
    camera.position.set(P.pos.x, P.pos.y + P.eye, P.pos.z);
    camera.rotation.set(P.pitch + P.punchP, P.yaw + P.punchY, 0);
    for (const a of agents) a.model.visible = active(a) && (!a.alive || a !== P);
  } else {
    if (!specTarget || !specTarget.alive) nextSpec();
    const st = specTarget;
    for (const a of agents) a.model.visible = active(a) && (a !== st || !a.alive);
    if (st) { camera.position.set(st.pos.x, st.pos.y + 1.62, st.pos.z); camera.rotation.set(st.pitch, st.yaw, 0); }
  }
  if (shake > 0) { shake -= dt; camera.rotation.x += rand(-1, 1) * shake * 0.05; camera.rotation.y += rand(-1, 1) * shake * 0.05; }
  const targetFov = P.scoped && P.alive ? (P.w().zoom || 20) : SET.fov;
  if (camera.fov !== targetFov) { camera.fov = targetFov; camera.updateProjectionMatrix(); }
  if (P.alive) updateViewmodel(dt);
}
let last = performance.now(), fpsFrames = 0, fpsT = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  // ограничение FPS: пропускаем кадр, если он пришёл раньше срока
  if (SET.fpsLimit > 0 && ts - last < 1000 / SET.fpsLimit - 1) return;
  const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
  fpsFrames++; fpsT += dt;
  if (fpsT >= 0.5) { if (SET.showFps) $('fps').textContent = Math.round(fpsFrames / fpsT) + ' FPS'; fpsFrames = 0; fpsT = 0; }
  if (G.started && (!G.paused || NET.mode !== 'off')) {
    if (NET.mode === 'client') { now += dt; clientUpdate(dt); }
    else if (G.state !== 'over') { now += dt; updateGame(dt); }
    if (NET.mode === 'host') hostTick(dt);
  }
  if (joy.id === null) joy.x = joy.y = 0;
  if (G.started) { updateCamera(dt); updateHUD(dt); }
  else { now += dt; updateSmokes(dt); camera.position.set(zone.cx + Math.sin(now * 0.08) * 34, 16, zone.cz + Math.cos(now * 0.08) * 22); camera.lookAt(zone.cx, 0, zone.cz); ring.rotation.z += dt; }
  renderer.clear(); renderer.render(scene, camera);
  if (G.started && P.alive && !P.scoped && !window.__camOverride) { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
}
requestAnimationFrame(frame);

