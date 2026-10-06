import {
  apriori, binLabel, detectSchema, evaluateKnn, kmeans, knnPredict, linearRegression,
  nearestCentroid, num, quantiles, scaler, zScores, type Row, type Schema,
} from "./mining";

export interface Product {
  idx: number;
  name: string;
  row: Row;
  isNew: boolean;
  trueClass: string | null;
  predicted: string;
  confidence: number;
  cluster: number;
  x: number;
  y: number;
  fitted: number;
  residualZ: number;
  outlier: boolean;
}

export interface Options { k: number; xCol: string; yCol: string; minSupport: number; minConf: number; zThreshold: number }

function outliersRate(products: Product[], countOnly = false) {
  const count = products.filter((p) => p.outlier).length;
  return countOnly ? count : count / (products.length || 1);
}

export function analyze(base: Row[], added: Row[], schema: Schema, o: Options) {
  const feats = schema.numericCols;
  const scale = scaler(base, feats);
  const baseX = base.map(scale);
  const km = kmeans(baseX, o.k);

  const train = schema.classCol
    ? base.map((r, i) => ({ x: baseX[i]!, y: String(r[schema.classCol!]) })).filter((t) => t.y && t.y !== "undefined")
    : base.map((_, i) => ({ x: baseX[i]!, y: `Cluster ${km.labels[i] + 1}` }));
  const evaluation = evaluateKnn(train);

  const all = [...base.map((r) => ({ r, isNew: false })), ...added.map((r) => ({ r, isNew: true }))];
  const xs = all.map(({ r }) => num(r[o.xCol]));
  const ys = all.map(({ r }) => num(r[o.yCol]));
  const reg = linearRegression(xs.slice(0, base.length), ys.slice(0, base.length));
  const resid = ys.map((y, i) => y - reg.predict(xs[i]));
  const rz = zScores(resid);

  const products: Product[] = all.map(({ r, isNew }, i) => {
    const vec = i < base.length ? baseX[i] : scale(r);
    const pred = isNew ? knnPredict(train, vec) : knnPredict(train, vec, 5, i);
    const tc = schema.classCol ? String(r[schema.classCol] ?? "") || null : null;
    return {
      idx: i,
      name: String(schema.nameCol ? r[schema.nameCol] : `Row ${i + 1}`),
      row: r,
      isNew,
      trueClass: tc,
      predicted: pred.label,
      confidence: pred.confidence,
      cluster: i < base.length ? km.labels[i] : nearestCentroid(vec, km.centroids),
      x: xs[i],
      y: ys[i],
      fitted: reg.predict(xs[i]),
      residualZ: rz[i],
      outlier: Math.abs(rz[i]) > o.zThreshold,
    };
  });

  // Apriori over discretized product attributes
  const lowCard = schema.categoricalCols.filter(
    (c) => c !== schema.nameCol && new Set(base.map((r) => r[c])).size <= 15,
  );
  const qs = Object.fromEntries(feats.map((c) => [c, quantiles(all.map(({ r }) => num(r[c])))]));
  const transactions = products.map((p) => [
    ...lowCard.map((c) => `${c}=${p.row[c]}`),
    ...feats.map((c) => `${c}=${binLabel(num(p.row[c]), qs[c].q1, qs[c].q2)}`),
    `cluster=C${p.cluster + 1}`,
  ]);
  const rules = apriori(transactions, o.minSupport, o.minConf, 3);

  // cluster profiles
  const profiles = km.centroids.map((_, c) => {
    const members = products.filter((p) => p.cluster === c);
    const counts: Record<string, number> = {};
    members.forEach((m) => (counts[m.trueClass ?? m.predicted] = (counts[m.trueClass ?? m.predicted] ?? 0) + 1));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    const avg = (col: string) => members.reduce((s, m) => s + num(m.row[col]), 0) / (members.length || 1);
    return { id: c, size: members.length, label: top?.[0] ?? "—", avgX: avg(o.xCol), avgY: avg(o.yCol) };
  });

  const avgRuleConfidence = rules.length
    ? rules.reduce((sum, r) => sum + r.confidence, 0) / rules.length
    : 0;
  const outlierRate = products.length
    ? outliersRate(products)
    : 0;

  const performance = [
    {
      technique: "kNN",
      score: evaluation.accuracy * 100,
      metric: `Accuracy ${(evaluation.accuracy * 100).toFixed(1)}% · F1 ${(evaluation.f1 * 100).toFixed(1)}%`,
    },
    {
      technique: "K-Means",
      score: Math.max(0, Math.min(100, ((km.silhouette + 1) / 2) * 100)),
      metric: `Silhouette ${km.silhouette.toFixed(2)} · normalized to 0–100`,
    },
    {
      technique: "Apriori",
      score: avgRuleConfidence * 100,
      metric: `${rules.length} rules · avg confidence ${(avgRuleConfidence * 100).toFixed(1)}%`,
    },
    {
      technique: "Regression",
      score: Math.max(0, Math.min(100, reg.r2 * 100)),
      metric: `R² ${(reg.r2 * 100).toFixed(1)}%`,
    },
    {
      technique: "Outliers",
      score: outlierRate * 100,
      metric: `${outliersRate(products, true)} of ${products.length} records flagged`,
    },
  ];

  return {
    products,
    km,
    evaluation,
    reg,
    rules,
    profiles,
    performance,
    classes: [...new Set(train.map((t) => t.y))],
  };
}

export { detectSchema };
