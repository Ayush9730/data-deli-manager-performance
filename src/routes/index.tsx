import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { analyze, detectSchema, type Product } from "@/lib/analyze";
import { download, generateSample, parseFile, toCSV } from "@/lib/dataset";
import type { Row } from "@/lib/mining";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Meridian WMS — Grocery Warehouse Data Mining" },
      { name: "description", content: "Upload grocery product data and classify, cluster, mine association rules, run regression and detect outliers." },
      { property: "og:title", content: "Meridian WMS — Grocery Warehouse Data Mining" },
      { property: "og:description", content: "A warehouse manager powered by classification, clustering, association rules, regression and outlier detection." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-5)", "var(--chart-4)", "var(--foreground)", "var(--muted-foreground)", "var(--accent)"];
const fmt = (n: number, d = 2) => (Math.abs(n) >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(d));

function Dashboard() {
  const [base, setBase] = useState<Row[]>([]);
  const [added, setAdded] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [k, setK] = useState(4);
  const [xCol, setXCol] = useState("");
  const [yCol, setYCol] = useState("");
  const [minSupport, setMinSupport] = useState(0.1);
  const [minConf, setMinConf] = useState(0.6);
  const [z, setZ] = useState(2.5);
  const [filter, setFilter] = useState<"all" | "new" | "outliers">("all");
  const baseInput = useRef<HTMLInputElement>(null);
  const addInput = useRef<HTMLInputElement>(null);

  const schema = useMemo(() => detectSchema(base), [base]);

  const loadBase = (rows: Row[], name: string) => {
    const s = detectSchema(rows);
    if (s.numericCols.length < 2) {
      setError("The dataset needs at least two numeric columns (e.g. price, units sold).");
      return;
    }
    setError("");
    setBase(rows);
    setAdded([]);
    setFileName(name);
    const pick = (re: RegExp, fb: number) => s.numericCols.find((c) => re.test(c)) ?? s.numericCols[fb];
    setXCol(pick(/units|qty|sold|quantity|demand/i, 0));
    setYCol(pick(/revenue|sales|amount|total/i, 1));
  };

  const onBaseFile = async (f?: File) => {
    if (!f) return;
    try { loadBase(await parseFile(f), f.name); } catch (e) { setError((e as Error).message); }
  };
  const onAddFile = async (f?: File) => {
    if (!f) return;
    try {
      const rows = await parseFile(f);
      const missing = schema.numericCols.filter((c) => !(c in (rows[0] ?? {})));
      if (missing.length) throw new Error(`New file is missing columns: ${missing.join(", ")}`);
      setAdded((a) => [...a, ...rows]);
      setFilter("new");
      setError("");
    } catch (e) { setError((e as Error).message); }
  };

  const result = useMemo(() => {
    if (!base.length || !xCol || !yCol) return null;
    return analyze(base, added, schema, { k, xCol, yCol, minSupport, minConf, zThreshold: z });
  }, [base, added, schema, k, xCol, yCol, minSupport, minConf, z]);

  const outliers = result?.products.filter((p) => p.outlier).sort((a, b) => Math.abs(b.residualZ) - Math.abs(a.residualZ)) ?? [];
  const tableRows = (result?.products ?? []).filter((p) => filter === "all" || (filter === "new" ? p.isNew : p.outlier));

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground font-body">
      <div className="pointer-events-none absolute inset-0 bg-glow" />
      <div className="pointer-events-none absolute -inset-20 bg-stripes" />
      <div className="pointer-events-none absolute -top-24 -right-24 size-[520px] rotate-[18deg] rounded-full bg-primary/10 blur-[90px]" />

      <div className="relative">
        <nav className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-panel/50 px-6 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <span className="size-6 rotate-45 rounded-[6px] bg-primary ring-1 ring-border" />
            <span className="font-display text-lg tracking-wide">MERIDIAN WMS</span>
          </div>
          <div className="hidden items-center gap-1 text-sm md:flex">
            {[["Overview", "#overview"], ["Performance", "#performance"], ["Rules", "#rules"], ["Regression", "#regression"], ["Outliers", "#outliers"], ["Products", "#products"]].map(([l, h], i) => (
              <a key={h} href={h} className={i === 0 ? "rounded-full bg-secondary px-3 py-1.5 font-medium" : "rounded-full px-3 py-1.5 text-muted-foreground hover:text-foreground"}>{l}</a>
            ))}
          </div>
          <span className="font-mono text-xs text-muted-foreground">{base.length ? "warehouse · live" : "awaiting data"}</span>
        </nav>

        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-panel/40 px-6 py-3 backdrop-blur-xl">
          <button
            onClick={() => baseInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onBaseFile(e.dataTransfer.files[0]); }}
            className="min-w-[260px] flex-1 rounded-[10px] border border-dashed border-input bg-secondary/30 px-4 py-3 text-left text-sm hover:border-primary/60"
          >
            <span className="font-mono text-primary">↑</span>
            <span className="ml-2">Drop CSV / XLSX dataset</span>
            <span className="text-muted-foreground"> — {fileName || "click to browse"}</span>
          </button>
          <input ref={baseInput} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => { onBaseFile(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={addInput} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(e) => { onAddFile(e.target.files?.[0]); e.target.value = ""; }} />
          <button
            disabled={!base.length}
            onClick={() => addInput.current?.click()}
            className="rounded-[10px] bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >+ Add new products</button>
          <button
            onClick={() => loadBase(generateSample(240), "sample_grocery_warehouse.csv")}
            className="rounded-[10px] border border-input px-4 py-3 text-sm font-medium hover:bg-secondary"
          >Load sample</button>
          <div className="flex gap-2">
            <button onClick={() => download("grocery_dataset.csv", toCSV(generateSample(240)))} className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">sample.csv</button>
            <button onClick={() => download("new_products.csv", toCSV(generateSample(25, 900)))} className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">new_batch.csv</button>
          </div>
        </div>
        {error && <div className="border-b border-danger/30 bg-danger/10 px-6 py-2 text-sm text-danger">{error}</div>}

        {!result ? <EmptyState /> : (
          <>
            <section id="overview" className="rise relative flex flex-wrap items-end justify-between gap-6 px-6 py-8">
              <div className="max-w-[46ch]">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">dataset summary</p>
                <h1 className="font-display text-5xl leading-[0.95] tracking-tight text-balance">
                  {result.products.length.toLocaleString()} SKUs<br />across {result.classes.length} {schema.classCol ? "categories" : "groups"}
                </h1>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  features: {schema.numericCols.join(", ")}{added.length ? ` · ${added.length} new products ingested` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Stat label="clusters" value={String(k)} />
                <Stat label="accuracy" value={`${(result.evaluation.accuracy * 100).toFixed(1)}%`} />
                <Stat label="rules" value={String(result.rules.length)} />
                <Stat label="outliers" value={String(outliers.length)} hot />
              </div>
            </section>

            <section id="performance" className="px-6 pb-6">
              <Panel delay={30} sheen>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl tracking-wide">DATA MINING PERFORMANCE</h2>
                    <p className="font-mono text-xs text-muted-foreground">
                      Metric-specific performance view across every technique in the analysis.
                    </p>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    0–100 normalized view
                  </span>
                </div>

                <div className="mt-4 h-[300px]">
                  <ResponsiveContainer>
                    <BarChart data={result.performance} margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="technique" tick={axisTick} stroke="var(--border)" />
                      <YAxis domain={[0, 100]} tick={axisTick} stroke="var(--border)" />
                      <Tooltip
                        cursor={{ fill: "var(--secondary)", opacity: 0.35 }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const item = payload[0]?.payload;
                          return (
                            <div className="rounded-[8px] border border-border bg-panel px-3 py-2 shadow-xl">
                              <p className="font-medium">{item.technique}</p>
                              <p className="font-mono text-xs text-primary">{item.score.toFixed(1)}%</p>
                              <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">{item.metric}</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="score" radius={[5, 5, 0, 0]}>
                        {result.performance.map((item, i) => (
                          <Cell key={item.technique} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {result.performance.map((item, i) => (
                    <div key={item.technique} className="rounded-[8px] border border-border bg-secondary/30 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          <i className="size-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          {item.technique}
                        </span>
                        <span className="font-mono text-xs">{item.score.toFixed(1)}%</span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{item.metric}</p>
                    </div>
                  ))}
                </div>

                <p className="mt-3 font-mono text-[10px] text-muted-foreground">
                  kNN = accuracy · K-Means = silhouette quality normalized to 0–100 · Apriori = average rule confidence ·
                  Regression = R² · Outliers = percentage of records flagged. Outlier rate is a detection statistic, not ground-truth accuracy.
                </p>
              </Panel>
            </section>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-6 pb-4 font-mono text-xs text-muted-foreground">
              <Select label="X axis" value={xCol} onChange={setXCol} options={schema.numericCols} />
              <Select label="Y axis" value={yCol} onChange={setYCol} options={schema.numericCols} />
              <Range label={`k = ${k}`} min={2} max={8} step={1} value={k} onChange={setK} />
              <Range label={`min support ${minSupport.toFixed(2)}`} min={0.03} max={0.4} step={0.01} value={minSupport} onChange={setMinSupport} />
              <Range label={`min conf ${minConf.toFixed(2)}`} min={0.3} max={0.95} step={0.05} value={minConf} onChange={setMinConf} />
              <Range label={`|z| > ${z.toFixed(1)}`} min={1.5} max={4} step={0.1} value={z} onChange={setZ} />
            </div>

            <div className="grid gap-4 px-6 pb-6 lg:grid-cols-12">
              <Panel className="lg:col-span-7" delay={60} sheen>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl tracking-wide">K-MEANS CLUSTERING</h2>
                  <span className="font-mono text-xs text-muted-foreground">{xCol} × {yCol} · silhouette {result.km.silhouette.toFixed(2)}</span>
                </div>
                <div className="mt-3 h-[280px]">
                  <ResponsiveContainer>
                    <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: -8 }}>
                      <CartesianGrid stroke="var(--border)" />
                      <XAxis type="number" dataKey="x" name={xCol} tick={axisTick} stroke="var(--border)" />
                      <YAxis type="number" dataKey="y" name={yCol} tick={axisTick} stroke="var(--border)" />
                      <ZAxis range={[28, 28]} />
                      <Tooltip content={<PointTip />} />
                      {result.profiles.map((c) => (
                        <Scatter key={c.id} data={result.products.filter((p) => p.cluster === c.id)} fill={COLORS[c.id % COLORS.length]} shape={(props: any) => (
                          <circle cx={props.cx} cy={props.cy} r={props.payload.isNew ? 6 : 3.5} fill={COLORS[c.id % COLORS.length]} stroke={props.payload.isNew ? "var(--foreground)" : "none"} strokeWidth={1.5} />
                        )} />
                      ))}
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {result.profiles.map((c) => (
                    <span key={c.id} className="flex items-center gap-1.5">
                      <i className="size-2 rounded-full" style={{ background: COLORS[c.id % COLORS.length] }} />
                      c{c.id + 1} {c.label} · {c.size}
                    </span>
                  ))}
                  {added.length > 0 && <span className="flex items-center gap-1.5"><i className="size-2 rounded-full ring-1 ring-foreground" />new product</span>}
                </div>
              </Panel>

              <Panel id="regression" className="lg:col-span-5" delay={120}>
                <h2 className="font-display text-xl tracking-wide">REGRESSION</h2>
                <p className="font-mono text-xs text-muted-foreground">
                  {yCol} = {fmt(result.reg.slope, 3)}·{xCol} {result.reg.intercept >= 0 ? "+" : "−"} {fmt(Math.abs(result.reg.intercept))} · R² {result.reg.r2.toFixed(2)}
                </p>
                <div className="mt-3 h-[290px] rounded-[10px] border border-border bg-background/40">
                  <ResponsiveContainer>
                    <ComposedChart margin={{ top: 12, right: 12, bottom: 4, left: -8 }}>
                      <CartesianGrid stroke="var(--border)" />
                      <XAxis type="number" dataKey="x" tick={axisTick} stroke="var(--border)" domain={["auto", "auto"]} />
                      <YAxis type="number" dataKey="y" tick={axisTick} stroke="var(--border)" />
                      <ZAxis range={[24, 24]} />
                      <Tooltip content={<PointTip />} />
                      <Scatter data={result.products.filter((p) => !p.outlier)} fill="var(--muted-foreground)" fillOpacity={0.6} />
                      <Scatter data={outliers} fill="var(--danger)" shape={(p: any) => <circle cx={p.cx} cy={p.cy} r={6} fill="var(--danger)" stroke="var(--foreground)" strokeWidth={1} />} />
                      <Line data={regLine(result.products)} dataKey="y" stroke="var(--primary)" strokeWidth={2} dot={false} isAnimationActive={false} style={{ filter: "drop-shadow(var(--shadow-glow))" }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel id="rules" className="lg:col-span-4" delay={180}>
                <h2 className="font-display text-xl tracking-wide">ASSOCIATION · APRIORI</h2>
                <p className="font-mono text-xs text-muted-foreground">{result.rules.length} rules found</p>
                <div className="mt-3 max-h-[340px] space-y-2 overflow-auto pr-1">
                  {result.rules.length === 0 && <p className="text-sm text-muted-foreground">No rules at these thresholds — lower min support or confidence.</p>}
                  {result.rules.slice(0, 40).map((r, i) => (
                    <div key={i} className="rounded-[8px] bg-secondary/40 px-3 py-2">
                      <p className="text-sm">{r.antecedent.join(" + ")} <span className="text-primary">→</span> {r.consequent.join(" + ")}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        sup {r.support.toFixed(2)} · conf {r.confidence.toFixed(2)} · <span className={r.lift > 1.5 ? "text-primary" : ""}>lift {r.lift.toFixed(2)}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel id="outliers" className="border-primary/30 lg:col-span-4" delay={240}>
                <h2 className="font-display text-xl tracking-wide text-primary">OUTLIERS</h2>
                <p className="font-mono text-xs text-muted-foreground">regression residual z-score · flagged {outliers.length}</p>
                <div className="mt-3 max-h-[340px] space-y-2 overflow-auto pr-1">
                  {outliers.length === 0 && <p className="text-sm text-muted-foreground">No outliers above the threshold.</p>}
                  {outliers.map((p) => (
                    <div key={p.idx} className="flex items-center justify-between rounded-[8px] border border-danger/30 bg-danger/10 px-3 py-2">
                      <div>
                        <p className="text-sm">{p.name}{p.isNew && <span className="ml-2 font-mono text-[10px] text-primary">NEW</span>}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{p.residualZ > 0 ? "above" : "below"} trend · {yCol} {fmt(p.y)} vs {fmt(p.fitted)}</p>
                      </div>
                      <span className="font-mono text-xs text-danger">z {p.residualZ.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel className="lg:col-span-4" delay={300}>
                <h2 className="font-display text-xl tracking-wide">CLASSIFICATION · kNN</h2>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <MiniStat v={`${(result.evaluation.accuracy * 100).toFixed(0)}%`} l="acc" />
                  <MiniStat v={result.evaluation.f1.toFixed(2)} l="f1" />
                  <MiniStat v={String(result.classes.length)} l="classes" hot />
                </div>
                <p className="mt-3 text-sm text-pretty text-muted-foreground">
                  Target: <span className="text-foreground">{schema.classCol ?? "cluster label"}</span>. Leave-one-out accuracy, k = 5. New products are auto-assigned a predicted class and nearest cluster.
                </p>
                <ConfusionMatrix ev={result.evaluation} />
              </Panel>

              <Panel id="products" className="lg:col-span-12" delay={360}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-xl tracking-wide">PRODUCT LEDGER</h2>
                  <div className="flex gap-1 text-xs">
                    {(["all", "new", "outliers"] as const).map((f) => (
                      <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 font-mono uppercase ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>
                        {f} {f === "new" ? `(${added.length})` : f === "outliers" ? `(${outliers.length})` : `(${result.products.length})`}
                      </button>
                    ))}
                    <button onClick={() => download("warehouse_results.csv", toCSV(result.products.map(exportRow)))} className="rounded-full border border-input px-3 py-1.5 font-mono uppercase text-muted-foreground hover:text-foreground">export</button>
                  </div>
                </div>
                <div className="mt-3 max-h-[420px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-panel font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr className="text-left">
                        <th className="py-2 pr-3">Product</th>
                        {schema.classCol && <th className="pr-3">Actual</th>}
                        <th className="pr-3">Predicted</th>
                        <th className="pr-3">Conf.</th>
                        <th className="pr-3">Cluster</th>
                        <th className="pr-3">{xCol}</th>
                        <th className="pr-3">{yCol}</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.slice(0, 300).map((p) => (
                        <tr key={p.idx} className={`border-t border-border ${p.isNew ? "bg-primary/5" : ""}`}>
                          <td className="py-1.5 pr-3">{p.name}{p.isNew && <span className="ml-2 font-mono text-[10px] text-primary">NEW</span>}</td>
                          {schema.classCol && <td className="pr-3 text-muted-foreground">{p.trueClass}</td>}
                          <td className={`pr-3 ${p.trueClass && p.trueClass !== p.predicted ? "text-danger" : ""}`}>{p.predicted}</td>
                          <td className="pr-3 font-mono text-xs">{(p.confidence * 100).toFixed(0)}%</td>
                          <td className="pr-3"><span className="inline-flex items-center gap-1.5 font-mono text-xs"><i className="size-2 rounded-full" style={{ background: COLORS[p.cluster % COLORS.length] }} />C{p.cluster + 1}</span></td>
                          <td className="pr-3 font-mono text-xs">{fmt(p.x)}</td>
                          <td className="pr-3 font-mono text-xs">{fmt(p.y)}</td>
                          <td className="font-mono text-xs">{p.outlier ? <span className="text-danger">outlier</span> : <span className="text-muted-foreground">normal</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tableRows.length > 300 && <p className="py-2 font-mono text-xs text-muted-foreground">Showing 300 of {tableRows.length} — export for all.</p>}
                </div>
              </Panel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const axisTick = { fill: "var(--muted-foreground)", fontSize: 10, fontFamily: "var(--font-mono)" };

function regLine(ps: Product[]) {
  if (!ps.length) return [];
  const sorted = [...ps].sort((a, b) => a.x - b.x);
  const a = sorted[0], b = sorted[sorted.length - 1];
  return [{ x: a.x, y: a.fitted }, { x: b.x, y: b.fitted }];
}

function exportRow(p: Product): Row {
  return { ...p.row, predicted_class: p.predicted, confidence: +p.confidence.toFixed(3), cluster: `C${p.cluster + 1}`, residual_z: +p.residualZ.toFixed(3), outlier: p.outlier ? "yes" : "no", is_new: p.isNew ? "yes" : "no" };
}

function PointTip({ active, payload }: any) {
  const p: Product | undefined = payload?.[0]?.payload;
  if (!active || !p || p.name === undefined) return null;
  return (
    <div className="glass px-3 py-2 text-xs">
      <p className="font-semibold">{p.name}{p.isNew && " · NEW"}</p>
      <p className="font-mono text-muted-foreground">class {p.predicted} · C{p.cluster + 1}</p>
      <p className="font-mono text-muted-foreground">x {fmt(p.x)} · y {fmt(p.y)} · z {p.residualZ.toFixed(1)}</p>
    </div>
  );
}

function Panel({ children, className = "", delay = 0, sheen, id }: { children: React.ReactNode; className?: string; delay?: number; sheen?: boolean; id?: string }) {
  return (
    <div id={id} className={`glass rise relative scroll-mt-20 overflow-hidden p-5 ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {sheen && <div className="sheen pointer-events-none absolute -top-10 left-1/3 h-[140%] w-24 -skew-x-12 bg-foreground/5 blur-md" />}
      <div className="relative">{children}</div>
    </div>
  );
}

function Stat({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className={`rounded-[12px] border px-4 py-3 backdrop-blur-xl ${hot ? "border-primary/40 bg-primary/10" : "border-border bg-panel/60"}`}>
      <p className={`font-mono text-xs ${hot ? "text-primary" : "text-muted-foreground"}`}>{label}</p>
      <p className={`font-display text-2xl ${hot ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

function MiniStat({ v, l, hot }: { v: string; l: string; hot?: boolean }) {
  return (
    <div className={`rounded-[8px] py-3 ${hot ? "bg-primary/10" : "bg-secondary/40"}`}>
      <p className={`font-display text-lg ${hot ? "text-primary" : ""}`}>{v}</p>
      <p className="font-mono text-[10px] uppercase text-muted-foreground">{l}</p>
    </div>
  );
}

function ConfusionMatrix({ ev }: { ev: { classes: string[]; matrix: Record<string, Record<string, number>> } }) {
  if (ev.classes.length > 9) return null;
  const max = Math.max(1, ...ev.classes.flatMap((a) => ev.classes.map((b) => (ev.matrix[a]?.[b] ?? 0))));
  return (
    <div className="mt-4">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">confusion matrix (rows = actual)</p>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${ev.classes.length}, minmax(0,1fr))` }}>
        {ev.classes.flatMap((a) => ev.classes.map((b) => (
          <div key={a + b} title={`${a} → ${b}: ${(ev.matrix[a]?.[b] ?? 0)}`} className="flex aspect-square items-center justify-center rounded-[3px] font-mono text-[9px]"
            style={{ background: `color-mix(in oklab, ${a === b ? "var(--primary)" : "var(--danger)"} ${((ev.matrix[a]?.[b] ?? 0) / max) * 80}%, var(--secondary))` }}>
            {(ev.matrix[a]?.[b] ?? 0) || ""}
          </div>
        )))}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="flex items-center gap-2">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-input bg-panel px-2 py-1 text-foreground">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Range({ label, ...p }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-32">{label}</span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} onChange={(e) => p.onChange(Number(e.target.value))} className="accent-primary" />
    </label>
  );
}

function EmptyState() {
  return (
    <section className="rise mx-auto max-w-3xl px-6 py-24 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">classify · cluster · associate · regress · detect</p>
      <h1 className="mt-4 font-display text-6xl leading-[0.95] tracking-tight text-balance">YOUR WAREHOUSE,<br />MINED.</h1>
      <p className="mx-auto mt-5 max-w-[52ch] text-muted-foreground text-pretty">
        Upload a CSV or Excel sheet of grocery products. You need at least two numeric columns (price, units sold, stock…) and ideally a category column. Then add a batch of new products to watch them get classified, clustered and checked for outliers.
      </p>
      <div className="mx-auto mt-8 grid max-w-xl grid-cols-5 gap-2 font-mono text-[10px] uppercase text-muted-foreground">
        {["kNN", "k-means", "Apriori", "Linear reg.", "Z-score"].map((t) => <div key={t} className="glass py-3">{t}</div>)}
      </div>
    </section>
  );
}
