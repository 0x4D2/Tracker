const WEIGHTS = { AKQUISE: 5, HYGIENE: 1, SABOTAGE: -2 };

export function isWerktag(dateStr) {
  const date = new Date(dateStr + "T12:00:00");
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function bestimmeKategorie(score, werktag, akquiseCount) {
  if (werktag) {
    if (akquiseCount >= 5 && score >= 20) return "gold";
    if (akquiseCount >= 3 && score >= 10) return "gruen2";
    if (akquiseCount >= 1 && score >= 5)  return "gruen";
    if (score >= 1) return "gelb";
    if (score === 0) return "neutral";
    if (score >= -4) return "rot";
    return "tiefrot";
  } else {
    if (score >= 4) return "gruen";
    if (score >= 1) return "gelb";
    if (score === 0) return "neutral";
    return "rot";
  }
}

export function berechneScore(habits, todayEntries, dateStr) {
  const werktag = isWerktag(dateStr);

  const countPerHabit = {};
  todayEntries.forEach((entry) => {
    countPerHabit[entry.habitId] = (countPerHabit[entry.habitId] || 0) + 1;
  });

  const allHabits = [...(habits.new || []), ...(habits.old || [])];

  let score = 0;
  let akquiseCount = 0;
  const breakdown = [];

  allHabits.forEach((habit) => {
    if (!habit.category) return;
    const count = countPerHabit[habit.id] || 0;

    let points = 0;
    if (habit.category === "AKQUISE") {
      akquiseCount += count;
      points = werktag ? count * WEIGHTS.AKQUISE : 0;
    } else if (habit.category === "HYGIENE") {
      points = count * WEIGHTS.HYGIENE;
    } else if (habit.category === "SABOTAGE") {
      points = count * WEIGHTS.SABOTAGE;
    }

    score += points;
    breakdown.push({ label: habit.label, category: habit.category, count, points });
  });

  return {
    score,
    breakdown,
    werktag,
    akquiseCount,
    kategorie: bestimmeKategorie(score, werktag, akquiseCount),
  };
}
