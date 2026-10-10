// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0
//
// Token Weather: a live forecast of the context window, above the prompt.
//
// turn.complete: after each main-loop turn, read the context window's fill
// from $.session.usage() (the same figures the status line shows) and keep
// the last HISTORY readings.
// session.start: take a first reading, so the band shows before any turn.
// ui.render (AbovePrompt): one line: icon, forecast word, percent, tokens
// used of the window, the forecast (the 5-hour and 7-day plan limits and when
// they clear), and the rainfall: a bar per recent turn for the tokens it added.
//
// The host reads on(...) and $.noun.method(...) from source, so they are
// spelled literally, and helpers that take $ are top-level functions.

// One more reading than turns of rain shown: each bar is the gap between two.
const HISTORY = 13;
const BARS = "▁▂▃▄▅▆▇█";

// Forecast bands, by percent of the window used.
const FORECAST = [
// Single-width text symbols, not emoji: they line up in every terminal font.
  { upTo: 25, icon: "☀", word: "Clear", color: "yellow" },
  { upTo: 50, icon: "☁", word: "Cloudy", color: "cyan" },
  { upTo: 75, icon: "☂", word: "Showers", color: "blue" },
  { upTo: 90, icon: "☇", word: "Storm", color: "magenta" },
  { upTo: Infinity, icon: "↯", word: "Compact soon", color: "red" },
];

// Readings: { tokens, window, percent }, oldest first.
let readings = [];
// The plan's 5-hour and 7-day windows as the last response reported them:
// { label, percent, resetsAt } with resetsAt in epoch ms, or undefined.
let limits = [];
// A reading under way, so draws while it runs do not start another.
let reading;

export function register(on) {
  on("session.start", async ($, e, next) => {
    const result = await next(e);
    readings = [];
    await takeReading($);
    return result;
  });

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    if (e.agentId) {
      return result;
    }
    await takeReading($);
    return result;
  });

  // The forecast moves between turns too: each measurement that moves a
  // window a whole point brings fresh limits, so the band redraws with them.
  on("session.measure", ($, e, next) => {
    if (e.changed?.includes("rateLimits")) {
      limits = forecastPeriods(e.rateLimits);
      $.ui.invalidate("ui.render");
    }
    return next(e);
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (readings.length === 0 && !reading) {
      // After /reload-plugins no session.start comes, so the first draw takes
      // the first reading; it redraws the band once it lands.
      reading = takeReading($).finally(() => (reading = undefined));
    }
    if (e.props?.hasSurvey || readings.length === 0) {
      return next(e);
    }
    const ui = $.ui.resolve(e);
    // The desktop app's font draws the block characters as one solid run, so
    // every surface but the terminal gets the chart as drawn bars.
    const Svg = e.surface !== "terminal" && "Svg" in ui ? ui.Svg : undefined;
    return band(ui.Box, ui.Text, e.props?.bodyColumns ?? 0, Svg, await $.clock.now());
  });
}

async function takeReading($) {
  try {
    const { context, rateLimits } = await $.session.usage();
    limits = forecastPeriods(rateLimits);
    if (!context || !context.window) {
      return;
    }
    const tokens = context.tokens ?? 0;
    const percent = Math.round(context.percent ?? (tokens / context.window) * 100);
    // The session.start reading is 0 before any response; drop it once real readings arrive.
    readings = readings.filter((r) => r.tokens > 0);
    readings.push({ tokens, window: context.window, percent });
    if (readings.length > HISTORY) {
      readings = readings.slice(-HISTORY);
    }
    $.ui.invalidate("ui.render");
  } catch {
    // No reading this turn; the band keeps the last one.
  }
}

function band(Box, Text, columns, Svg, nowMs) {
  const now = readings[readings.length - 1];
  const f = forecastFor(now.percent);
  const trend = trendWord();
  // Each section is its own group, set from the left with an even gap. Each
  // carries its width in columns, so the band drops from the end what will not fit.
  const section = (width, ...children) => ({ width, box: Box({ flexDirection: "row", alignItems: "center", columnGap: 1, children }) });
  const forecast = `${f.icon} ${f.word}`;
  const percent = `${now.percent}% of context`;
  const tokens = `${short(now.tokens)} / ${short(now.window)}`;
  const sections = [
    section(forecast.length, Text({ color: f.color, bold: true, children: forecast })),
    section(
      percent.length + 1 + tokens.length,
      Text({ children: percent }),
      Text({ dimColor: true, children: tokens }),
    ),
  ];
  // The plan limits are the forecast: the weather ahead over the next 5 hours
  // and 7 days, on the same scale as the context, each clearing when it resets.
  // Where the band is narrow, the forecast keeps its weather and drops the times.
  const GAP = 4;
  const room = columns > 0 ? columns : Infinity;
  if (limits.length > 0) {
    const left = room - (2 - GAP) - sections.reduce((n, s) => n + s.width + GAP, 0) - GAP;
    const full = forecastSection(Box, Text, nowMs, true);
    sections.push(full.width <= left ? full : forecastSection(Box, Text, nowMs, false));
  }
  const rain = rainfall();
  if (rain.length > 0) {
    sections.push(section(9 + rain.length, Text({ dimColor: true, children: "rainfall" }), Svg ? chartSvg(Svg, rain) : chart(Box, Text, rain)));
    sections.push(section(trend.length, Text({ dimColor: true, children: trend })));
  }
  // The forecast word and the context always show; the rest join while they
  // fit. A surface that reports no width is not held to one.
  let used = 2 - GAP;
  const shown = sections.filter((s, i) => (used += s.width + GAP) <= room || i < 2);
  return Box({ flexDirection: "row", alignItems: "center", justifyContent: "flex-start", columnGap: GAP, paddingX: 1, children: shown.map((s) => s.box) });
}

// The forecast: each period's weather and fill, and, with times, when it clears.
function forecastSection(Box, Text, nowMs, withTimes) {
  let width = "forecast".length;
  const periods = limits.map((l) => {
    const lf = forecastFor(l.percent);
    const value = `${lf.icon} ${l.percent}%`;
    const reset = withTimes && l.resetsAt !== undefined ? untilText(l.resetsAt - nowMs) : "";
    const parts = [Text({ children: l.label }), Text({ color: lf.color, children: value })];
    if (reset) {
      parts.push(Text({ dimColor: true, children: `clears ${reset}` }));
    }
    width += 2 + l.label.length + 1 + value.length + (reset ? reset.length + 8 : 0);
    return Box({ flexDirection: "row", columnGap: 1, children: parts });
  });
  return {
    width,
    box: Box({
      flexDirection: "row",
      alignItems: "center",
      columnGap: 2,
      children: [Text({ dimColor: true, children: "forecast" }), ...periods],
    }),
  };
}

// The plan's windows as forecast periods, 5h before 7d.
function forecastPeriods(rateLimits) {
  return (rateLimits ?? [])
    .map((l) => ({ label: limitLabel(l.kind), percent: Math.round(l.percentUsed), resetsAt: l.resetsAt ? Date.parse(l.resetsAt) : undefined }))
    .filter((l) => l.label !== null)
    .sort((a, b) => a.label.localeCompare(b.label));
}

// `five_hour` reads as 5h, `seven_day` as 7d; other windows (a gateway's spend
// limit) are left out.
function limitLabel(kind) {
  if (kind === "five_hour") return "5h";
  if (kind === "seven_day") return "7d";
  return null;
}

// Time until a window resets: "2h 10m", "3d 4h", "12m".
function untilText(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const minutes = Math.ceil(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function forecastFor(percent) {
  return FORECAST.find((band) => percent < band.upTo) ?? FORECAST[FORECAST.length - 1];
}

// What fell each turn: the tokens it added to the context, coloured by the
// forecast the turn ended on. A turn that shrank the context (a compaction)
// is a dry one. Oldest first.
function rainfall() {
  return readings.slice(1).map((r, i) => ({
    tokens: Math.max(0, r.tokens - readings[i].tokens),
    color: forecastFor(r.percent).color,
  }));
}

// Bars scale to the heaviest turn shown, so a light turn still shows beside a heavy one.
const level = (tokens, top) => Math.min(BARS.length - 1, Math.floor((tokens / top) * (BARS.length - 1)));

function chart(Box, Text, rain) {
  const top = Math.max(...rain.map((d) => d.tokens), 1);
  return Box({
    flexDirection: "row",
    children: rain.map((d) => Text({ color: d.color, children: BARS[level(d.tokens, top)] })),
  });
}

// The forecast colours as the desktop app draws its named text colours, so
// the bars match the forecast word beside them.
const SVG_COLORS = { yellow: "#d6a21e", cyan: "#1fa5d6", blue: "#3b82f6", magenta: "#c043d8", red: "#e5484d" };
const BAR_W = 5;
const BAR_GAP = 2;
const CHART_H = 14;

// The same bars as chart(), drawn: each at least a sliver tall, on a common baseline.
function chartSvg(Svg, rain) {
  const top = Math.max(...rain.map((d) => d.tokens), 1);
  const width = rain.length * (BAR_W + BAR_GAP) - BAR_GAP;
  const bars = rain
    .map((d, i) => {
      const h = Math.max(2, Math.round((d.tokens / top) * CHART_H));
      const fill = SVG_COLORS[d.color] ?? d.color;
      return `<rect x="${i * (BAR_W + BAR_GAP)}" y="${CHART_H - h}" width="${BAR_W}" height="${h}" rx="1" fill="${fill}"/>`;
    })
    .join("");
  return Svg({
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${CHART_H}" viewBox="0 0 ${width} ${CHART_H}">${bars}</svg>`,
    alt: `rainfall by turn: ${rain.map((d) => short(d.tokens)).join(", ")}`,
    width,
    height: CHART_H,
  });
}

function trendWord() {
  if (readings.length < 2) {
    return "";
  }
  const delta = readings[readings.length - 1].tokens - readings[readings.length - 2].tokens;
  if (delta > 0) return `${short(delta)} fell last turn`;
  if (delta < 0) return `cleared ${short(-delta)} last turn`;
  return "dry last turn";
}

function short(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}
