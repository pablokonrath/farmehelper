export const DROP_LOG_REGEX = /\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\]: Dropou: \$(\d+)#(.+)\$/;

export function todayISODate() {
  return new Date().toISOString().split('T')[0];
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
