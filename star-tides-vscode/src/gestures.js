// Landmarks use mirrored normalized coordinates, matching the supplied Infinity Room project.
export function readGesture(points, baselineWidth = 0) {
  const neutral = { body: 'neutral', x: 0, y: 0, tracked: false, shoulderWidth: 0 };
  if (!points || ![11, 12, 13, 14, 15, 16].every(i => {
    const p = points[i];
    return p && (p.visibility ?? 1) > .55 && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1;
  })) return neutral;
  const [ls, rs, le, re, lw, rw] = [11, 12, 13, 14, 15, 16].map(i => points[i]);
  const width = Math.hypot(ls.x-rs.x, ls.y-rs.y);
  if (width < .06) return neutral;
  // Current shoulder scale makes recognition independent of distance from the camera.
  // Calibration slightly stabilizes the scale without preventing stepping closer or farther away.
  const scale = baselineWidth > 0 ? width * .8 + Math.min(width*1.2, Math.max(width*.8, baselineWidth))*.2 : width;
  const center = { x:(ls.x+rs.x)/2, y:(ls.y+rs.y)/2 + scale*.5 };
  const wrists = [lw, rw].map(p => ({ x:(p.x-center.x)/scale, y:(p.y-center.y)/scale }));
  const dx = wrists.every(p => p.x > .55) ? 1 : wrists.every(p => p.x < -.55) ? -1 : 0;
  const dy = wrists.every(p => p.y < -.85) ? -1 : wrists.every(p => p.y > 1.25) ? 1 : 0;
  const span = Math.abs(lw.x-rw.x)/scale;
  const elbowSpan = Math.abs(le.x-re.x)/scale;
  let body = 'neutral';
  if (!dx && !dy) {
    if (span > 2.35 && elbowSpan > 1.25) body = 'split';
    else if (span < .85 && elbowSpan < 1.75 && wrists.every(p => Math.abs(p.x)<.8 && p.y>-.7 && p.y<1.2)) body = 'merge';
  }
  const magnitude = Math.hypot(dx,dy) || 1;
  return {body,x:dx/magnitude,y:dy/magnitude,tracked:true,shoulderWidth:width};
}

