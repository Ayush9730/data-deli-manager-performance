import type { Row } from "./mining";

export async function parseFile(file: File): Promise<Row[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const Papa = (await import("papaparse")).default;
    const text = await file.text();
    const res = Papa.parse<Row>(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
    return clean(res.data);
  }
  if (/\.(xlsx|xls)$/.test(name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer());
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return clean(XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" }));
  }
  throw new Error("Please upload a .csv, .xlsx or .xls file");
}

function clean(rows: Row[]) {
  return rows
    .filter((r) => Object.values(r).some((v) => v !== "" && v != null))
    .map((r) => {
      const o: Row = {};
      for (const [k, v] of Object.entries(r)) if (k.trim()) o[k.trim()] = typeof v === "string" ? v.trim() : (v ?? "");
      return o;
    });
}

const CATALOG: Record<string, { items: string[]; price: [number, number]; shelf: [number, number]; weight: [number, number]; temp: string }> = {
  Dairy: { items: ["Milk 1L", "Butter 500g", "Cheddar 200g", "Yogurt Cup", "Paneer 200g", "Cream 250ml"], price: [1, 6], shelf: [5, 30], weight: [0.2, 1], temp: "Chilled" },
  Produce: { items: ["Bananas 1kg", "Apples 1kg", "Tomatoes 1kg", "Onions 2kg", "Spinach Bunch", "Carrots 1kg"], price: [0.5, 4], shelf: [3, 14], weight: [0.3, 2], temp: "Cool" },
  Bakery: { items: ["White Bread", "Croissant", "Bagels 6pk", "Brown Bread", "Muffins 4pk"], price: [1, 5], shelf: [2, 7], weight: [0.2, 0.8], temp: "Ambient" },
  Pantry: { items: ["Pasta 500g", "Rice 5kg", "Lentils 1kg", "Pasta Sauce", "Olive Oil 1L", "Flour 2kg"], price: [1, 12], shelf: [180, 720], weight: [0.5, 5], temp: "Ambient" },
  Beverages: { items: ["Cola 2L", "Orange Juice 1L", "Coffee 250g", "Green Tea 100", "Mineral Water 6pk"], price: [1, 10], shelf: [90, 365], weight: [0.25, 6], temp: "Ambient" },
  Frozen: { items: ["Frozen Peas", "Ice Cream 1L", "Frozen Pizza", "Fish Fingers", "Frozen Fries"], price: [2, 9], shelf: [90, 365], weight: [0.4, 1.5], temp: "Frozen" },
  Snacks: { items: ["Potato Chips", "Cookies", "Chocolate Bar", "Salted Nuts", "Popcorn"], price: [0.8, 5], shelf: [60, 270], weight: [0.05, 0.5], temp: "Ambient" },
};

const r = (a: number, b: number) => a + Math.random() * (b - a);

export function generateSample(n = 220, offset = 0): Row[] {
  const cats = Object.keys(CATALOG);
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const cat = cats[Math.floor(Math.random() * cats.length)];
    const c = CATALOG[cat];
    const price = r(...c.price);
    let units = Math.round(Math.max(5, 600 / (price + 1) + r(-40, 40)));
    let p = price;
    if (Math.random() < 0.04) { p = price * r(4, 8); units = Math.round(units * r(0.05, 0.2)); }
    if (Math.random() < 0.03) units = Math.round(units * r(3, 5));
    rows.push({
      product_id: `SKU-${String(offset + i + 1).padStart(4, "0")}`,
      product_name: c.items[Math.floor(Math.random() * c.items.length)],
      category: cat,
      storage: c.temp,
      unit_price: +p.toFixed(2),
      units_sold: units,
      stock_qty: Math.round(r(20, 500)),
      shelf_life_days: Math.round(r(...c.shelf)),
      weight_kg: +r(...c.weight).toFixed(2),
      revenue: +(p * units).toFixed(2),
    });
  }
  return rows;
}

export function toCSV(rows: Row[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
