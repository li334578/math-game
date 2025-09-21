export interface LeaderboardEntry {
  name: string;
  score: number;
  totalTime: number; // seconds
  createdAt: string; // ISO
}

export const LEADERBOARD_KEY = 'mathGame_leaderboard_v1';

function sortAndTrim(arr: LeaderboardEntry[]): LeaderboardEntry[] {
  const sorted = [...arr].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.totalTime - b.totalTime;
  });
  return sorted.slice(0, 100);
}

export function readLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    const data = raw ? (JSON.parse(raw) as LeaderboardEntry[]) : [];
    return sortAndTrim(data);
  } catch {
    return [];
  }
}

export function writeLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  const data = sortAndTrim(entries);
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(data));
  return data;
}

export function addLeaderboardEntry(entry: LeaderboardEntry): LeaderboardEntry[] {
  const arr = readLeaderboard();
  arr.push(entry);
  return writeLeaderboard(arr);
}