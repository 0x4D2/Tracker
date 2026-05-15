import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const INITIAL_STATE = {
  habits: { new: [], old: [] },
  totals: {},
  todayEntries: [],
  recentEntries: [],
  weekData: [],
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


function drawFire(ctx, x, y, time, streak) {
  const intensity = Math.min(0.5 + streak * 0.1, 1.5);
  const particles = Math.min(6 + streak, 14);
  for (let i = 0; i < particles; i++) {
    const phase = (time * 0.0018 + i * 0.63) % 1;
    const px = x + Math.sin(time * 0.0025 + i * 2.4) * 3.5 * intensity;
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

function drawWeb(canvas, habits, totals, lastSeen, stats, todayEntries, callStreak = 0, time = 0, flash = null) {
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

  const totalNewStrength = habits.new.reduce(
    (sum, habit) => sum + Math.log((totals[habit.id] || 0) + 1),
    0
  );
  const totalOldStrength = habits.old.reduce(
    (sum, habit) => sum + Math.log((totals[habit.id] || 0) + 1),
    0
  );
  const collapseFactor = Math.min(totalOldStrength / Math.max(totalNewStrength + 0.6, 1), 2.2);
  const centerPullY = Math.max(
    Math.min((totalOldStrength - totalNewStrength) * (isCompact ? 2.2 : 2.8), size * 0.065),
    -size * 0.035
  );
  const centerX = baseCenterX;
  const centerY = baseCenterY + centerPullY;

  if (!allHabits.length) {
    drawCenter(context, centerX, centerY, isCompact, stats?.direction?.tone, todaySummary, time);
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
  atmosphere.addColorStop(0, "rgba(201,168,76,0.025)");
  atmosphere.addColorStop(0.42, "rgba(45,28,14,0.035)");
  atmosphere.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = atmosphere;
  context.fillRect(0, 0, size, size);



  const vignette = context.createRadialGradient(centerX, centerY, size * 0.12, centerX, centerY, size * 0.76);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.7, "rgba(0,0,0,0.22)");
  vignette.addColorStop(1, "rgba(0,0,0,0.56)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, size, size);

  for (let ring = 1; ring <= rings; ring += 1) {
    const ringRadius = (ring / rings) * baseRadius;
    const ringAlpha = 0.06 + (ring / rings) * 0.04;

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
    context.lineWidth = 0.7;
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
        ? `rgba(201,168,76,${ringAlpha * 1.4})`
        : `rgba(204,88,88,${ringAlpha * 1.4})`;
      context.lineWidth = 0.8;
      context.stroke();
    }
  }

  const meshFractions = [0.24, 0.38, 0.52, 0.66];
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
          ? Math.min(0.008 + sharedStrength * 0.006 + meshIndex * 0.0015, 0.075)
          : Math.min(0.004 + sharedStrength * 0.002, 0.02);
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
            ? `rgba(201,168,76,${alpha})`
            : `rgba(204,68,68,${Math.max(alpha - 0.01, 0.025)})`
          : `rgba(88,72,52,${alpha})`;
        context.lineWidth = sameZone ? 0.36 : 0.24;
        if (sameZone && sharedStrength > 4) {
          context.shadowColor = current.type === "new" ? "#c9a84c" : "#cc4444";
          context.shadowBlur = Math.min(2 + sharedStrength * 0.22, 6);
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
        ? Math.min(0.05 + sharedStrength * 0.012 + fractionA * 0.01, 0.22)
        : Math.min(0.025 + sharedStrength * 0.005, 0.08);
      const lineWidth = (isCompact ? 0.3 : 0.35) + Math.min(sharedStrength * 0.05, 0.65);
      let stroke = `rgba(100,90,60,${alpha})`;

      if (sameZone && current.type === "new") {
        stroke = `rgba(201,168,76,${alpha})`;
      } else if (sameZone && current.type === "old") {
        stroke = `rgba(204,68,68,${Math.max(alpha - 0.01, 0.03)})`;
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

  spokes.forEach((spoke) => {
    const count = totals[spoke.id] || 0;
    const isNew = spoke.type === "new";
    const decay = isNew ? 1.0 : oldHabitDecay(lastSeen[spoke.id]);

    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(spoke.endX, spoke.endY);
    context.strokeStyle = isNew ? "rgba(201,168,76,0.06)" : `rgba(204,68,68,${0.06 * decay})`;
    context.lineWidth = 0.5;
    context.stroke();

    if (count > 0) {
      const flashIntensity = flash && flash.habitId === spoke.id
        ? Math.max(0, 1 - (Date.now() - flash.startTime) / 400)
        : 0;
      const thickness = ((isCompact ? 0.65 : 0.8) + Math.log(count + 1) * (isCompact ? 1.8 : 2.2)) * (isNew ? 1 : decay);
      const brightness = Math.min((0.15 + Math.log(count + 1) * 0.12) * (isNew ? 1 : decay) + flashIntensity * 0.5, 1);
      const glowSize = ((isCompact ? 2 : 3) + Math.log(count + 1) * (isCompact ? 2.2 : 3)) * (isNew ? 1 : decay);
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
      ? `rgba(240,208,128,${count > 0 ? Math.min(0.52 + Math.log(count + 1) * 0.12, 0.98) : 0.4})`
      : `rgba(255,168,168,${count > 0 ? Math.min((0.5 + Math.log(count + 1) * 0.11) * decay, 0.96) : 0.38 * decay})`;
    drawTextWithHalo(context, spoke.label, clampedLabelX, labelY, {
      font: `${count > 10 ? "600" : "500"} ${isCompact ? 9.25 : 10.75}px serif`,
      align: labelAlign,
      fillStyle: labelColor,
      strokeWidth: isCompact ? 3.8 : 4.4,
      shadowColor: isNew ? "rgba(201,168,76,0.18)" : "rgba(204,68,68,0.22)",
      shadowBlur: isCompact ? 7 : 9,
    });

    if (count > 0) {
      context.font = `500 ${isCompact ? 7.75 : 8.5}px serif`;
      const badgeYOffset = Math.sin(spoke.radians) >= 0 ? (isCompact ? 11 : 13) : (isCompact ? -11 : -13);
      drawTextWithHalo(context, `x${count}`, clampedLabelX, labelY + badgeYOffset, {
        font: `600 ${isCompact ? 8 : 8.9}px serif`,
        align: labelAlign,
        fillStyle: isNew ? "rgba(240,208,128,0.84)" : "rgba(255,176,176,0.82)",
        strokeWidth: isCompact ? 3 : 3.5,
        shadowColor: isNew ? "rgba(201,168,76,0.16)" : "rgba(204,68,68,0.2)",
        shadowBlur: isCompact ? 5 : 7,
      });
    }

    if (count > 0) {
      context.beginPath();
      context.arc(spoke.endX, spoke.endY, isCompact ? 2.1 : 2.6, 0, Math.PI * 2);
      context.fillStyle = isNew ? "rgba(240,208,128,0.76)" : "rgba(255,150,150,0.68)";
      context.shadowColor = isNew ? "#f0d080" : "#ff9c9c";
      context.shadowBlur = 7;
      context.fill();
      context.shadowBlur = 0;
    }

  });

if (collapseFactor > 0.72) {
    for (let i = 0; i < Math.min(3 + Math.floor(collapseFactor), 5); i += 1) {
      const arcRadius = baseRadius * (0.42 + i * 0.08);
      const arcStart = (145 + i * 10) * (Math.PI / 180);
      const arcEnd = (212 + i * 8) * (Math.PI / 180);
      context.beginPath();
      context.arc(centerX, centerY + i * 2.5, arcRadius, arcStart, arcEnd, false);
      context.strokeStyle = `rgba(204,68,68,${Math.min(0.04 + collapseFactor * 0.025, 0.11)})`;
      context.lineWidth = 0.45;
      context.stroke();
    }
  }


  // Feuer am AKQUISE-Spoke wenn Streak aktiv
  if (callStreak >= 1) {
    const akquiseSpoke = spokes.find((s) => s.category === "AKQUISE");
    if (akquiseSpoke) {
      drawFire(context, akquiseSpoke.endX, akquiseSpoke.endY, time, callStreak);
    }
  }

  drawCenter(context, centerX, centerY, isCompact, stats?.direction?.tone, todaySummary, time);
}

function drawCenter(context, centerX, centerY, isCompact = false, tone = "dim", todaySummary = { new: 0, old: 0 }, time = 0) {
  const pulse = 1 + Math.sin(time * 0.0032) * (todaySummary.new !== 0 || todaySummary.old !== 0 ? 0.03 : 0.015);
  const radius = (isCompact ? 8 : 10) * pulse;
  const diff = Math.abs((todaySummary?.new || 0) - (todaySummary?.old || 0));
  const dominantTone = todaySummary.new > todaySummary.old ? "gold" : todaySummary.old > todaySummary.new ? "red" : tone;
  const innerColor = dominantTone === "red" ? "#ffaaaa" : "#f0d080";
  const midColor = dominantTone === "red" ? "#cc4444" : "#c9a84c";
  const outerAlpha = todaySummary.new === 0 && todaySummary.old === 0 ? 0.14 : Math.min(0.24 + diff * 0.04, 0.5);
  const shadowColor = dominantTone === "red" ? "#cc4444" : "#c9a84c";
  const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  gradient.addColorStop(0, innerColor);
  gradient.addColorStop(0.6, midColor);
  gradient.addColorStop(1, dominantTone === "red" ? `rgba(204,68,68,${outerAlpha})` : `rgba(201,168,76,${outerAlpha})`);
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fillStyle = gradient;
  context.shadowColor = shadowColor;
  context.shadowBlur = todaySummary.new === 0 && todaySummary.old === 0 ? 16 : Math.min(24 + diff * 4, 42);
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
  const canvasRef = useRef(null);
  const stateRef = useRef(INITIAL_STATE);
  const flashRef = useRef(null);
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
  const [drafts, setDrafts] = useState({ new: "", old: "", newCat: null, oldCat: null });
  const [todayLabel, setTodayLabel] = useState("");
  const [note, setNote] = useState("");
  const [noteSaveState, setNoteSaveState] = useState("idle");
  const [lastRecorded, setLastRecorded] = useState(null);
  const completedToday = isDevMode ? new Set() : new Set(state.todayEntries.map((entry) => entry.habitId));
  const todayCountPerHabit = state.todayEntries.reduce((acc, e) => {
    acc[e.habitId] = (acc[e.habitId] || 0) + 1;
    return acc;
  }, {});

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    noteValueRef.current = note;
  }, [note]);

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
    const FRAME_INTERVAL = 1000 / 30;

    function renderFrame(frameTime) {
      frameId = window.requestAnimationFrame(renderFrame);
      if (frameTime - lastFrameTime < FRAME_INTERVAL) {
        return;
      }
      lastFrameTime = frameTime;
      const liveState = stateRef.current;
      drawWeb(
        canvasRef.current,
        liveState.habits,
        liveState.totals,
        liveState.lastSeen,
        liveState.stats,
        liveState.todayEntries,
        liveState.callStreak,
        frameTime,
        flashRef.current
      );
    }

    frameId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(frameId);
  }, []);


  async function runAction(action, successMessage) {
    setBusy(true);
    setError("");
    setMessage("");

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
    flashRef.current = { habitId, startTime: Date.now() };
    if (navigator.vibrate) navigator.vibrate(42);
    runAction(() => request("/api/entries", { method: "POST", body: JSON.stringify({ habitId }) }));
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

        <section className="status-grid" aria-label="Status">
          <article className="status-card">
            <span className="status-label">Tage übrig</span>
            <strong className="status-value dim">{loading ? "—" : state.stats.daysLeft}</strong>
            <span className="status-meta">von {state.stats.daysTotal}</span>
          </article>
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
          <canvas ref={canvasRef} className="web-canvas" aria-label="Netz-Visualisierung" />
        </section>

        <section className="controls">
          <section className="note-section">
            <p className="section-label muted">
              Notiz
              {noteStatusLabel ? <span className={`note-status note-status--${noteSaveState}`}>{noteStatusLabel}</span> : null}
            </p>
            <textarea
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
        <span className="habit-label">{habit.label}</span>
        {isAkquise
          ? <span className="habit-count akquise-count">{todayN > 0 ? `${todayN}×` : "—"}</span>
          : <span className="habit-count">×{total}</span>
        }
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
