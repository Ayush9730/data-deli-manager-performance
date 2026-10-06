// Pure client-side data-mining algorithms: k-means, kNN classification,
// Apriori association rules, linear regression and outlier detection.

export type Row = Record<string, string | number>;

export interface Schema {
  nameCol: string | null;
  classCol: string | null;
  numericCols: string[];
  categoricalCols: string[];
}

export function detectSchema(rows: Row[]): Schema {
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const numericCols: string[] = [];
  const categoricalCols: string[] = [];
  for (const c of cols) {
    const vals = rows.map((r) => r[c]).filter((v) => v !== "" && v != null);
    const nums = vals.filter((v) => !isNaN(Number(v)));
    if (vals.length && nums.length / vals.length > 0.9 && !/id$/i.test(c)) numericCols.push(c);
    else categoricalCols.push(c);
  }
  const uniq = (c: string) => new Set(rows.map((r) => r[c])).size;
  const nameCol =
    categoricalCols.find((c) => /name|title/i.test(c)) ?? categoricalCols.find((c) => /product|item/i.test(c) && !/id$/i.test(c)) ??
    [...categoricalCols].sort((a, b) => uniq(b) - uniq(a))[0] ?? null;
  const classCol =
    categoricalCols.find((c) => /categ|class|type|aisle|dept|segment/i.test(c) && c !== nameCol) ??
    categoricalCols.filter((c) => c !== nameCol && uniq(c) > 1 && uniq(c) <= 20)[0] ?? null;
  return { nameCol, classCol, numericCols, categoricalCols };
}

export const num = (v: unknown) => {
  const n = Number(v);
  return isFinite(n) ? n : 0;
};

// ---------- normalization ----------
export function scaler(rows: Row[], cols: string[]) {
  const stats = cols.map((c) => {
    const v = rows.map((r) => num(r[c]));
    const mean = v.reduce((a, b) => a + b, 0) / (v.length || 1);
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length || 1)) || 1;
    return { mean, sd };
  });
  return (r: Row) => cols.map((c, i) => (num(r[c]) - stats[i].mean) / stats[i].sd);
}

const dist = (a: number[], b: number[]) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));

// ---------- k-means ----------
export function kmeans(points: number[][], k: number, iters = 60) {
  if (!points.length) return { labels: [] as number[], centroids: [] as number[][], silhouette: 0 };
  k = Math.max(1, Math.min(k, points.length));
  // k-means++ deterministic-ish init
  const centroids: number[][] = [points[0]];
  while (centroids.length < k) {
    let best = 0, bestD = -1;
    points.forEach((p, i) => {
      const d = Math.min(...centroids.map((c) => dist(p, c)));
      if (d > bestD) { bestD = d; best = i; }
    });
    centroids.push(points[best]);
  }
  let labels = new Array(points.length).fill(0);
  for (let it = 0; it < iters; it++) {
    const next = points.map((p) => {
      let bi = 0, bd = Infinity;
      centroids.forEach((c, i) => { const d = dist(p, c); if (d < bd) { bd = d; bi = i; } });
      return bi;
    });
    const changed = next.some((l, i) => l !== labels[i]);
    labels = next;
    for (let j = 0; j < k; j++) {
      const m = points.filter((_, i) => labels[i] === j);
      if (m.length) centroids[j] = m[0].map((_, d) => m.reduce((s, p) => s + p[d], 0) / m.length);
    }
    if (!changed && it > 0) break;
  }
  return { labels, centroids, silhouette: silhouette(points, labels, k) };
}

function silhouette(points: number[][], labels: number[], k: number) {
  if (k < 2) return 0;
  const sample = points.slice(0, 300);
  let total = 0;
  sample.forEach((p, i) => {
    const sums = new Array(k).fill(0), counts = new Array(k).fill(0);
    sample.forEach((q, j) => { if (i !== j) { sums[labels[j]] += dist(p, q); counts[labels[j]]++; } });
    const a = counts[labels[i]] ? sums[labels[i]] / counts[labels[i]] : 0;
    let b = Infinity;
    for (let c = 0; c < k; c++) if (c !== labels[i] && counts[c]) b = Math.min(b, sums[c] / counts[c]);
    total += b === Infinity ? 0 : (b - a) / Math.max(a, b);
  });
  return total / sample.length;
}

export function nearestCentroid(p: number[], centroids: number[][]) {
  let bi = 0, bd = Infinity;
  centroids.forEach((c, i) => { const d = dist(p, c); if (d < bd) { bd = d; bi = i; } });
  return bi;
}

// ---------- kNN classifier ----------
export function knnPredict(train: { x: number[]; y: string }[], p: number[], k = 5, skip = -1) {
  const ds = train
    .map((t, i) => ({ d: i === skip ? Infinity : dist(t.x, p), y: t.y }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k);
  const votes: Record<string, number> = {};
  ds.forEach((d) => (votes[d.y] = (votes[d.y] ?? 0) + 1 / (d.d + 1e-6)));
  const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0) || 1;
  return { label: sorted[0]?.[0] ?? "?", confidence: (sorted[0]?.[1] ?? 0) / total };
}

export function evaluateKnn(train: { x: number[]; y: string }[], k = 5) {
  const sample = train.slice(0, 500);
  const classes = [...new Set(sample.map((t) => t.y))];
  const matrix: Record<string, Record<string, number>> = {};
  classes.forEach((a) => { matrix[a] = {}; classes.forEach((b) => (matrix[a][b] = 0)); });
  let correct = 0;
  sample.forEach((t, i) => {
    const { label } = knnPredict(sample, t.x, k, i);
    if (label === t.y) correct++;
    if (matrix[t.y]?.[label] !== undefined) matrix[t.y][label]++;
  });
  const f1s = classes.map((c) => {
    const tp = matrix[c][c];
    const fp = classes.reduce((s, o) => s + (o !== c ? matrix[o][c] : 0), 0);
    const fn = classes.reduce((s, o) => s + (o !== c ? matrix[c][o] : 0), 0);
    const p = tp / (tp + fp || 1), r = tp / (tp + fn || 1);
    return p + r ? (2 * p * r) / (p + r) : 0;
  });
  return {
    accuracy: correct / (sample.length || 1),
    f1: f1s.reduce((a, b) => a + b, 0) / (f1s.length || 1),
    classes,
    matrix,
  };
}

// ---------- discretization for Apriori ----------
export function binLabel(v: number, q1: number, q2: number) {
  return v <= q1 ? "Low" : v <= q2 ? "Mid" : "High";
}
export function quantiles(vals: number[]) {
  const s = [...vals].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
  return { q1: at(1 / 3), q2: at(2 / 3), p25: at(0.25), p75: at(0.75) };
}

// ---------- Apriori ----------
export interface Rule {
  antecedent: string[];
  consequent: string[];
  support: number;
  confidence: number;
  lift: number;
}

export function apriori(transactions: string[][], minSupport = 0.08, minConf = 0.5, maxLen = 3): Rule[] {
  const n = transactions.length;
  if (!n) return [];
  const sets = transactions.map((t) => new Set(t));
  const supportOf = new Map<string, number>();
  const key = (items: string[]) => [...items].sort().join("||");
  const count = (items: string[]) => {
    const k = key(items);
    if (supportOf.has(k)) return supportOf.get(k)!;
    const c = sets.filter((s) => items.every((i) => s.has(i))).length / n;
    supportOf.set(k, c);
    return c;
  };
  const items = [...new Set(transactions.flat())];
  let level = items.filter((i) => count([i]) >= minSupport).map((i) => [i]);
  const frequent: string[][] = [];
  for (let len = 2; len <= maxLen && level.length; len++) {
    const cands = new Map<string, string[]>();
    for (let i = 0; i < level.length; i++)
      for (let j = i + 1; j < level.length; j++) {
        const u = [...new Set([...level[i], ...level[j]])].sort();
        if (u.length === len) {
          // skip itemsets with two values of the same attribute
          const attrs = u.map((x) => x.split("=")[0]);
          if (new Set(attrs).size === attrs.length) cands.set(key(u), u);
        }
      }
    level = [...cands.values()].filter((c) => count(c) >= minSupport);
    frequent.push(...level);
    if (cands.size > 4000) break;
  }
  const rules: Rule[] = [];
  for (const set of frequent) {
    const sup = count(set);
    for (let mask = 1; mask < (1 << set.length) - 1; mask++) {
      const a = set.filter((_, i) => mask & (1 << i));
      const c = set.filter((_, i) => !(mask & (1 << i)));
      const conf = sup / count(a);
      if (conf >= minConf) rules.push({ antecedent: a, consequent: c, support: sup, confidence: conf, lift: conf / count(c) });
    }
  }
  return rules.sort((a, b) => b.lift - a.lift || b.confidence - a.confidence);
}

// ---------- regression ----------
export function linearRegression(xs: number[], ys: number[]) {
  const n = xs.length || 1;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
  const slope = sxx ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  const r2 = sxx && syy ? (sxy * sxy) / (sxx * syy) : 0;
  return { slope, intercept, r2, predict: (x: number) => slope * x + intercept };
}

// ---------- outliers ----------
export function zScores(vals: number[]) {
  const n = vals.length || 1;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;
  return vals.map((v) => (v - mean) / sd);
}
