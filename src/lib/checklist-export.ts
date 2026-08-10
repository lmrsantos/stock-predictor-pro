// lib/checklist-export.ts
// Excel export reuses the sheet-building pattern from Portfolio Insights.
// PDF export renders a print-ready document in a new window — no verdict, no
// score, no colour-coded status anywhere in either output.

import * as XLSX from "xlsx";
import {
  CHECKLIST_SECTIONS, NOT_CHECKED, countsFor, isBlank,
  type UserEntries,
} from "@/lib/checklist-schema";
import type { AutoSnapshot } from "@/lib/checklist-snapshot";

function entryText(v: string | undefined): string {
  if (v === NOT_CHECKED) return "NOT CHECKED";
  if (isBlank(v)) return "(blank)";
  return v as string;
}

interface ExportArgs {
  ticker: string;
  snapshot: AutoSnapshot;
  entries: UserEntries;
  notes: string;
  createdAt: string;
}

export function exportChecklistExcel({ ticker, snapshot, entries, notes, createdAt }: ExportArgs) {
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [];

  rows.push([`Pre-Investment Checklist — ${ticker}`]);
  rows.push([`Data as of ${new Date(snapshot.capturedAt).toLocaleString()}`]);
  rows.push([`Checklist created ${new Date(createdAt).toLocaleString()}`]);
  rows.push(["This worksheet gathers evidence. It contains no verdict, score, or recommendation."]);
  rows.push([]);
  rows.push(["Section", "Item", "Type", "Value / answer", "Source", "As of"]);

  for (const section of CHECKLIST_SECTIONS) {
    for (const item of section.items) {
      if (item.type === "auto") {
        const a = snapshot.values[item.id];
        rows.push([section.title, item.label, "AUTO", a?.value ?? "Not captured", a?.source ?? "—", a?.asOf ?? "—"]);
      } else {
        rows.push([section.title, item.label, item.type.toUpperCase(), entryText(entries[item.id]), "user", ""]);
      }
    }
    if (section.special === "model_reading") {
      rows.push([section.title, "Honest reading", "AUTO", snapshot.modelReading, "QuantForecast engine", ""]);
    }
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Checklist");

  const { researchBlank, judgmentBlank } = countsFor(entries);
  const summary: (string | number)[][] = [
    ["Evidence summary — counts only"],
    [],
    ["Items auto-filled from live data", snapshot.autoFilledCount],
    ["Research items still blank", researchBlank],
    ["Judgment items still blank", judgmentBlank],
    ["Concerns flagged", snapshot.concerns.length],
    [],
    ["Concerns"],
    ...(snapshot.concerns.length ? snapshot.concerns.map(c => [c]) : [["None flagged by the rules."]]),
    [],
    ["Notes"],
    [notes || "(none)"],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");

  XLSX.writeFile(wb, `quantforecast-checklist-${ticker}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function exportChecklistPdf({ ticker, snapshot, entries, notes, createdAt }: ExportArgs) {
  const { researchBlank, judgmentBlank } = countsFor(entries);

  const body = CHECKLIST_SECTIONS.map(section => {
    const items = section.items.map(item => {
      if (item.type === "auto") {
        const a = snapshot.values[item.id];
        return `<tr><td class="lbl">${esc(item.label)}<span class="tag">AUTO</span></td>
          <td>${esc(a?.value ?? "Not captured")}
          <div class="src">${esc(a?.source ?? "—")} · as of ${esc(a?.asOf ?? "—")}</div></td></tr>`;
      }
      const v = entries[item.id];
      const blank = v === NOT_CHECKED || isBlank(v);
      return `<tr><td class="lbl">${esc(item.label)}<span class="tag">${item.type.toUpperCase()}</span></td>
        <td class="${blank ? "blank" : ""}">${esc(entryText(v))}</td></tr>`;
    }).join("");

    const extra = section.special === "model_reading"
      ? `<p class="reading">${esc(snapshot.modelReading)}</p>`
      : section.special === "evidence_counts"
      ? `<ul class="counts">
          <li>Items auto-filled from live data: ${snapshot.autoFilledCount}</li>
          <li>Research items still blank: ${researchBlank}</li>
          <li>Judgment items still blank: ${judgmentBlank}</li>
          <li>Concerns flagged: ${snapshot.concerns.length}</li>
        </ul>
        ${snapshot.concerns.length
          ? `<ul class="concerns">${snapshot.concerns.map(c => `<li>${esc(c)}</li>`).join("")}</ul>`
          : `<p class="src">No concern was flagged by the rules.</p>`}`
      : "";

    return `<h2>${esc(section.title)}</h2>
      ${section.intro ? `<p class="intro">${esc(section.intro)}</p>` : ""}
      ${items ? `<table>${items}</table>` : ""}
      ${extra}`;
  }).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8">
    <title>Pre-Investment Checklist — ${esc(ticker)}</title>
    <style>
      body { font: 12px/1.5 -apple-system, Segoe UI, Roboto, sans-serif; color: #111; margin: 32px; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      h2 { font-size: 13px; margin: 22px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
      p.intro, .src { color: #666; font-size: 10px; }
      table { width: 100%; border-collapse: collapse; }
      td { vertical-align: top; padding: 5px 6px; border-bottom: 1px solid #eee; }
      td.lbl { width: 38%; color: #333; }
      .tag { font-size: 8px; letter-spacing: .08em; color: #888; margin-left: 6px; }
      .blank { color: #999; font-style: italic; }
      .reading { margin-top: 8px; padding: 8px; background: #f6f6f6; }
      ul.counts, ul.concerns { padding-left: 18px; }
      .meta { color: #666; font-size: 10px; margin-bottom: 16px; }
      @page { margin: 14mm; }
    </style></head><body>
    <h1>Pre-Investment Checklist — ${esc(ticker)}</h1>
    <div class="meta">
      Data as of ${esc(new Date(snapshot.capturedAt).toLocaleString())} ·
      checklist created ${esc(new Date(createdAt).toLocaleString())}<br>
      This worksheet gathers evidence. It contains no verdict, score, or recommendation.
    </div>
    ${body}
    <h2>Notes</h2><p>${esc(notes || "(none)")}</p>
    </body></html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}
