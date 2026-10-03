export type Star = readonly [x: number, y: number, size: 1 | 2 | 3];

export interface Constellation {
  sign: string;
  /** First and last day of the sign's season as [month (1–12), day]. */
  from: readonly [number, number];
  to: readonly [number, number];
  /** Stylized star positions inside a 100 × 60 box. */
  stars: readonly Star[];
  lines: readonly (readonly [number, number])[];
}

export const CONSTELLATIONS: readonly Constellation[] = [
  {
    sign: 'Aries',
    from: [3, 21],
    to: [4, 19],
    stars: [
      [84, 16, 2],
      [60, 22, 3],
      [36, 34, 2],
      [28, 44, 1],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  },
  {
    sign: 'Taurus',
    from: [4, 20],
    to: [5, 20],
    stars: [
      [50, 40, 2],
      [40, 34, 3],
      [12, 22, 2],
      [56, 33, 2],
      [30, 8, 3],
      [62, 50, 1],
      [84, 14, 1],
      [88, 18, 1],
      [86, 10, 1],
      [81, 18, 1],
    ],
    lines: [
      [5, 0],
      [0, 1],
      [1, 2],
      [0, 3],
      [3, 4],
    ],
  },
  {
    sign: 'Gemini',
    from: [5, 21],
    to: [6, 20],
    stars: [
      [30, 8, 3],
      [46, 12, 3],
      [26, 28, 2],
      [18, 50, 2],
      [44, 32, 2],
      [40, 54, 3],
      [8, 54, 1],
    ],
    lines: [
      [0, 2],
      [2, 3],
      [3, 6],
      [1, 4],
      [4, 5],
      [0, 1],
      [2, 4],
    ],
  },
  {
    sign: 'Cancer',
    from: [6, 21],
    to: [7, 22],
    stars: [
      [50, 30, 2],
      [46, 18, 2],
      [40, 6, 1],
      [36, 52, 2],
      [74, 46, 3],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [0, 3],
      [0, 4],
    ],
  },
  {
    sign: 'Leo',
    from: [7, 23],
    to: [8, 22],
    stars: [
      [30, 46, 3],
      [30, 34, 2],
      [36, 24, 3],
      [32, 14, 2],
      [24, 8, 2],
      [16, 12, 2],
      [64, 24, 2],
      [88, 32, 3],
      [64, 38, 2],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [2, 6],
      [6, 7],
      [7, 8],
      [8, 0],
      [6, 8],
    ],
  },
  {
    sign: 'Virgo',
    from: [8, 23],
    to: [9, 22],
    stars: [
      [44, 54, 3],
      [40, 40, 1],
      [36, 30, 2],
      [24, 26, 2],
      [10, 22, 2],
      [50, 24, 2],
      [62, 10, 2],
      [58, 38, 2],
      [72, 34, 1],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [2, 5],
      [5, 6],
      [5, 7],
      [7, 0],
      [7, 8],
    ],
  },
  {
    sign: 'Libra',
    from: [9, 23],
    to: [10, 22],
    stars: [
      [48, 10, 3],
      [28, 32, 3],
      [70, 28, 2],
      [22, 54, 2],
      [74, 50, 1],
    ],
    lines: [
      [0, 1],
      [0, 2],
      [1, 2],
      [1, 3],
      [2, 4],
    ],
  },
  {
    sign: 'Scorpio',
    from: [10, 23],
    to: [11, 21],
    stars: [
      [80, 6, 2],
      [84, 16, 2],
      [82, 26, 2],
      [70, 20, 1],
      [62, 26, 3],
      [56, 32, 1],
      [50, 40, 2],
      [46, 48, 1],
      [40, 54, 1],
      [30, 56, 1],
      [20, 52, 2],
      [12, 44, 2],
      [14, 36, 2],
      [22, 38, 3],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [1, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [9, 10],
      [10, 11],
      [11, 12],
      [12, 13],
    ],
  },
  {
    sign: 'Sagittarius',
    from: [11, 22],
    to: [12, 21],
    stars: [
      [26, 30, 2],
      [42, 28, 2],
      [40, 44, 3],
      [62, 42, 2],
      [56, 26, 2],
      [48, 12, 2],
      [70, 20, 3],
      [76, 34, 2],
    ],
    lines: [
      [0, 1],
      [0, 2],
      [1, 2],
      [1, 5],
      [5, 4],
      [4, 1],
      [4, 6],
      [6, 7],
      [7, 3],
      [3, 2],
      [3, 4],
    ],
  },
  {
    sign: 'Capricorn',
    from: [12, 22],
    to: [1, 19],
    stars: [
      [14, 12, 2],
      [18, 20, 2],
      [30, 46, 1],
      [40, 54, 2],
      [64, 44, 2],
      [86, 18, 3],
      [76, 20, 2],
      [60, 22, 1],
      [44, 22, 1],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 1],
    ],
  },
  {
    sign: 'Aquarius',
    from: [1, 20],
    to: [2, 18],
    stars: [
      [8, 34, 2],
      [20, 24, 3],
      [34, 16, 3],
      [40, 22, 1],
      [46, 16, 2],
      [50, 22, 1],
      [38, 32, 1],
      [44, 46, 2],
      [56, 36, 1],
      [66, 46, 1],
      [74, 40, 1],
      [84, 52, 1],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [2, 6],
      [6, 7],
      [6, 8],
      [8, 9],
      [9, 10],
      [10, 11],
    ],
  },
  {
    sign: 'Pisces',
    from: [2, 19],
    to: [3, 20],
    stars: [
      [50, 54, 3],
      [42, 48, 1],
      [34, 44, 1],
      [28, 40, 1],
      [22, 36, 2],
      [14, 30, 2],
      [6, 36, 1],
      [8, 46, 1],
      [18, 46, 1],
      [58, 42, 1],
      [64, 32, 2],
      [70, 22, 1],
      [76, 14, 1],
      [84, 8, 1],
      [90, 14, 1],
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 4],
      [0, 9],
      [9, 10],
      [10, 11],
      [11, 12],
      [12, 13],
      [13, 14],
      [14, 12],
    ],
  },
];

/** The sign whose season contains the given date (tropical zodiac dates). */
export function zodiacSeason(date: Date): Constellation {
  const today = (date.getMonth() + 1) * 100 + date.getDate();
  let current = CONSTELLATIONS.find((c) => c.sign === 'Capricorn')!;
  let latestStart = -1;
  for (const c of CONSTELLATIONS) {
    const start = c.from[0] * 100 + c.from[1];
    if (start <= today && start > latestStart) {
      latestStart = start;
      current = c;
    }
  }
  return current;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function seasonRange(c: Constellation): string {
  return `${MONTHS[c.from[0] - 1]} ${c.from[1]} – ${MONTHS[c.to[0] - 1]} ${c.to[1]}`;
}
