"use client";

import { useRouter, useSearchParams } from "next/navigation";

type BucketRow = {
  year: number;
  month: number;
  month_name: string | null;
};

export default function AlbumDateFilter({
  years,
  buckets,
  selectedYear,
  selectedMonth,
}: {
  years: number[];
  buckets: BucketRow[];
  selectedYear: number | null;
  selectedMonth: number | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const monthsForYear = selectedYear
    ? buckets.filter((b) => b.year === selectedYear)
    : [];

 function push(next: { year?: string; month?: string }) {
  const params = new URLSearchParams(sp.toString());

  // Only touch keys that are present in `next`
  if ("year" in next) {
    const y = next.year ?? "";
    if (y === "") params.delete("year");
    else params.set("year", y);
  }

  if ("month" in next) {
    const m = next.month ?? "";
    if (m === "") params.delete("month");
    else params.set("month", m);
  }

  router.push(`/albums?${params.toString()}`);
}


  return (
    <div className="mb-3 flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="year" className="text-xs text-gray-700 dark:text-gray-300">
          Year
        </label>
        <select
          id="year"
          value={selectedYear ? String(selectedYear) : ""}
          onChange={(e) => {
            const y = e.target.value;
            // when year changes, clear month so it can’t be invalid
            push({ year: y, month: "" });
          }}
          className="border rounded-xl px-3 py-2 text-sm bg-white text-gray-900 border-gray-300
                     dark:bg-slate-900 dark:text-gray-100 dark:border-slate-700"
        >
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="month" className="text-xs text-gray-700 dark:text-gray-300">
          Month
        </label>
        <select
            id="month"
            value={selectedMonth ? String(selectedMonth) : ""}
            disabled={!selectedYear}
            onChange={(e) => push({ month: e.target.value })}
            className="border rounded-xl px-3 py-2 text-sm bg-white text-gray-900 border-gray-300
                        disabled:opacity-50
                        dark:bg-slate-900 dark:text-gray-100 dark:border-slate-700"
            title={!selectedYear ? "Select a year first" : undefined}
            >
            <option value="">{selectedYear ? "All months" : "Select year first"}</option>
            {monthsForYear.map((b) => (
                <option key={`${b.year}-${b.month}`} value={b.month}>
                {(b.month_name?.trim() ?? "Month") + ` (${String(b.month).padStart(2, "0")})`}
                </option>
            ))}
            </select>

      </div>
    </div>
  );
}
