import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import StarSystem from "../components/StarSystem";

const INITIAL_STATE = {
  habits: { new: [], old: [] },
  totals: {},
  todayEntries: [],
  recentEntries: [],
  weekData: [],
  historyDays: [],
  lastSeen: {},
  score: { score: 0, breakdown: [], werktag: true, kategorie: "neutral" },
  callStreak: 0,
  stats: {
    daysLeft: 365,
    daysTotal: 365,
    streak: 0,
    direction: { symbol: "—", tone: "dim", text: "noch keine Daten" },
  },
};

const isDevMode = process.env.NEXT_PUBLIC_TRACKER_DEV_MODE === "true";
const MOTION_BURST_MS = 9000;
const ACTIVE_FPS = 30;
const IDLE_FPS = 10;
const REDUCED_FPS = 6;
const REPLAY_STEP_MS = 720;
const DEFAULT_VISUAL_MODE = "stark";
const VISUAL_MODES = {
  stark: { label: "Stark", intensity: 1, motion: 1, scoreBias: 1 },
  brutal: { label: "Brutal", intensity: 1.22, motion: 1.12, scoreBias: 1.28 },
};
const SCORE_TILT = {
  gold: 1,
  gruen2: 0.66,
  gruen: 0.42,
  gelb: 0.14,
  neutral: 0,
  rot: -0.48,
  tiefrot: -0.92,
};

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hasReplayFlag(value) {
  if (Array.isArray(value)) {
    return value.includes("1");
  }

  return value === "1";
}

function getVisualProfile(scoreData, mode = DEFAULT_VISUAL_MODE) {
  const config = VISUAL_MODES[mode] || VISUAL_MODES[DEFAULT_VISUAL_MODE];
  const categoryTilt = SCORE_TILT[scoreData?.kategorie] || 0;
  const numericTilt = clampNumber((Number(scoreData?.score) || 0) / 24, -1, 1) * 0.35;
  const scoreTilt = clampNumber((categoryTilt + numericTilt) * config.scoreBias, -1.2, 1.2);

  return {
    ...config,
    key: mode,
    scoreTilt,
  };
}

function formatHeaderDate(date = new Date()) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatEntryTimestamp(date, time) {
  if (!date && !time) {
    return "";
  }

  if (!date) {
    return time;
  }

  const [year, month, day] = date.split("-");
  const displayDate = `${day}.${month}.${year}`;
  return time ? `${displayDate} · ${time}` : displayDate;
}

function drawTextWithHalo(context, text, x, y, {
  font,
  align = "center",
  fillStyle,
  strokeStyle = "rgba(5,5,5,0.96)",
  strokeWidth = 4,
  shadowColor = "rgba(0,0,0,0.55)",
  shadowBlur = 8,
}) {
  context.save();
  context.font = font;
  context.textAlign = align;
  context.textBaseline = "middle";
  context.strokeStyle = strokeStyle;
  context.lineWidth = strokeWidth;
  context.strokeText(text, x, y);
  context.fillStyle = fillStyle;
  context.shadowColor = shadowColor;
  context.shadowBlur = shadowBlur;
  context.fillText(text, x, y);
  context.restore();
}


function drawFire(ctx, x, y, time, streak, motionLevel = 1) {
  const liveMotion = 0.25 + motionLevel * 0.75;
  const animationTime = time * liveMotion;
  const intensity = Math.min((0.5 + streak * 0.1) * (0.65 + motionLevel * 0.35), 1.5);
  const particles = Math.max(3, Math.round(Math.min(6 + streak, 14) * (0.45 + motionLevel * 0.55)));
  for (let i = 0; i < particles; i++) {
    const phase = (animationTime * 0.0018 + i * 0.63) % 1;
    const px = x + Math.sin(animationTime * 0.0025 + i * 2.4) * 3.5 * intensity;
    const py = y - phase * 22 * intensity;
    const size = (1 - phase) * 3.2 * intensity;
    const alpha = (1 - phase) * 0.85;
    const green = Math.floor(40 + phase * 120);
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,${green},0,${alpha})`;
    ctx.shadowColor = "#ff4400";
    ctx.shadowBlur = 10 * intensity;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function oldHabitDecay(lastSeenDate) {
  if (!lastSeenDate) return 0.18;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last = new Date(lastSeenDate);
  last.setHours(0, 0, 0, 0);
  const days = Math.round((today - last) / 86400000);
  if (days === 0) return 1.0;
  if (days <= 3) return 0.82;
  if (days <= 7) return 0.6;
  if (days <= 14) return 0.4;
  if (days <= 30) return 0.22;
  return 0.1;
}

function drawThreadFlow(context, centerX, centerY, spoke, count, time, motionLevel, isCompact, intensity = 1) {
  const pulseCount = Math.max(1, Math.min(3, Math.round(Math.log(count + 1) * 1.15)));
  const speed = 0.00005 + motionLevel * 0.000035 * intensity;

  for (let index = 0; index < pulseCount; index += 1) {
    const phase = (time * speed + index / pulseCount + spoke.radians * 0.08) % 1;
    const progress = 0.16 + phase * 0.78;
    const x = centerX + (spoke.endX - centerX) * progress;
    const y = centerY + (spoke.endY - centerY) * progress;
    const radius = ((isCompact ? 1.4 : 1.9) + (1 - phase) * 1.8) * (0.92 + intensity * 0.1);
    const alpha = 0.12 + (1 - phase) * (0.28 + intensity * 0.06);

    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = `rgba(255,232,176,${alpha})`;
    context.shadowColor = "#f0d080";
    context.shadowBlur = 8 + (1 - phase) * (9 + intensity * 3);
    context.fill();
    context.shadowBlur = 0;
  }
}

function drawCollapseShadow(context, centerX, centerY, baseRadius, collapseFactor, time, motionLevel, menace = 1) {
  const sinkY = centerY + baseRadius * 0.52 + collapseFactor * 10;
  const sinkWidth = baseRadius * (0.5 + collapseFactor * 0.08) * (0.96 + menace * 0.08);
  const sinkHeight = baseRadius * (0.14 + collapseFactor * 0.035) * (0.94 + menace * 0.12);
  const drift = Math.sin(time * (0.0005 + motionLevel * 0.0008 * menace)) * (2.2 + collapseFactor * 1.5 + menace * 1.2);

  const sinkGlow = context.createRadialGradient(centerX, sinkY, baseRadius * 0.05, centerX, sinkY, baseRadius * 0.62);
  sinkGlow.addColorStop(0, `rgba(204,68,68,${0.14 + collapseFactor * 0.08 + menace * 0.05})`);
  sinkGlow.addColorStop(0.42, `rgba(126,22,22,${0.1 + collapseFactor * 0.05 + menace * 0.03})`);
  sinkGlow.addColorStop(1, "rgba(0,0,0,0)");
  context.beginPath();
  context.ellipse(centerX, sinkY, sinkWidth, sinkHeight * 2.2, 0, 0, Math.PI * 2);
  context.fillStyle = sinkGlow;
  context.fill();

  for (let index = 0; index < 4; index += 1) {
    context.beginPath();
    context.ellipse(
      centerX + drift * (index - 1) * 0.7,
      sinkY + index * 4,
      sinkWidth * (1 - index * 0.12),
      sinkHeight * (1 + index * 0.16),
      0,
      0,
      Math.PI * 2
    );
    context.strokeStyle = `rgba(204,68,68,${0.08 + collapseFactor * 0.04 + menace * 0.03 - index * 0.012})`;
    context.lineWidth = 0.8 + index * 0.12;
    context.stroke();
  }

  for (let index = 0; index < 3; index += 1) {
    const tendrilX = centerX + (index - 1) * sinkWidth * 0.4 + drift * 0.5;
    context.beginPath();
    context.moveTo(tendrilX, sinkY - sinkHeight * 0.35);
    context.quadraticCurveTo(
      tendrilX + drift * 1.6,
      sinkY + sinkHeight * (0.8 + index * 0.3),
      tendrilX - drift * 0.7,
      sinkY + sinkHeight * (2.3 + index * 0.35)
    );
    context.strokeStyle = `rgba(126,22,22,${0.14 + collapseFactor * 0.04 + menace * 0.03 - index * 0.025})`;
    context.lineWidth = 1.1 - index * 0.18;
    context.stroke();
  }
}

function drawConflictMembrane(context, centerX, centerY, baseRadius, time, motionLevel, scoreTilt, visualIntensity, goldPressure, redPressure) {
  const width = baseRadius * (0.19 + visualIntensity * 0.035 + (goldPressure + redPressure) * 0.04);
  const height = baseRadius * (0.14 + redPressure * 0.06 + goldPressure * 0.03);
  const lift = -scoreTilt * baseRadius * 0.085;
  const sway = Math.sin(time * (0.00055 + motionLevel * 0.0007)) * baseRadius * 0.018;
  const pinch = baseRadius * (0.04 + Math.abs(scoreTilt) * 0.025);
  const left = { x: centerX - width, y: centerY + sway * 0.55 };
  const right = { x: centerX + width, y: centerY - sway * 0.55 };
  const top = { x: centerX + sway * 0.45, y: centerY - height + lift - pinch * 0.5 };
  const bottom = { x: centerX - sway * 0.55, y: centerY + height + lift + pinch + redPressure * baseRadius * 0.05 };
  const membraneGradient = context.createLinearGradient(left.x, top.y, right.x, bottom.y);
  membraneGradient.addColorStop(0, `rgba(240,208,128,${0.08 + goldPressure * 0.06})`);
  membraneGradient.addColorStop(0.48, `rgba(154,118,82,${0.09 + visualIntensity * 0.03})`);
  membraneGradient.addColorStop(1, `rgba(220,92,92,${0.08 + redPressure * 0.07})`);

  context.beginPath();
  context.moveTo(left.x, left.y);
  context.bezierCurveTo(
    centerX - width * 0.28,
    top.y + pinch,
    centerX - width * 0.06,
    top.y,
    top.x,
    top.y
  );
  context.bezierCurveTo(
    centerX + width * 0.08,
    top.y,
    centerX + width * 0.32,
    top.y + pinch,
    right.x,
    right.y
  );
  context.bezierCurveTo(
    centerX + width * 0.3,
    bottom.y - pinch,
    centerX + width * 0.04,
    bottom.y,
    bottom.x,
    bottom.y
  );
  context.bezierCurveTo(
    centerX - width * 0.1,
    bottom.y,
    centerX - width * 0.34,
    bottom.y - pinch,
    left.x,
    left.y
  );
  context.closePath();
  context.fillStyle = membraneGradient;
  context.shadowColor = scoreTilt >= 0 ? "rgba(201,168,76,0.22)" : "rgba(204,68,68,0.24)";
  context.shadowBlur = 14 + visualIntensity * 4;
  context.fill();
  context.shadowBlur = 0;

  context.beginPath();
  context.moveTo(left.x, left.y);
  context.quadraticCurveTo(centerX, top.y - pinch * 0.2, right.x, right.y);
  context.strokeStyle = `rgba(240,208,128,${0.11 + goldPressure * 0.08})`;
  context.lineWidth = 0.9 + visualIntensity * 0.1;
  context.stroke();

  context.beginPath();
  context.moveTo(left.x, left.y);
  context.quadraticCurveTo(centerX, bottom.y + pinch * 0.15, right.x, right.y);
  context.strokeStyle = `rgba(255,140,140,${0.11 + redPressure * 0.08})`;
  context.lineWidth = 0.9 + visualIntensity * 0.1;
  context.stroke();
}

function drawBridgeThreads(context, centerX, centerY, baseRadius, newSpokes, oldSpokes, totals, time, motionLevel, visualIntensity, goldPressure, redPressure) {
  if (!newSpokes.length || !oldSpokes.length) {
    return;
  }

  const rankedNew = [...newSpokes]
    .map((spoke) => ({ ...spoke, count: totals[spoke.id] || 0 }))
    .sort((left, right) => right.count - left.count)
    .slice(0, Math.min(4, newSpokes.length));
  const rankedOld = [...oldSpokes]
    .map((spoke) => ({ ...spoke, count: totals[spoke.id] || 0 }))
    .sort((left, right) => right.count - left.count)
    .slice(0, Math.min(4, oldSpokes.length));
  const bridgeCount = Math.min(Math.max(2, Math.min(rankedNew.length, rankedOld.length)), 4);

  for (let index = 0; index < bridgeCount; index += 1) {
    const source = rankedNew[index % rankedNew.length];
    const target = rankedOld[index % rankedOld.length];
    const sourceCount = source.count;
    const targetCount = target.count;
    const sharedStrength = Math.sqrt((sourceCount + 0.5) * (targetCount + 0.5));
    const startFactor = 0.34 + index * 0.04;
    const endFactor = 0.36 + index * 0.035;
    const startX = centerX + Math.cos(source.radians) * (baseRadius * startFactor);
    const startY = centerY + Math.sin(source.radians) * (baseRadius * startFactor);
    const endX = centerX + Math.cos(target.radians) * (baseRadius * endFactor);
    const endY = centerY + Math.sin(target.radians) * (baseRadius * endFactor) + target.downwardDrag * endFactor;
    const bridgeSway = Math.sin(time * (0.00045 + motionLevel * 0.0007) + index * 0.9) * baseRadius * 0.025;
    const controlX = centerX + bridgeSway + (index - (bridgeCount - 1) / 2) * baseRadius * 0.025;
    const controlY = centerY + redPressure * baseRadius * 0.06 - goldPressure * baseRadius * 0.03 + (index % 2 === 0 ? -1 : 1) * baseRadius * 0.035;
    const alpha = Math.min(0.08 + sharedStrength * 0.008 + visualIntensity * 0.02, 0.24);
    const bridgeGradient = context.createLinearGradient(startX, startY, endX, endY);
    bridgeGradient.addColorStop(0, `rgba(240,208,128,${alpha * (1 + goldPressure * 0.25)})`);
    bridgeGradient.addColorStop(0.5, `rgba(156,118,84,${alpha * 0.9})`);
    bridgeGradient.addColorStop(1, `rgba(255,140,140,${alpha * (1 + redPressure * 0.3)})`);

    context.beginPath();
    context.moveTo(startX, startY);
    context.quadraticCurveTo(controlX, controlY, endX, endY);
    context.strokeStyle = bridgeGradient;
    context.lineWidth = 0.55 + Math.min(sharedStrength * 0.08, 0.95);
    context.shadowColor = "rgba(120,92,64,0.3)";
    context.shadowBlur = 4 + sharedStrength * 0.3;
    context.stroke();
    context.shadowBlur = 0;

    const midpointX = ((startX + endX) / 2 + controlX) / 2;
    const midpointY = ((startY + endY) / 2 + controlY) / 2;
    context.beginPath();
    context.arc(midpointX, midpointY, 1.2 + Math.min(sharedStrength * 0.08, 1.4), 0, Math.PI * 2);
    context.fillStyle = `rgba(214,184,132,${0.14 + alpha * 0.8})`;
    context.shadowColor = "rgba(214,184,132,0.28)";
    context.shadowBlur = 6;
    context.fill();
    context.shadowBlur = 0;
  }
}

function drawWeb(canvas, habits, totals, lastSeen, stats, todayEntries, callStreak = 0, time = 0, flash = null, motionLevel = 1, visualProfile = VISUAL_MODES[DEFAULT_VISUAL_MODE]) {
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");
  const containerWidth = Math.max(Math.min(canvas.parentElement?.clientWidth || 500, 900), 280);
  const size = Math.round(containerWidth);
  const pixelRatio = window.devicePixelRatio || 1;
  const baseCenterX = size / 2;
  const baseCenterY = size / 2;
  const rings = 8;
  const baseRadius = Math.max(size * 0.37, 104);
  const isCompact = size < 420;
  const todaySummary = (todayEntries || []).reduce(
    (accumulator, entry) => {
      if (entry.type === "new") {
        accumulator.new += 1;
      }
      if (entry.type === "old") {
        accumulator.old += 1;
      }
      return accumulator;
    },
    { new: 0, old: 0 }
  );

  canvas.width = Math.round(size * pixelRatio);
  canvas.height = Math.round(size * pixelRatio);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, size, size);

  const allHabits = [
    ...habits.new.map((habit) => ({ ...habit, type: "new" })),
    ...habits.old.map((habit) => ({ ...habit, type: "old" })),
  ];
  const averageStrength = allHabits.reduce(
    (sum, habit) => sum + Math.log((totals[habit.id] || 0) + 1),
    0
  ) / Math.max(allHabits.length, 1);
  const scoreTilt = visualProfile?.scoreTilt || 0;
  const goldPressure = Math.max(scoreTilt, 0);
  const redPressure = Math.max(-scoreTilt, 0);
  const visualIntensity = visualProfile?.intensity || 1;
  const motionBoost = (0.35 + motionLevel * 0.65) * (visualProfile?.motion || 1);
  const webIntensity = Math.min((0.9 + averageStrength * 0.28) * visualIntensity, 2.8);

  const totalNewStrength = habits.new.reduce(
    (sum, habit) => sum + Math.log((totals[habit.id] || 0) + 1),
    0
  );
  const totalOldStrength = habits.old.reduce(
    (sum, habit) => sum + Math.log((totals[habit.id] || 0) + 1),
    0
  );
  const collapseFactor = Math.min(totalOldStrength / Math.max(totalNewStrength + 0.6, 1), 2.2);
  const weightedCollapseFactor = clampNumber(collapseFactor + redPressure * 0.42 - goldPressure * 0.22, 0.16, 2.6);
  const centerPullY = Math.max(
    Math.min((totalOldStrength - totalNewStrength) * (isCompact ? 2.2 : 2.8) + size * (redPressure - goldPressure) * 0.018, size * 0.072),
    -size * 0.035
  );
  const centerX = baseCenterX;
  const centerY = baseCenterY + centerPullY;

  if (!allHabits.length) {
    drawCenter(context, centerX, centerY, isCompact, stats?.direction?.tone, todaySummary, time, motionLevel, scoreTilt, visualIntensity);
    return;
  }

  const newCount = habits.new.length;
  const oldCount = habits.old.length;
  const angles = [];

  if (newCount > 0) {
    const step = 190 / newCount;
    for (let index = 0; index < newCount; index += 1) {
      angles.push(-155 + step * index + step * 0.5);
    }
  }

  if (oldCount > 0) {
    const step = 130 / oldCount;
    for (let index = 0; index < oldCount; index += 1) {
      angles.push(65 + step * index + step * 0.5);
    }
  }

  const spokes = allHabits.map((habit, index) => {
    const radians = (angles[index] * Math.PI) / 180;
    const count = totals[habit.id] || 0;
    const spokeRadius = baseRadius + (habit.type === "new" ? Math.min(Math.log(count + 1) * 6, 18) : 0);
    const downwardDrag = habit.type === "old" ? Math.min(Math.log(count + 1) * 8, 22) : 0;
    return {
      ...habit,
      radians,
      spokeRadius,
      downwardDrag,
      endX: centerX + Math.cos(radians) * spokeRadius,
      endY: centerY + Math.sin(radians) * spokeRadius + downwardDrag,
    };
  });

  const atmosphere = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, size * 0.78);
  atmosphere.addColorStop(0, `rgba(201,168,76,${0.028 + averageStrength * 0.004 + goldPressure * 0.03})`);
  atmosphere.addColorStop(0.42, `rgba(45,28,14,${0.04 + averageStrength * 0.005})`);
  atmosphere.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = atmosphere;
  context.fillRect(0, 0, size, size);


  const coreAura = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius * 0.62);
  coreAura.addColorStop(0, scoreTilt >= 0
    ? `rgba(255,238,186,${0.04 + averageStrength * 0.012 + goldPressure * 0.04})`
    : `rgba(255,210,210,${0.03 + redPressure * 0.03})`);
  coreAura.addColorStop(0.45, scoreTilt >= 0
    ? `rgba(201,168,76,${0.025 + averageStrength * 0.008 + goldPressure * 0.03})`
    : `rgba(204,68,68,${0.02 + redPressure * 0.03})`);
  coreAura.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = coreAura;
  context.fillRect(0, 0, size, size);


  ["new", "old"].forEach((zone) => {
    const zoneSpokes = spokes.filter((spoke) => spoke.type === zone);
    if (zoneSpokes.length < 2) {
      return;
    }

    const outerScale = zone === "old" ? 0.95 : 0.92;
    const innerScale = zone === "old" ? 0.36 : 0.4;
    const outerPoints = zoneSpokes.map((spoke) => ({
      x: centerX + Math.cos(spoke.radians) * (baseRadius * outerScale),
      y: centerY + Math.sin(spoke.radians) * (baseRadius * outerScale) + spoke.downwardDrag * outerScale,
    }));
    const innerPoints = [...zoneSpokes].reverse().map((spoke) => ({
      x: centerX + Math.cos(spoke.radians) * (baseRadius * innerScale),
      y: centerY + Math.sin(spoke.radians) * (baseRadius * innerScale) + spoke.downwardDrag * innerScale,
    }));

    context.beginPath();
    outerPoints.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });
    innerPoints.forEach((point) => {
      context.lineTo(point.x, point.y);
    });
    context.closePath();
    context.fillStyle = zone === "new"
      ? `rgba(201,168,76,${(0.018 + averageStrength * 0.008 + goldPressure * 0.03) * visualIntensity})`
      : `rgba(204,68,68,${(0.016 + averageStrength * 0.007 + redPressure * 0.034) * visualIntensity})`;
    context.fill();
  });

  if (weightedCollapseFactor > 0.62) {
    drawCollapseShadow(context, centerX, centerY, baseRadius, weightedCollapseFactor, time, motionLevel, 1 + redPressure * 0.55 + Math.max(visualIntensity - 1, 0) * 0.4);
  }


  drawConflictMembrane(context, centerX, centerY, baseRadius, time, motionLevel, scoreTilt, visualIntensity, goldPressure, redPressure);



  const vignette = context.createRadialGradient(centerX, centerY, size * 0.12, centerX, centerY, size * 0.76);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.7, "rgba(0,0,0,0.22)");
  vignette.addColorStop(1, "rgba(0,0,0,0.56)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, size, size);

  for (let ring = 1; ring <= rings; ring += 1) {
    const ringRadius = (ring / rings) * baseRadius;
    const ringAlpha = Math.min(0.07 + (ring / rings) * 0.045 * motionBoost + averageStrength * 0.008, 0.16);

    // vollständiges Netz — alle Spokes verbunden, Lücke mit Mischton
    context.beginPath();
    spokes.forEach((spoke, index) => {
      const x = centerX + Math.cos(spoke.radians) * ringRadius;
      const y = centerY + Math.sin(spoke.radians) * ringRadius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.strokeStyle = `rgba(130,100,60,${ringAlpha})`;
    context.lineWidth = 0.7 + webIntensity * 0.08;
    context.stroke();

    // Zonen-Overlay: gold für new, rot für old
    for (const zone of ["new", "old"]) {
      const zoneSpokes = spokes.filter((s) => s.type === zone);
      if (zoneSpokes.length < 2) continue;
      context.beginPath();
      zoneSpokes.forEach((spoke, index) => {
        const x = centerX + Math.cos(spoke.radians) * ringRadius;
        const y = centerY + Math.sin(spoke.radians) * ringRadius;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = zone === "new"
        ? `rgba(201,168,76,${ringAlpha * (1.25 + goldPressure * 0.35)})`
        : `rgba(204,88,88,${ringAlpha * (1.2 + redPressure * 0.45)})`;
      context.lineWidth = 0.85 + webIntensity * 0.08;
      context.stroke();
    }
  }

  const meshFractions = [0.22, 0.36, 0.5, 0.64, 0.78];
  meshFractions.forEach((fraction, meshIndex) => {
    for (let index = 0; index < spokes.length; index += 1) {
      for (let secondIndex = index + 2; secondIndex < spokes.length; secondIndex += 1) {
        const current = spokes[index];
        const other = spokes[secondIndex];
        const currentCount = totals[current.id] || 0;
        const otherCount = totals[other.id] || 0;
        const sharedStrength = Math.sqrt((currentCount + 0.2) * (otherCount + 0.2));
        const sameZone = current.type === other.type;
        const alpha = sameZone
          ? Math.min(0.012 + sharedStrength * 0.007 + meshIndex * 0.0018 + averageStrength * 0.002, 0.095)
          : Math.min(0.005 + sharedStrength * 0.0022 + averageStrength * 0.001, 0.026);
        const pointA = {
          x: centerX + Math.cos(current.radians) * (fraction * baseRadius),
          y:
            centerY +
            Math.sin(current.radians) * (fraction * baseRadius) +
            (current.type === "old" ? fraction * Math.min(Math.log(currentCount + 1) * 8, 22) : 0),
        };
        const pointB = {
          x: centerX + Math.cos(other.radians) * (fraction * baseRadius),
          y:
            centerY +
            Math.sin(other.radians) * (fraction * baseRadius) +
            (other.type === "old" ? fraction * Math.min(Math.log(otherCount + 1) * 8, 22) : 0),
        };

        context.beginPath();
        context.moveTo(pointA.x, pointA.y);
        context.lineTo(pointB.x, pointB.y);
        context.strokeStyle = sameZone
          ? current.type === "new"
            ? `rgba(201,168,76,${alpha * (1 + goldPressure * 0.3)})`
            : `rgba(204,68,68,${Math.max(alpha * (1 + redPressure * 0.45) - 0.01, 0.025)})`
          : `rgba(88,72,52,${alpha})`;
        context.lineWidth = sameZone ? 0.38 + meshIndex * 0.03 : 0.26;
        if (sameZone && sharedStrength > 4) {
          context.shadowColor = current.type === "new" ? "#c9a84c" : "#cc4444";
          context.shadowBlur = Math.min(3 + sharedStrength * 0.28, 8);
        }
        context.stroke();
        context.shadowBlur = 0;
      }
    }
  });

  for (let ring = 0; ring < rings - 1; ring += 1) {
    const fractionA = (ring + 1) / rings;
    const fractionB = (ring + 2) / rings;

    for (let index = 0; index < spokes.length; index += 1) {
      const nextIndex = index + 1;
      if (nextIndex >= spokes.length) continue;
      const current = spokes[index];
      const next = spokes[nextIndex];
      if (current.type !== next.type) continue;

      const x1 = centerX + Math.cos(current.radians) * (fractionA * baseRadius);
      const y1 = centerY + Math.sin(current.radians) * (fractionA * baseRadius);
      const x2 = centerX + Math.cos(next.radians) * (fractionB * baseRadius);
      const y2 = centerY + Math.sin(next.radians) * (fractionB * baseRadius);
      const currentCount = totals[current.id] || 0;
      const nextCount = totals[next.id] || 0;
      const sharedStrength = Math.sqrt(currentCount * nextCount);
      const sameZone = current.type === next.type;
      const alpha = sameZone
        ? Math.min(0.06 + sharedStrength * 0.013 + fractionA * 0.012 + averageStrength * 0.005, 0.28)
        : Math.min(0.025 + sharedStrength * 0.005, 0.08);
      const lineWidth = (isCompact ? 0.32 : 0.38) + Math.min(sharedStrength * 0.06 + webIntensity * 0.04, 0.9);
      let stroke = `rgba(100,90,60,${alpha})`;

      if (sameZone && current.type === "new") {
        stroke = `rgba(201,168,76,${alpha * (1 + goldPressure * 0.35)})`;
      } else if (sameZone && current.type === "old") {
        stroke = `rgba(204,68,68,${Math.max(alpha * (1 + redPressure * 0.45) - 0.01, 0.03)})`;
      }

      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.strokeStyle = stroke;
      context.lineWidth = lineWidth;

      if (sharedStrength > 4 && sameZone) {
        context.shadowColor = current.type === "new" ? "#c9a84c" : "#cc4444";
        context.shadowBlur = Math.min(3 + sharedStrength * 0.28, 8);
      }

      context.stroke();
      context.shadowBlur = 0;
    }
  }

  drawBridgeThreads(
    context,
    centerX,
    centerY,
    baseRadius,
    spokes.filter((spoke) => spoke.type === "new"),
    spokes.filter((spoke) => spoke.type === "old"),
    totals,
    time,
    motionLevel,
    visualIntensity,
    goldPressure,
    redPressure
  );

  spokes.forEach((spoke) => {
    const count = totals[spoke.id] || 0;
    const isNew = spoke.type === "new";
    const decay = isNew ? 1.0 : oldHabitDecay(lastSeen[spoke.id]);
    const tension = isNew
      ? Math.min(Math.log(count + 1) * 0.28 + motionLevel * 0.18 + goldPressure * 0.38, 1.4)
      : Math.min((1 - decay) * 0.95 + Math.log(count + 1) * 0.18 + weightedCollapseFactor * 0.18 + redPressure * 0.42, 1.55);

    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(spoke.endX, spoke.endY);
    context.strokeStyle = isNew ? `rgba(201,168,76,${0.055 + tension * 0.03})` : `rgba(204,68,68,${(0.06 + tension * 0.028) * decay})`;
    context.lineWidth = 0.5;
    context.stroke();

    if (count > 0) {
      const flashIntensity = flash && flash.habitId === spoke.id
        ? Math.max(0, 1 - (Date.now() - flash.startTime) / 400)
        : 0;
      const thickness = (((isCompact ? 0.65 : 0.8) + Math.log(count + 1) * (isCompact ? 1.8 : 2.2)) * (isNew ? 1 : decay)) + tension * 0.22;
      const brightness = Math.min((0.15 + Math.log(count + 1) * 0.12 + tension * 0.07) * (isNew ? 1 : decay) + flashIntensity * 0.5, 1);
      const glowSize = (((isCompact ? 2 : 3) + Math.log(count + 1) * (isCompact ? 2.2 : 3)) * (isNew ? 1 : decay)) + tension * 0.8;
      const color = isNew
        ? `rgba(201,168,76,${brightness})`
        : `rgba(220,80,80,${brightness})`;
      const shadowColor = isNew ? "#c9a84c" : "#cc4444";

      context.beginPath();
      context.moveTo(centerX, centerY);
      context.lineTo(spoke.endX, spoke.endY);
      context.strokeStyle = color;
      context.lineWidth = thickness + flashIntensity * 3;
      context.shadowColor = shadowColor;
      context.shadowBlur = glowSize * (0.72 + flashIntensity * 2.5);
      context.stroke();
      context.shadowBlur = 0;

      const beamGradient = context.createLinearGradient(centerX, centerY, spoke.endX, spoke.endY);
      beamGradient.addColorStop(0, isNew ? `rgba(255,236,184,${0.08 + brightness * 0.2})` : `rgba(255,194,194,${0.07 + brightness * 0.16})`);
      beamGradient.addColorStop(0.55, color);
      beamGradient.addColorStop(1, isNew ? `rgba(240,208,128,${Math.min(brightness + 0.08, 1)})` : `rgba(255,162,162,${Math.min(brightness + 0.08, 1)})`);

      context.beginPath();
      context.moveTo(centerX, centerY);
      context.lineTo(spoke.endX, spoke.endY);
      context.strokeStyle = beamGradient;
      context.lineWidth = Math.max(thickness * 0.45, isCompact ? 0.8 : 1.05) + flashIntensity * 1.1;
      context.shadowColor = shadowColor;
      context.shadowBlur = glowSize * (0.25 + motionLevel * 0.35 + flashIntensity * 0.9);
      context.stroke();
      context.shadowBlur = 0;

      if (isNew && count > 0) {
        drawThreadFlow(context, centerX, centerY, spoke, count, time, motionLevel, isCompact, visualIntensity + goldPressure * 0.18);
      }

      const milestone = count >= 100 ? 100 : count >= 30 ? 30 : count >= 7 ? 7 : 0;
      if (milestone) {
        const baseMilestoneAlpha = milestone === 100 ? 0.34 : milestone === 30 ? 0.24 : 0.16;
        const milestoneAlpha = isNew ? baseMilestoneAlpha : baseMilestoneAlpha * decay;
        const milestoneWidth = thickness + (milestone === 100 ? 2.2 : milestone === 30 ? 1.4 : 0.8);

        context.beginPath();
        context.moveTo(centerX, centerY);
        context.lineTo(spoke.endX, spoke.endY);
        context.strokeStyle = isNew
          ? `rgba(240,208,128,${milestoneAlpha})`
          : `rgba(255,140,140,${Math.max(milestoneAlpha - 0.04, 0.04)})`;
        context.lineWidth = milestoneWidth;
        context.shadowColor = isNew ? "#f0d080" : "#ff8a8a";
        context.shadowBlur = glowSize * (milestone === 100 ? 2.2 : 1.5);
        context.stroke();
        context.shadowBlur = 0;

        const markerRadius = baseRadius * (milestone === 100 ? 0.92 : milestone === 30 ? 0.82 : 0.72);
  const markerDrag = spoke.downwardDrag * Math.min(markerRadius / baseRadius, 1);
        const markerX = centerX + Math.cos(spoke.radians) * markerRadius;
  const markerY = centerY + Math.sin(spoke.radians) * markerRadius + markerDrag;
        context.beginPath();
        context.arc(markerX, markerY, milestone === 100 ? 3 : 2.4, 0, Math.PI * 2);
        context.fillStyle = isNew ? "rgba(240,208,128,0.88)" : "rgba(255,150,150,0.82)";
        context.shadowColor = isNew ? "#f0d080" : "#ff8a8a";
        context.shadowBlur = milestone === 100 ? 9 : 6;
        context.fill();
        context.shadowBlur = 0;
      }
    }

    const labelRadius = baseRadius + (isCompact ? 16 : 20);
    const labelX = centerX + Math.cos(spoke.radians) * labelRadius;
  const labelY = centerY + Math.sin(spoke.radians) * labelRadius + spoke.downwardDrag;
    const cosA = Math.cos(spoke.radians);
    const labelAlign = cosA > 0.3 ? "left" : cosA < -0.3 ? "right" : "center";

    const edgePad = isCompact ? 10 : 12;
    context.font = `${count > 10 ? "600" : "400"} ${isCompact ? 9.25 : 10.5}px serif`;
    const textW = context.measureText(spoke.label).width;
    let clampedLabelX = labelX;
    if (labelAlign === "left")        clampedLabelX = Math.min(labelX, size - textW - edgePad);
    else if (labelAlign === "right")  clampedLabelX = Math.max(labelX, textW + edgePad);
    else                              clampedLabelX = Math.max(textW / 2 + edgePad, Math.min(size - textW / 2 - edgePad, labelX));

    const labelColor = isNew
      ? `rgba(240,208,128,${count > 0 ? Math.min(0.54 + Math.log(count + 1) * 0.11 + tension * 0.08, 1) : 0.42})`
      : `rgba(255,168,168,${count > 0 ? Math.min((0.52 + Math.log(count + 1) * 0.11 + tension * 0.06) * decay, 0.98) : 0.4 * decay})`;
    drawTextWithHalo(context, spoke.label, clampedLabelX, labelY, {
      font: `${count > 10 ? "600" : "500"} ${isCompact ? 9.25 : 10.75}px serif`,
      align: labelAlign,
      fillStyle: labelColor,
      strokeWidth: (isCompact ? 3.8 : 4.4) + tension * 0.3,
      shadowColor: isNew ? `rgba(201,168,76,${0.18 + tension * 0.08})` : `rgba(204,68,68,${0.22 + tension * 0.08})`,
      shadowBlur: (isCompact ? 7 : 9) + tension * 2,
    });

    if (count > 0) {
      context.font = `500 ${isCompact ? 7.75 : 8.5}px serif`;
      const badgeYOffset = Math.sin(spoke.radians) >= 0 ? (isCompact ? 11 : 13) : (isCompact ? -11 : -13);
      drawTextWithHalo(context, `x${count}`, clampedLabelX, labelY + badgeYOffset, {
        font: `600 ${isCompact ? 8 : 8.9}px serif`,
        align: labelAlign,
        fillStyle: isNew ? "rgba(240,208,128,0.84)" : "rgba(255,176,176,0.82)",
        strokeWidth: (isCompact ? 3 : 3.5) + tension * 0.18,
        shadowColor: isNew ? `rgba(201,168,76,${0.16 + tension * 0.06})` : `rgba(204,68,68,${0.2 + tension * 0.06})`,
        shadowBlur: (isCompact ? 5 : 7) + tension * 1.4,
      });
    }

    if (count > 0) {
      context.beginPath();
      context.arc(spoke.endX, spoke.endY, (isCompact ? 2.1 : 2.6) + tension * 0.45, 0, Math.PI * 2);
      context.fillStyle = isNew ? "rgba(240,208,128,0.76)" : "rgba(255,150,150,0.68)";
      context.shadowColor = isNew ? "#f0d080" : "#ff9c9c";
      context.shadowBlur = 7 + tension * 3;
      context.fill();
      context.shadowBlur = 0;

      context.beginPath();
      context.arc(spoke.endX, spoke.endY, (isCompact ? 3.8 : 4.8) + Math.min(Math.log(count + 1) * 0.55, 2.2) + tension * 0.8, 0, Math.PI * 2);
      context.strokeStyle = isNew
        ? `rgba(240,208,128,${0.15 + Math.min(count * 0.008, 0.18)})`
        : `rgba(255,162,162,${0.14 + Math.min(count * 0.007, 0.16)})`;
      context.lineWidth = isCompact ? 0.8 : 1;
      context.stroke();
    }

  });

if (weightedCollapseFactor > 0.72) {
    for (let i = 0; i < Math.min(3 + Math.floor(weightedCollapseFactor), 5); i += 1) {
      const arcRadius = baseRadius * (0.42 + i * 0.08);
      const arcStart = (145 + i * 10) * (Math.PI / 180);
      const arcEnd = (212 + i * 8) * (Math.PI / 180);
      context.beginPath();
      context.arc(centerX, centerY + i * 2.5, arcRadius, arcStart, arcEnd, false);
      context.strokeStyle = `rgba(204,68,68,${Math.min(0.06 + weightedCollapseFactor * 0.038 + redPressure * 0.04, 0.2)})`;
      context.lineWidth = 0.65 + i * 0.05;
      context.stroke();
    }
  }


  // Feuer am AKQUISE-Spoke wenn Streak aktiv
  if (callStreak >= 1) {
    const akquiseSpoke = spokes.find((s) => s.category === "AKQUISE");
    if (akquiseSpoke) {
      drawFire(context, akquiseSpoke.endX, akquiseSpoke.endY, time, callStreak, motionLevel);
    }
  }

  drawCenter(context, centerX, centerY, isCompact, stats?.direction?.tone, todaySummary, time, motionLevel, scoreTilt, visualIntensity);
}

function drawCenter(context, centerX, centerY, isCompact = false, tone = "dim", todaySummary = { new: 0, old: 0 }, time = 0, motionLevel = 1, scoreTilt = 0, visualIntensity = 1) {
  const pulseAmplitude = (todaySummary.new !== 0 || todaySummary.old !== 0 ? 0.03 : 0.015) * (0.2 + motionLevel * 0.8);
  const pulse = 1 + Math.sin(time * (0.0008 + motionLevel * 0.0024)) * pulseAmplitude;
  const radius = (isCompact ? 8 : 10) * pulse;
  const diff = Math.abs((todaySummary?.new || 0) - (todaySummary?.old || 0));
  const scoreTone = scoreTilt > 0.18 ? "gold" : scoreTilt < -0.18 ? "red" : tone;
  const dominantTone = todaySummary.new > todaySummary.old ? "gold" : todaySummary.old > todaySummary.new ? "red" : scoreTone;
  const innerColor = dominantTone === "red" ? "#ffaaaa" : "#f0d080";
  const midColor = dominantTone === "red" ? "#cc4444" : "#c9a84c";
  const outerAlpha = todaySummary.new === 0 && todaySummary.old === 0 ? 0.14 : Math.min(0.24 + diff * 0.04, 0.5);
  const shadowColor = dominantTone === "red" ? "#cc4444" : "#c9a84c";

  const haloRadius = radius + (isCompact ? 18 : 24) + diff * 1.4 + Math.abs(scoreTilt) * 5;
  const halo = context.createRadialGradient(centerX, centerY, radius * 0.45, centerX, centerY, haloRadius);
  halo.addColorStop(0, dominantTone === "red" ? `rgba(204,68,68,${0.16 + motionLevel * 0.08 + Math.abs(scoreTilt) * 0.06})` : `rgba(201,168,76,${0.16 + motionLevel * 0.08 + Math.abs(scoreTilt) * 0.06})`);
  halo.addColorStop(0.4, dominantTone === "red" ? `rgba(204,68,68,${0.06 + motionLevel * 0.03 + Math.abs(scoreTilt) * 0.025})` : `rgba(201,168,76,${0.06 + motionLevel * 0.03 + Math.abs(scoreTilt) * 0.025})`);
  halo.addColorStop(1, "rgba(0,0,0,0)");
  context.beginPath();
  context.arc(centerX, centerY, haloRadius, 0, Math.PI * 2);
  context.fillStyle = halo;
  context.fill();

  const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  gradient.addColorStop(0, innerColor);
  gradient.addColorStop(0.6, midColor);
  gradient.addColorStop(1, dominantTone === "red" ? `rgba(204,68,68,${outerAlpha})` : `rgba(201,168,76,${outerAlpha})`);
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fillStyle = gradient;
  context.shadowColor = shadowColor;
  context.shadowBlur = todaySummary.new === 0 && todaySummary.old === 0 ? 16 : Math.min((24 + diff * 4) * visualIntensity + Math.abs(scoreTilt) * 6, 52);
  context.fill();
  context.shadowBlur = 0;

  context.beginPath();
  context.arc(centerX, centerY, radius + (isCompact ? 9 : 12), 0, Math.PI * 2);
  context.strokeStyle = dominantTone === "red" ? `rgba(204,68,68,${0.05 + Math.abs(Math.sin(time * 0.0028)) * 0.05})` : `rgba(201,168,76,${0.05 + Math.abs(Math.sin(time * 0.0028)) * 0.05})`;
  context.lineWidth = isCompact ? 1.2 : 1.5;
  context.stroke();

  if (todaySummary.new !== 0 || todaySummary.old !== 0) {
    context.beginPath();
    context.arc(centerX, centerY, radius + (isCompact ? 4 : 5), 0, Math.PI * 2);
    context.strokeStyle = dominantTone === "red" ? `rgba(204,68,68,${Math.min(0.18 + diff * 0.03, 0.36)})` : `rgba(201,168,76,${Math.min(0.18 + diff * 0.03, 0.36)})`;
    context.lineWidth = isCompact ? 1 : 1.2;
    context.stroke();
  }
}

function buildReplayFrames(historyDays = [], totals = {}, lastSeen = {}) {
  if (!historyDays.length) {
    return [];
  }

  const startDate = historyDays[0].date;
  const windowCounts = {};
  const currentLastSeen = { ...lastSeen };

  historyDays.forEach((day) => {
    (day.entries || []).forEach((entry) => {
      windowCounts[entry.habitId] = (windowCounts[entry.habitId] || 0) + 1;
    });
  });

  const runningTotals = Object.entries(totals).reduce((accumulator, [habitId, count]) => {
    accumulator[habitId] = Math.max(Number(count) - (windowCounts[habitId] || 0), 0);
    return accumulator;
  }, {});

  Object.keys(currentLastSeen).forEach((habitId) => {
    if (currentLastSeen[habitId] && currentLastSeen[habitId] >= startDate) {
      currentLastSeen[habitId] = null;
    }
  });

  return historyDays.map((day) => {
    (day.entries || []).forEach((entry) => {
      runningTotals[entry.habitId] = (runningTotals[entry.habitId] || 0) + 1;
      if (entry.type === "old") {
        currentLastSeen[entry.habitId] = day.date;
      }
    });

    return {
      date: day.date,
      totals: { ...runningTotals },
      lastSeen: { ...currentLastSeen },
      todayEntries: day.entries || [],
      summary: { new: day.new || 0, old: day.old || 0, total: day.total || 0 },
    };
  });
}

function formatReplayDate(dateStr) {
  if (!dateStr) {
    return "";
  }

  const [year, month, day] = dateStr.split("-");
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(new Date(Number(year), Number(month) - 1, Number(day)));
}

async function request(path, options) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || "Request failed");
  }

  return payload;
}

export default function Home() {
  const router = useRouter();
  const canvasRef = useRef(null);
  const stateRef = useRef(INITIAL_STATE);
  const flashRef = useRef(null);
  const motionBurstUntilRef = useRef(Date.now() + MOTION_BURST_MS);
  const reducedMotionRef = useRef(false);
  const replayFrameRef = useRef(null);
  const replayActiveRef = useRef(false);
  const replayRouteHandledRef = useRef(false);
  const visualModeRef = useRef(DEFAULT_VISUAL_MODE);
  const noteInputRef = useRef(null);
  const noteValueRef = useRef("");
  const noteSaveTimerRef = useRef(null);
  const noteStatusTimerRef = useRef(null);
  const noteLoadedRef = useRef(false);
  const lastSavedNoteRef = useRef("");
  const [state, setState] = useState(INITIAL_STATE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [starRefreshKey, setStarRefreshKey] = useState(0);
  const [drafts, setDrafts] = useState({ new: "", old: "", newCat: null, oldCat: null });
  const [todayLabel, setTodayLabel] = useState("");
  const [note, setNote] = useState("");
  const [noteSaveState, setNoteSaveState] = useState("idle");
  const [lastRecorded, setLastRecorded] = useState(null);
  const [replayActive, setReplayActive] = useState(false);
  const [replayAutoPlay, setReplayAutoPlay] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [visualMode, setVisualMode] = useState(DEFAULT_VISUAL_MODE);
  const completedToday = isDevMode ? new Set() : new Set(state.todayEntries.map((entry) => entry.habitId));
  const todayCountPerHabit = state.todayEntries.reduce((acc, e) => {
    acc[e.habitId] = (acc[e.habitId] || 0) + 1;
    return acc;
  }, {});
  const replayFrames = buildReplayFrames(state.historyDays, state.totals, state.lastSeen);
  const replayFrame = replayActive && replayFrames.length ? replayFrames[Math.min(replayIndex, replayFrames.length - 1)] : null;
  const visualProfile = getVisualProfile(state.score, visualMode);
  const replayRequested = router.isReady && hasReplayFlag(router.query.replay);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    visualModeRef.current = visualMode;
  }, [visualMode]);

  useEffect(() => {
    noteValueRef.current = note;
  }, [note]);

  useEffect(() => {
    const textarea = noteInputRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [note]);

  useEffect(() => {
    replayFrameRef.current = replayFrame;
    replayActiveRef.current = Boolean(replayFrame);
  }, [replayFrame]);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    if (!replayRequested) {
      replayRouteHandledRef.current = false;
      return;
    }

    if (!replayFrames.length || replayRouteHandledRef.current) {
      return;
    }

    replayRouteHandledRef.current = true;
    setReplayIndex(0);
    setReplayActive(true);
    setReplayAutoPlay(true);
    kickMotion(replayFrames.length * REPLAY_STEP_MS + 1500);
  }, [router.isReady, replayRequested, replayFrames.length]);

  function kickMotion(duration = MOTION_BURST_MS) {
    motionBurstUntilRef.current = Date.now() + duration;
  }

  function clearNoteStatusTimer() {
    if (noteStatusTimerRef.current) {
      window.clearTimeout(noteStatusTimerRef.current);
      noteStatusTimerRef.current = null;
    }
  }

  function scheduleSavedBadgeReset() {
    clearNoteStatusTimer();
    noteStatusTimerRef.current = window.setTimeout(() => {
      setNoteSaveState((current) => (current === "saved" ? "idle" : current));
      noteStatusTimerRef.current = null;
    }, 2500);
  }

  async function persistNote(content) {
    const normalizedContent = String(content || "").slice(0, 2000);

    if (!noteLoadedRef.current || normalizedContent === lastSavedNoteRef.current) {
      return true;
    }

    if (noteSaveTimerRef.current) {
      window.clearTimeout(noteSaveTimerRef.current);
      noteSaveTimerRef.current = null;
    }

    clearNoteStatusTimer();
    setNoteSaveState("saving");

    try {
      const payload = await request("/api/notes", {
        method: "POST",
        body: JSON.stringify({ content: normalizedContent }),
      });

      lastSavedNoteRef.current = payload.content;
      noteValueRef.current = payload.content;
      setNote((current) => (current === payload.content ? current : payload.content));
      setNoteSaveState("saved");
      scheduleSavedBadgeReset();
      return true;
    } catch {
      setNoteSaveState("error");
      return false;
    }
  }

  useEffect(() => {
    let active = true;

    request("/api/state")
      .then((payload) => {
        if (!active) {
          return;
        }
        setState(payload);
        setNote(payload.note || "");
        lastSavedNoteRef.current = payload.note || "";
        noteLoadedRef.current = true;
        setNoteSaveState("idle");
      })
      .catch((requestError) => {
        if (!active) {
          return;
        }
        setError(requestError.message);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setTodayLabel(formatHeaderDate());
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = () => {
      reducedMotionRef.current = mediaQuery.matches;
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        kickMotion(2500);
      }
    };

    syncReducedMotion();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncReducedMotion);
    } else {
      mediaQuery.addListener(syncReducedMotion);
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", syncReducedMotion);
      } else {
        mediaQuery.removeListener(syncReducedMotion);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!replayActive || !replayAutoPlay || !replayFrames.length) {
      return undefined;
    }

    kickMotion(replayFrames.length * REPLAY_STEP_MS + 1500);
    const intervalId = window.setInterval(() => {
      setReplayIndex((current) => (current >= replayFrames.length - 1 ? 0 : current + 1));
    }, reducedMotionRef.current ? Math.round(REPLAY_STEP_MS * 1.4) : REPLAY_STEP_MS);
    return () => window.clearInterval(intervalId);
  }, [replayActive, replayAutoPlay, replayFrames]);

  useEffect(() => {
    return () => {
      if (noteSaveTimerRef.current) {
        window.clearTimeout(noteSaveTimerRef.current);
      }
      clearNoteStatusTimer();
    };
  }, []);

  useEffect(() => {
    if (!noteLoadedRef.current) {
      return undefined;
    }

    if (noteSaveTimerRef.current) {
      window.clearTimeout(noteSaveTimerRef.current);
      noteSaveTimerRef.current = null;
    }

    if (note === lastSavedNoteRef.current) {
      return undefined;
    }

    setNoteSaveState("pending");
    noteSaveTimerRef.current = window.setTimeout(() => {
      noteSaveTimerRef.current = null;
      void persistNote(noteValueRef.current);
    }, 900);

    return () => {
      if (noteSaveTimerRef.current) {
        window.clearTimeout(noteSaveTimerRef.current);
        noteSaveTimerRef.current = null;
      }
    };
  }, [note]);

  useEffect(() => {
    let frameId;
    let lastFrameTime = 0;
    let frozenTime = 0;

    function renderFrame(frameTime) {
      frameId = window.requestAnimationFrame(renderFrame);
      const flashActive = flashRef.current && Date.now() - flashRef.current.startTime < 450;
      if (!flashActive && flashRef.current) {
        flashRef.current = null;
      }

      const burstActive = Date.now() < motionBurstUntilRef.current || flashActive || replayActiveRef.current;
      const frameInterval = 1000 / (reducedMotionRef.current ? REDUCED_FPS : burstActive ? ACTIVE_FPS : IDLE_FPS);
      if (frameTime - lastFrameTime < frameInterval) {
        return;
      }
      lastFrameTime = frameTime;
      frozenTime = burstActive || frozenTime === 0 ? frameTime : frozenTime;
      const liveState = stateRef.current;
      const replayFrameState = replayFrameRef.current;
      const activeVisualProfile = getVisualProfile(liveState.score, visualModeRef.current);
      const visualState = replayFrameState
        ? {
            ...liveState,
            totals: replayFrameState.totals,
            lastSeen: replayFrameState.lastSeen,
            todayEntries: replayFrameState.todayEntries,
            callStreak: 0,
          }
        : liveState;

      drawWeb(
        canvasRef.current,
        visualState.habits,
        visualState.totals,
        visualState.lastSeen,
        visualState.stats,
        visualState.todayEntries,
        visualState.callStreak,
        burstActive ? frameTime : frozenTime,
        flashRef.current,
        reducedMotionRef.current ? 0.12 : burstActive ? 1 : 0.18,
        activeVisualProfile
      );
    }

    frameId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(frameId);
  }, []);


  async function runAction(action, successMessage) {
    setBusy(true);
    setError("");
    setMessage("");
    if (replayActiveRef.current) {
      setReplayActive(false);
      setReplayAutoPlay(false);
      setReplayIndex(0);
    }
    kickMotion(4500);

    try {
      const payload = await action();
      setState(payload);
      if (typeof payload.note === "string" && noteValueRef.current === lastSavedNoteRef.current) {
        setNote(payload.note);
        noteValueRef.current = payload.note;
        lastSavedNoteRef.current = payload.note;
        setNoteSaveState("idle");
      }
      if (successMessage) {
        setMessage(successMessage);
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  }

  function handleAddHabit(type) {
    const label = drafts[type].trim();
    if (!label) return;
    const category = drafts[type === "new" ? "newCat" : "oldCat"];
    runAction(
      () => request("/api/habits", { method: "POST", body: JSON.stringify({ type, label, category }) })
    );
    setDrafts((current) => ({ ...current, [type]: "", [`${type === "new" ? "new" : "old"}Cat`]: null }));
  }

  function handleRecord(habitId) {
    const habit = [...state.habits.new, ...state.habits.old].find((h) => h.id === habitId);
    kickMotion(7000);
    flashRef.current = { habitId, startTime: Date.now() };
    if (navigator.vibrate) navigator.vibrate(42);
    runAction(() => request("/api/entries", { method: "POST", body: JSON.stringify({ habitId }) }));
    setStarRefreshKey((k) => k + 1);
    if (habit) {
      setLastRecorded({ label: habit.label, type: habit.type });
      setTimeout(() => setLastRecorded(null), 3000);
    }
  }

  function handleDeleteEntry(entryId) {
    runAction(
      () => request("/api/entries", { method: "DELETE", body: JSON.stringify({ id: entryId }) })
    );
  }

  function handleRemoveHabit(habitId) {
    if (!window.confirm("Diesen Strang inklusive Historie löschen?")) {
      return;
    }

    runAction(
      () => request("/api/habits", { method: "DELETE", body: JSON.stringify({ id: habitId }) })
    );
  }

  function handleResetDay() {
    if (!window.confirm("Heutigen Tag zurücksetzen?")) {
      return;
    }

    runAction(
      () => request("/api/reset", { method: "POST", body: JSON.stringify({ scope: "day" }) })
    );
  }

  function handleExport() {
    window.location.href = "/api/export";
  }

  function handleImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const payload = JSON.parse(e.target.result);
        runAction(
          () => request("/api/import", { method: "POST", body: JSON.stringify(payload) }),
          "Import erfolgreich."
        );
      } catch {
        setError("Ungültige Datei.");
      }
    };
    reader.readAsText(file);
  }

  function toggleReplayAutoPlay() {
    if (!replayActive) {
      setReplayActive(true);
    }
    setReplayAutoPlay((current) => !current);
    kickMotion(3000);
  }

  function stepReplay(direction) {
    if (!replayFrames.length) {
      return;
    }

    setReplayActive(true);
    setReplayAutoPlay(false);
    setReplayIndex((current) => {
      const next = current + direction;
      if (next < 0) {
        return 0;
      }
      if (next > replayFrames.length - 1) {
        return replayFrames.length - 1;
      }
      return next;
    });
    kickMotion(2200);
  }

  function handleReplayScrub(event) {
    const nextIndex = Number(event.target.value);
    setReplayActive(true);
    setReplayAutoPlay(false);
    setReplayIndex(nextIndex);
    kickMotion(2200);
  }

  function handleVisualModeChange(mode) {
    if (!VISUAL_MODES[mode]) {
      return;
    }

    setVisualMode(mode);
    kickMotion(2600);
  }

  const noteStatusLabel = noteSaveState === "pending"
    ? "ungespeichert"
    : noteSaveState === "saving"
    ? "speichert..."
    : noteSaveState === "saved"
    ? "gespeichert"
    : noteSaveState === "error"
    ? "Speichern fehlgeschlagen"
    : "";

  return (
    <>
      <Head>
        <title>Tracker</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#060606" />
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='9' fill='%23c9a84c' filter='url(%23g)'/%3E%3Cdefs%3E%3Cfilter id='g'%3E%3CfeGaussianBlur stdDeviation='2' result='b'/%3E%3CfeMerge%3E%3CfeMergeNode in='b'/%3E%3CfeMergeNode in='SourceGraphic'/%3E%3C/feMerge%3E%3C/filter%3E%3C/defs%3E%3C/svg%3E" />
      </Head>

      <main className="page-shell">
        <div className="grain" />

        <header className="page-header">
          <p className="page-date">{todayLabel}</p>
        </header>

        <StarSystem refreshKey={starRefreshKey} />

        <section className="status-grid" aria-label="Status">
          <article className="status-card">
            <span className="status-label">Streak</span>
            <strong className="status-value gold">{loading ? "—" : state.stats.streak}</strong>
            <span className="status-meta">Tage in Folge</span>
          </article>
          <article className="status-card">
            <span className="status-label">Richtung</span>
            <strong className={`status-value ${state.stats.direction.tone}`}>{loading ? "—" : state.stats.direction.symbol}</strong>
            <span className="status-meta">{loading ? "" : state.stats.direction.text}</span>
          </article>
        </section>

        {error ? <p className="feedback error">{error}</p> : null}
        {message ? <p className="feedback success">{message}</p> : null}
        {isDevMode ? <p className="feedback success">Dev-Modus aktiv: Mehrfachklicks pro Tag sind erlaubt.</p> : null}

        <ScoreCard score={state.score} callStreak={state.callStreak} loading={loading} />

        <section className="controls">
          <TrackerSection
            label="Neues Ich — Fäden stärken"
            tone="new"
            habits={state.habits.new}
            totals={state.totals}
            completedToday={completedToday}
            todayCount={todayCountPerHabit}
            savedLabel={lastRecorded?.type === "new" ? lastRecorded.label : null}
            value={drafts.new}
            category={drafts.newCat}
            onCategoryChange={(cat) => setDrafts((c) => ({ ...c, newCat: cat }))}
            disabled={busy}
            onChange={(value) => setDrafts((current) => ({ ...current, new: value }))}
            onSubmit={() => handleAddHabit("new")}
            onRecord={handleRecord}
            onRemove={handleRemoveHabit}
          />

          <TrackerSection
            label="Altes Ich — Fäden schwächen"
            tone="old"
            habits={state.habits.old}
            totals={state.totals}
            completedToday={completedToday}
            todayCount={todayCountPerHabit}
            savedLabel={lastRecorded?.type === "old" ? lastRecorded.label : null}
            value={drafts.old}
            category={drafts.oldCat}
            onCategoryChange={(cat) => setDrafts((c) => ({ ...c, oldCat: cat }))}
            disabled={busy}
            onChange={(value) => setDrafts((current) => ({ ...current, old: value }))}
            onSubmit={() => handleAddHabit("old")}
            onRecord={handleRecord}
            onRemove={handleRemoveHabit}
          />
        </section>

        <section className="canvas-wrap">
          <div className="canvas-head">
            <div>
              <p className="section-label muted canvas-label">Netz</p>
              {replayFrame ? <p className="canvas-subline">{`Replay · ${formatReplayDate(replayFrame.date)}`}</p> : null}
            </div>
            <div className="canvas-head__actions">
              <div className="canvas-head__controls">
                <div className="canvas-mode-switch" aria-label="Visualisierungsstufe">
                  {Object.entries(VISUAL_MODES).map(([modeKey, config]) => (
                    <button
                      key={modeKey}
                      type="button"
                      className={`canvas-mode-switch__btn${visualMode === modeKey ? " canvas-mode-switch__btn--active" : ""}`}
                      onClick={() => handleVisualModeChange(modeKey)}
                      aria-pressed={visualMode === modeKey}
                    >
                      {config.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {replayRequested && replayFrames.length ? (
            <div className="canvas-replay-shell">
              <div className="canvas-replay-meta" aria-label="Replay-Status">
                <span className="canvas-replay-meta__label">Zeitraum</span>
                <span className="canvas-replay-meta__value">{formatReplayDate(replayFrames[0].date)} bis {formatReplayDate(replayFrames[replayFrames.length - 1].date)}</span>
                <span className="canvas-replay-meta__step">{replayActive ? `${replayIndex + 1}/${replayFrames.length}` : "bereit"}</span>
              </div>

              <div className="canvas-scrubber" aria-label="Replay-Steuerung">
                <div className="canvas-scrubber__buttons">
                  <button type="button" className="canvas-scrubber__btn" onClick={() => stepReplay(-1)} disabled={!replayActive || replayIndex === 0}>
                    Zurück
                  </button>
                  <button type="button" className={`canvas-scrubber__btn${replayAutoPlay ? " canvas-scrubber__btn--active" : ""}`} onClick={toggleReplayAutoPlay} disabled={!replayFrames.length}>
                    {replayAutoPlay ? "Pause" : "Play"}
                  </button>
                  <button type="button" className="canvas-scrubber__btn" onClick={() => stepReplay(1)} disabled={!replayActive || replayIndex === replayFrames.length - 1}>
                    Weiter
                  </button>
                </div>

                <input
                  type="range"
                  min="0"
                  max={Math.max(replayFrames.length - 1, 0)}
                  step="1"
                  value={replayIndex}
                  onChange={handleReplayScrub}
                  className="canvas-scrubber__range"
                  aria-label="Replay-Scrubber"
                />

                <div className="canvas-scrubber__labels" aria-hidden="true">
                  <span>{formatReplayDate(replayFrames[0].date)}</span>
                  <span>{formatReplayDate(replayFrames[Math.min(replayIndex, replayFrames.length - 1)]?.date)}</span>
                  <span>{formatReplayDate(replayFrames[replayFrames.length - 1].date)}</span>
                </div>
              </div>
            </div>
          ) : null}

          <canvas ref={canvasRef} className={`web-canvas${replayActive ? " web-canvas--replay" : ""}`} aria-label="Netz-Visualisierung" />
        </section>

        <section className="controls">
          <section className="note-section">
            <p className="section-label muted">
              Notiz
              {noteStatusLabel ? <span className={`note-status note-status--${noteSaveState}`}>{noteStatusLabel}</span> : null}
            </p>
            <textarea
              ref={noteInputRef}
              className="note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => { void persistNote(noteValueRef.current); }}
              placeholder="Gedanken zum heutigen Tag…"
              maxLength={2000}
              rows={6}
            />
          </section>

          <section className="log-section">
            <p className="section-label muted">Heute</p>

            {!state.todayEntries.length ? (
              <p className="empty-state">Heute ist noch nichts eingetragen.</p>
            ) : (
              <div className={`log-list${state.todayEntries.length > 5 ? " log-list--scrollable" : ""}`}>
                {state.todayEntries.map((entry) => (
                  <article key={entry.id} className={`log-item ${entry.type}`}>
                    <span className="log-dot" />
                    <span className="log-label">{entry.label}</span>
                    <span className="log-time">{formatEntryTimestamp(entry.date, entry.time)}</span>
                    <button
                      type="button"
                      className="entry-delete-btn"
                      onClick={() => handleDeleteEntry(entry.id)}
                      disabled={busy}
                      aria-label={`${entry.label} entfernen`}
                    >
                      Rückgängig
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          <div className="bottom-row">
            <Link href="/statistik" className="util-btn" style={{ textAlign: "center" }}>
              Statistik
            </Link>
            <Link href="/verlauf" className="util-btn" style={{ textAlign: "center" }}>
              Verlauf
            </Link>
            <button type="button" className="util-btn" onClick={handleExport} disabled={busy || loading}>
              Export
            </button>
            <label className={`util-btn import-label${busy ? " import-label--disabled" : ""}`}>
              Import
              <input
                type="file"
                accept=".json"
                className="import-input"
                onChange={handleImport}
                disabled={busy}
              />
            </label>
            <button type="button" className="util-btn" onClick={handleResetDay} disabled={busy}>
              Tag reset
            </button>
          </div>
        </section>
      </main>
    </>
  );
}

function TrackerSection({
  label,
  tone,
  habits,
  totals,
  completedToday,
  todayCount,
  savedLabel,
  value,
  category,
  onCategoryChange,
  disabled,
  onChange,
  onSubmit,
  onRecord,
  onRemove,
}) {
  const [pendingDelete, setPendingDelete] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  function handleDeleteClick(habitId) {
    if (pendingDelete === habitId) {
      onRemove(habitId);
      setPendingDelete(null);
    } else {
      setPendingDelete(habitId);
      setTimeout(() => setPendingDelete((current) => current === habitId ? null : current), 2500);
    }
  }

  function handleSubmit() {
    onSubmit();
    setAddOpen(false);
  }

  return (
    <section>
      <div className="section-label-row">
        <p className={`section-label ${tone}`}>
          {label}
          {savedLabel ? <span className="note-saved">{savedLabel}</span> : null}
        </p>
        <button
          type="button"
          className={`add-toggle ${tone}${addOpen ? " add-toggle--open" : ""}`}
          onClick={() => setAddOpen((o) => !o)}
          aria-label="Faden hinzufügen"
        >
          {addOpen ? "✕" : "+ Faden"}
        </button>
      </div>

      <div className="habit-grid">
        {habits.map((habit) => (
          <HabitCard
            key={habit.id}
            habit={habit}
            tone={tone}
            done={completedToday.has(habit.id)}
            todayN={todayCount[habit.id] || 0}
            total={totals[habit.id] || 0}
            pendingDelete={pendingDelete}
            disabled={disabled}
            onRecord={() => { setPendingDelete(null); onRecord(habit.id); }}
            onDelete={() => handleDeleteClick(habit.id)}
          />
        ))}
      </div>

      {addOpen && (
        <div className="add-open-block">
          <div className="cat-picker">
            {["HYGIENE", "AKQUISE", "SABOTAGE"].map((cat) => (
              <button
                key={cat}
                type="button"
                className={`cat-btn cat-btn--${cat.toLowerCase()}${category === cat ? " cat-btn--active" : ""}`}
                onClick={() => onCategoryChange(category === cat ? null : cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="add-row">
            <input
              className="add-input"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={tone === "new" ? "Neuen Strang hinzufügen…" : "Alten Strang hinzufügen…"}
              maxLength={40}
              autoFocus
              onKeyDown={(event) => { if (event.key === "Enter") handleSubmit(); }}
            />
            <button type="button" className={`add-btn ${tone}`} onClick={handleSubmit} disabled={disabled}>
              Hinzufügen
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

const SCORE_SYMBOLS = {
  gold:    "↗↗↗",
  gruen2:  "↗↗",
  gruen:   "↗",
  gelb:    "↗",
  neutral: "→",
  rot:     "↘",
  tiefrot: "↘↘",
};
const SCORE_COLORS = {
  gold:    "#f0d080",
  gruen2:  "#7ec87e",
  gruen:   "#5aaa6a",
  gelb:    "#a89040",
  neutral: "#5a4f3a",
  rot:     "#cc4444",
  tiefrot: "#992222",
};
const CAT_LABELS = { AKQUISE: "Akquise ×5", HYGIENE: "Hygiene ×1", SABOTAGE: "Sabotage ×2" };

function HabitCard({ habit, tone, done, todayN, total, pendingDelete, disabled, onRecord, onDelete }) {
  const isAkquise = habit.category === "AKQUISE";
  const blocked = done && !isAkquise;
  const statusLabel = tone === "new"
    ? todayN > 0
      ? todayN > 1 ? `${todayN}× heute` : "heute"
      : "offen"
    : todayN > 0
    ? `${todayN}× passiert`
    : "vermieden";

  return (
    <article className={`habit-card ${tone} ${blocked ? "done" : ""}`}>
      <button
        type="button"
        className="habit-main"
        onClick={onRecord}
        disabled={disabled || blocked}
        aria-label={habit.label}
      >
        <span className="habit-dot" />
        <span className="habit-copy">
          <span className="habit-label">{habit.label}</span>
          <span className="habit-total">{`gesamt ${total}×`}</span>
        </span>
        <span className={`habit-status habit-status--${tone}${todayN > 0 ? " habit-status--active" : ""}${blocked ? " habit-status--done" : ""}`}>
          {isAkquise && todayN > 0 ? `${todayN}× heute` : statusLabel}
        </span>
      </button>
      <button
        type="button"
        className={`delete-btn${pendingDelete === habit.id ? " delete-btn--confirm" : ""}`}
        onClick={onDelete}
        disabled={disabled}
        aria-label={pendingDelete === habit.id ? `${habit.label} wirklich löschen` : `${habit.label} löschen`}
      >
        {pendingDelete === habit.id ? "?" : "✕"}
      </button>
    </article>
  );
}

function ScoreCard({ score: scoreData, callStreak, loading }) {
  const [open, setOpen] = useState(false);
  if (loading) return null;
  const { score, breakdown, werktag, kategorie, akquiseCount } = scoreData;
  const color = SCORE_COLORS[kategorie] || SCORE_COLORS.neutral;
  const symbol = SCORE_SYMBOLS[kategorie] || "→";

  const nextHint = werktag && akquiseCount === 0
    ? "1 Anruf → Grün möglich"
    : werktag && akquiseCount < 3
    ? `${3 - akquiseCount} Anrufe → ↗↗`
    : werktag && akquiseCount < 5
    ? `${5 - akquiseCount} Anrufe → ↗↗↗`
    : null;

  return (
    <button type="button" className="score-card" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
      <div className="score-main">
        <span className="score-label">{werktag ? "Tages-Score" : "Wochenende"}</span>
        <span className="score-value" style={{ color }}>{score > 0 ? `+${score}` : score}</span>
        <span className="score-symbol" style={{ color }}>{symbol}</span>
        {callStreak >= 2 && (
          <span className="score-streak-inline">
            <span className="fire-emoji">🔥</span>
            <span className="score-streak-count">{callStreak}</span>
          </span>
        )}
      </div>
      {nextHint && !open && (
        <p className="score-hint">{nextHint}</p>
      )}
      {open && breakdown.length > 0 && (
        <div className="score-breakdown">
          {breakdown.map((item, i) => (
            <div key={i} className="score-row">
              <span className="score-row-label">{item.label}</span>
              <span className="score-row-cat">{CAT_LABELS[item.category]}</span>
              <span className="score-row-pts" style={{ color: item.points >= 0 ? SCORE_COLORS.gelb : SCORE_COLORS.rot }}>
                {item.points > 0 ? `+${item.points}` : item.points}
              </span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}
