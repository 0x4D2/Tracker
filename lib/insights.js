export function formatWeekdayShort(dateStr) {
  return new Intl.DateTimeFormat("de-DE", { weekday: "short" })
    .format(new Date(`${dateStr}T12:00:00`))
    .replace(".", "")
    .slice(0, 2)
    .toUpperCase();
}

export function buildWeekReview(weekData = []) {
  const days = weekData.map((day) => ({
    ...day,
    label: formatWeekdayShort(day.date),
    net: day.new - day.old,
    total: day.new + day.old,
  }));

  const totalNew = days.reduce((sum, day) => sum + day.new, 0);
  const totalOld = days.reduce((sum, day) => sum + day.old, 0);
  const activeDays = days.filter((day) => day.total > 0).length;
  const cleanDays = days.filter((day) => day.new > 0 && day.old === 0).length;
  const dominantNewDays = days.filter((day) => day.net > 0).length;
  const dominantOldDays = days.filter((day) => day.net < 0).length;
  const strongestDay = days.reduce(
    (best, day) => (day.net > best.net || (day.net === best.net && day.new > best.new) ? day : best),
    days[0] || { label: "--", net: 0, new: 0, old: 0 }
  );
  const heaviestDay = days.reduce(
    (worst, day) => (day.old > worst.old || (day.old === worst.old && day.net < worst.net) ? day : worst),
    days[0] || { label: "--", net: 0, new: 0, old: 0 }
  );
  const firstHalfNet = days.slice(0, 3).reduce((sum, day) => sum + day.net, 0);
  const secondHalfNet = days.slice(-3).reduce((sum, day) => sum + day.net, 0);
  const momentum = secondHalfNet - firstHalfNet;

  let verdict = {
    title: "Woche noch offen",
    tone: "neutral",
    text: "Es gibt noch kein klares Muster in den letzten sieben Tagen.",
  };

  if (totalNew === 0 && totalOld === 0) {
    verdict = {
      title: "Leere Woche",
      tone: "neutral",
      text: "Noch keine Einträge. Sobald etwas passiert, zeigt der Rückblick Richtung und Druck.",
    };
  } else if (totalNew >= totalOld + 4) {
    verdict = {
      title: "Woche im Aufbau",
      tone: "gold",
      text: `Du liegst ${totalNew - totalOld} Punkte Eintragsvolumen vor dem alten Ich.`,
    };
  } else if (totalOld >= totalNew + 3) {
    verdict = {
      title: "Woche unter Zug",
      tone: "red",
      text: `Die alten Muster drücken mit ${totalOld - totalNew} Einträgen Vorsprung.`,
    };
  }

  const insights = [];

  insights.push({
    label: "Volumen",
    value: `${totalNew} gut / ${totalOld} alt`,
    tone: totalNew >= totalOld ? "gold" : "red",
  });

  insights.push({
    label: "Saubere Tage",
    value: `${cleanDays} von ${days.length}`,
    tone: cleanDays >= 4 ? "gold" : cleanDays === 0 ? "red" : "neutral",
  });

  if (strongestDay.total > 0) {
    insights.push({
      label: "Stärkster Tag",
      value: strongestDay.net > 0
        ? `${strongestDay.label} · +${strongestDay.net}`
        : `${strongestDay.label} · ${strongestDay.net}`,
      tone: strongestDay.net > 0 ? "gold" : strongestDay.net < 0 ? "red" : "neutral",
    });
  }

  if (heaviestDay.old > 0) {
    insights.push({
      label: "Risikotag",
      value: `${heaviestDay.label} · ${heaviestDay.old} alte Muster`,
      tone: "red",
    });
  }

  insights.push({
    label: "Tendenz",
    value: momentum > 1
      ? "Die zweite Wochenhälfte zieht an."
      : momentum < -1
      ? "Zum Wochenende kippt die Spannung."
      : dominantNewDays > dominantOldDays
      ? "Die Woche bleibt leicht auf Aufbau."
      : dominantOldDays > dominantNewDays
      ? "Die Woche bleibt leicht auf Abwehr."
      : "Die Woche ist noch unentschieden.",
    tone: momentum > 1 || dominantNewDays > dominantOldDays ? "gold" : momentum < -1 || dominantOldDays > dominantNewDays ? "red" : "neutral",
  });

  return {
    days,
    totalNew,
    totalOld,
    activeDays,
    verdict,
    insights,
  };
}

function scoreTone(category) {
  if (["gold", "gruen2", "gruen", "gelb"].includes(category)) {
    return "gold";
  }

  if (["rot", "tiefrot"].includes(category)) {
    return "red";
  }

  return "neutral";
}

export function buildStatsSnapshot(state) {
  const habits = state?.habits || { new: [], old: [] };
  const totals = state?.totals || {};
  const score = state?.score || { score: 0, kategorie: "neutral" };
  const stats = state?.stats || { streak: 0, direction: { tone: "neutral", text: "noch keine Daten" } };
  const callStreak = state?.callStreak || 0;
  const review = buildWeekReview(state?.weekData || []);

  const totalNewEntries = habits.new.reduce((sum, habit) => sum + (totals[habit.id] || 0), 0);
  const totalOldEntries = habits.old.reduce((sum, habit) => sum + (totals[habit.id] || 0), 0);
  const totalEntries = totalNewEntries + totalOldEntries;
  const newLeader = habits.new.reduce(
    (best, habit) => ((totals[habit.id] || 0) > (totals[best?.id] || 0) ? habit : best),
    null
  );
  const oldLeader = habits.old.reduce(
    (best, habit) => ((totals[habit.id] || 0) > (totals[best?.id] || 0) ? habit : best),
    null
  );

  let lead = "Noch wenig Material. Sobald du ein paar Tage drin hast, wird die Lage klarer.";
  if (review.totalNew || review.totalOld) {
    lead = `${review.verdict.text} ${stats.direction?.text || ""}`.trim();
  }

  return {
    lead,
    cards: [
      {
        label: "Einträge gesamt",
        value: totalEntries,
        meta: `${habits.new.length + habits.old.length} Stränge im System`,
        tone: "neutral",
      },
      {
        label: "Neue Fäden",
        value: totalNewEntries,
        meta: `${habits.new.length} aktive Aufbau-Stränge`,
        tone: "gold",
      },
      {
        label: "Alte Fäden",
        value: totalOldEntries,
        meta: `${habits.old.length} beobachtete Muster`,
        tone: "red",
      },
      {
        label: "Anruf-Serie",
        value: callStreak,
        meta: callStreak > 0 ? "Werktage am Stück" : "noch kein Lauf aktiv",
        tone: callStreak > 0 ? "gold" : "neutral",
      },
    ],
    highlights: [
      {
        label: "Richtung",
        value: stats.direction?.text || "noch keine Daten",
        tone: stats.direction?.tone || "neutral",
      },
      {
        label: "Stärkster Aufbau",
        value: newLeader ? `${newLeader.label} ×${totals[newLeader.id] || 0}` : "noch offen",
        tone: "gold",
      },
      {
        label: "Hartnäckigstes Muster",
        value: oldLeader ? `${oldLeader.label} ×${totals[oldLeader.id] || 0}` : "noch offen",
        tone: "red",
      },
      {
        label: "Tages-Score",
        value: `${score.score > 0 ? `+${score.score}` : score.score}`,
        tone: scoreTone(score.kategorie),
      },
      {
        label: "Streak",
        value: `${stats.streak || 0} Tage in Folge`,
        tone: (stats.streak || 0) >= 3 ? "gold" : "neutral",
      },
      {
        label: "Wochensaldo",
        value: `${review.totalNew - review.totalOld > 0 ? "+" : ""}${review.totalNew - review.totalOld}`,
        tone: review.totalNew > review.totalOld ? "gold" : review.totalOld > review.totalNew ? "red" : "neutral",
      },
    ],
  };
}