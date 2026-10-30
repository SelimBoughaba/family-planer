/** Emoji passend zum Titel eines Termins, für Countdowns */
const RULES: [RegExp, string][] = [
  [/geburtstag|b-?day|geb\.|party.*jahre|wird \d+/i, "🎂"],
  [/hochzeit|heirat|standesamt/i, "💍"],
  [/weihnacht|heiligabend|advent|nikolaus/i, "🎄"],
  [/silvester|neujahr/i, "🎆"],
  [/ostern|oster/i, "🐣"],
  [/halloween/i, "🎃"],
  [/urlaub|ferien|reise|flug|flieg|trip|abflug/i, "✈️"],
  [/strand|meer|insel|see\b|baden/i, "🏖️"],
  [/ski|schnee|berg|wandern|alpen/i, "🏔️"],
  [/konzert|festival|musik|oper|musical/i, "🎶"],
  [/kino|film/i, "🎬"],
  [/fußball|fussball|spiel|turnier|match|stadion/i, "⚽️"],
  [/zeugnis|abschluss|abitur|abi\b|prüfung|examen|klausur/i, "🎓"],
  [/einschulung|schulstart|schule/i, "🎒"],
  [/umzug|einzug|wohnung|haus/i, "🏡"],
  [/baby|geburt/i, "👶"],
  [/jubiläum|jahrestag/i, "🥂"],
  [/essen|restaurant|dinner|grill/i, "🍽️"],
  [/zoo|tier/i, "🦁"],
  [/freizeitpark|achterbahn|europa-park|phantasialand/i, "🎢"],
  [/besuch|oma|opa/i, "🫶"],
];

export function suggestEmoji(title: string) {
  for (const [re, e] of RULES) if (re.test(title)) return e;
  return "🎉";
}

export const COUNTDOWN_EMOJIS = ["🎉", "🎂", "✈️", "🏖️", "🎄", "🎆", "🎶", "⚽️", "🎓", "🏡", "🎢", "💍", "🥂", "🎁"];

/** „noch 12 Tage“ und Live-Anteil am letzten Tag */
export function countdownParts(now: number, start: number) {
  const ms = start - now;
  if (ms <= 0) return { done: true as const };
  const totalMin = Math.floor(ms / 60000);
  // Tage wie im Kalender gezählt: Mittwoch in 12 Tagen bleibt den ganzen Tag „12 Tage“
  const day0 = new Date(now);
  day0.setHours(0, 0, 0, 0);
  const day1 = new Date(start);
  day1.setHours(0, 0, 0, 0);
  const days = Math.round((+day1 - +day0) / 86400000);
  return {
    done: false as const,
    days,
    hours: Math.floor((ms % 86400000) / 3600000),
    minutes: totalMin % 60,
    seconds: Math.floor(ms / 1000) % 60,
    live: ms < 86400000,
  };
}
