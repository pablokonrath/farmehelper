export const DROP_LOG_REGEX = /\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\]: Dropou: \$(\d+)#(.+)\$/;

// new Date().toISOString() converte pra UTC — à noite no Brasil (UTC-3) isso já pode ser o
// dia seguinte, fazendo "hoje" não bater com nenhum drop do log local. Usa os componentes de
// data locais em vez disso.
export function todayISODate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function stripEnhancementSuffix(itemName) {
  return itemName.replace(/\s*\+\s*\d+$/, '').trim();
}

export function normalizeForSearch(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function parseDropLogLine(line) {
  const match = line.match(DROP_LOG_REGEX);
  if (!match) return null;
  return {
    date: match[1],
    time: match[2],
    timestamp: new Date(match[1] + 'T' + match[2]),
    category: +match[3],
    name: match[4].trim(),
  };
}
