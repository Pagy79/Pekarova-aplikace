import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Wallet, TrendingUp, TrendingDown, Target, ShoppingCart, Film, Car, Home,
  ChefHat, Flame, Plus, Camera, Trash2, RotateCcw, AlertTriangle, X, Check,
  Sparkles, Trophy, ChevronRight, Loader2, User, Landmark, PawPrint, Hammer, ShieldAlert, Banknote, Sandwich
} from "lucide-react";

// ---------- Statická konfigurace ----------

const CATEGORY_META = {
  Potraviny: { icon: ShoppingCart, color: "#34D399", bg: "rgba(52,211,153,0.12)" },
  Zábava: { icon: Film, color: "#A78BFA", bg: "rgba(167,139,250,0.12)" },
  Auto: { icon: Car, color: "#FBBF24", bg: "rgba(251,191,36,0.12)" },
  Bydlení: { icon: Home, color: "#38BDF8", bg: "rgba(56,189,248,0.12)" },
  Eliška: { icon: User, color: "#FB7185", bg: "rgba(251,113,133,0.12)" },
  "Splátky úvěru": { icon: Landmark, color: "#FB923C", bg: "rgba(251,146,60,0.12)" },
  Zvířata: { icon: PawPrint, color: "#2DD4BF", bg: "rgba(45,212,191,0.12)" },
  "Hornbach/Obi": { icon: Hammer, color: "#818CF8", bg: "rgba(129,140,248,0.12)" },
  "Neočekávané výdaje": { icon: ShieldAlert, color: "#EF4444", bg: "rgba(239,68,68,0.12)" },
  "Obědy a Svačiny": { icon: Sandwich, color: "#FACC15", bg: "rgba(250,204,21,0.12)" },
};
const DEFAULT_CATEGORY_META = { icon: Wallet, color: "#94A3B8", bg: "rgba(148,163,184,0.12)" };

const INITIAL_CATEGORIES = [
  { name: "Potraviny", limit: 9000 },
  { name: "Zábava", limit: 3000 },
  { name: "Auto", limit: 4000 },
  { name: "Bydlení", limit: 13500 },
  { name: "Eliška", limit: 2000 },
  { name: "Splátky úvěru", limit: 12890.65 },
  { name: "Zvířata", limit: 1500 },
  { name: "Hornbach/Obi", limit: 2500 },
  { name: "Neočekávané výdaje", limit: 3000 },
  { name: "Obědy a Svačiny", limit: 6000 },
];

const OVERDRAFT_LIMIT = 35000;

const LEVELS = [
  { name: "Hladový pekař", min: 0 },
  { name: "Sběrač drobků", min: 101 },
  { name: "Pekařský učeň", min: 301 },
  { name: "Tovaryš s váčkem", min: 601 },
  { name: "Cechovní mistr pecivál", min: 1201 },
];

function levelForXp(xpValue) {
  return [...LEVELS].reverse().find((l) => xpValue >= l.min);
}


const INITIAL_TRANSACTIONS = [];

function formatKc(n) {
  return Math.round(n).toLocaleString("cs-CZ") + " Kč";
}

// Zmenší a zkomprimuje fotku přes HTML Canvas, než se pošle na backend —
// fotky z iPhonu bývají 3-10 MB a překračují 4.5MB limit Vercel serverless
// funkcí. Zmenšení na max. 1024 px (delší strana) + JPEG kvalita 0.7
// stlačí typickou účtenku na pár desítek až stovek kB.
function compressImageToBase64(file, maxDimension = 1024, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Obrázek se nepodařilo načíst."));
      img.src = event.target.result;
    };
    reader.onerror = () => reject(new Error("Soubor se nepodařilo přečíst."));
    reader.readAsDataURL(file);
  });
}

// ---------- Perzistence do localStorage ----------
// Funguje standardně v reálném prohlížeči po nasazení (Vercel apod.).
// V náhledu Claude.ai Artifacts localStorage podporovaný není, proto je
// vše zabalené v try/catch a s kontrolou typeof window, aby appka
// v žádném prostředí (ani při SSR) nespadla.

const STORAGE_KEY = "penize-pecou:state:v1";

function loadPersistedState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function savePersistedState(state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    // localStorage může selhat (soukromý režim, plný disk, zakázané cookies…) —
    // appka v tom případě prostě jede dál jen s daty v paměti.
  }
}

// ---------- Podkomponenty ----------

function StatCard({ icon: Icon, label, value, accent, sub }) {
  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5 backdrop-blur">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</span>
        <div className="p-2 rounded-xl" style={{ background: accent + "22" }}>
          <Icon size={16} color={accent} />
        </div>
      </div>
      <p className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function OverdraftCard({ balance, limit }) {
  const isActive = balance < 0;
  const used = isActive ? Math.min(limit, Math.abs(balance)) : 0;
  const available = Math.max(0, limit - used);
  const pct = limit > 0 ? Math.max(0, Math.min(100, Math.round((available / limit) * 100))) : 0;

  return (
    <div
      className="rounded-2xl border p-5 backdrop-blur transition-colors"
      style={{
        background: isActive ? "rgba(248,113,113,0.12)" : "rgba(15,23,42,0.6)",
        borderColor: isActive ? "rgba(248,113,113,0.5)" : "rgb(30 41 59)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-medium uppercase tracking-wider ${isActive ? "text-red-300" : "text-slate-400"}`}>
          Kontokorent
        </span>
        <div className="p-2 rounded-xl" style={{ background: (isActive ? "#F87171" : "#34D399") + "22" }}>
          <Banknote size={16} color={isActive ? "#F87171" : "#34D399"} />
        </div>
      </div>

      <p
        className={`text-2xl font-bold tracking-tight ${isActive ? "text-red-300" : "text-white"}`}
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {formatKc(available)}
      </p>

      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden my-2.5">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: isActive ? "#F87171" : "#34D399" }}
        />
      </div>

      <p className={`text-xs ${isActive ? "text-red-300/80" : "text-slate-500"}`}>
        {isActive ? `Čerpáno ${formatKc(used)} z rámce ${formatKc(limit)}` : `Volný rámec ${formatKc(limit)}`}
      </p>
    </div>
  );
}

function BudgetOverviewBars({ income, budgetTotal, spentTotal }) {
  const max = Math.max(income, budgetTotal, spentTotal, 1);
  const remaining = budgetTotal - spentTotal;

  const rows = [
    { label: "Příjmy tento měsíc", value: income, color: "#38BDF8" },
    { label: "Rozloženo do rámců kategorií", value: budgetTotal, color: "#FBBF24" },
    { label: "Vyčerpáno z rámců", value: spentTotal, color: "#F87171" },
  ];

  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5 backdrop-blur">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Příjmy vs. rozpočtové rámce</h3>
        <span className={`text-xs font-medium ${remaining >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {remaining >= 0 ? "Zbývá vyčerpat " : "Rámce překročeny o "}
          {formatKc(Math.abs(remaining))}
        </span>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const pct = Math.round((row.value / max) * 100);
          return (
            <div key={row.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-400">{row.label}</span>
                <span className="text-slate-300 font-medium">{formatKc(row.value)}</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: row.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GoalFundCard({ goal, onGoalChange, onAddToGoal }) {
  const pct = goal.target > 0 ? Math.min(100, Math.round((goal.saved / goal.target) * 100)) : 0;
  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/40 border border-slate-800 p-5 backdrop-blur h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-emerald-400" />
        <h3 className="text-sm font-semibold text-white">Fond splněných přání</h3>
      </div>

      <div className="mb-4">
        <label className="text-[10px] text-slate-500 block mb-1">Název cíle</label>
        <input
          type="text"
          value={goal.name}
          onChange={(e) => onGoalChange("name", e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
        />
      </div>

      <div className="relative w-28 h-36 mx-auto mb-4">
        <div className="absolute inset-0 rounded-t-xl rounded-b-3xl border-2 border-slate-700 overflow-hidden bg-slate-950/60">
          <div
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-emerald-500 to-emerald-300 transition-all duration-700"
            style={{ height: `${pct}%` }}
          />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-white drop-shadow" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {pct}%
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-slate-950/60 border border-slate-800 px-3 py-2 mb-3 text-center">
        <p className="text-[10px] text-slate-500 mb-0.5">Naspořeno</p>
        <p className="text-lg font-bold text-emerald-400" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {formatKc(goal.saved)}
        </p>
      </div>

      <div className="mb-4">
        <label className="text-[10px] text-slate-500 block mb-1">Cíl (Kč)</label>
        <input
          type="number"
          min="0"
          step="1"
          value={goal.target}
          onChange={(e) => onGoalChange("target", e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
        />
      </div>

      <button
        onClick={onAddToGoal}
        className="mt-auto w-full rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-medium py-2.5 transition-colors"
      >
        + Přidat úsporu do fondu
      </button>
    </div>
  );
}

function CategoryCard({ cat, spent, allowedToDate, onLimitChange, onSelect }) {
  const meta = CATEGORY_META[cat.name] || DEFAULT_CATEGORY_META;
  const Icon = meta.icon;
  const rawPct = cat.limit > 0 ? Math.round((spent / cat.limit) * 100) : 0;
  const pct = Math.min(100, rawPct);
  const isOverPace = spent > allowedToDate;
  const isOverLimit = rawPct > 100;
  const barColor = isOverLimit ? "#F87171" : isOverPace ? "#FBBF24" : meta.color;
  const iconBg = isOverLimit ? "rgba(248,113,113,0.15)" : meta.bg;
  const iconColor = isOverLimit ? "#F87171" : meta.color;

  return (
    <div
      onClick={() => onSelect(cat.name)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onSelect(cat.name); }}
      className="rounded-2xl bg-slate-900/60 border p-4 backdrop-blur transition-colors cursor-pointer hover:border-slate-600"
      style={{
        borderColor: isOverLimit ? "rgba(248,113,113,0.6)" : isOverPace ? "rgba(248,113,113,0.4)" : "rgb(30 41 59)",
        background: isOverLimit ? "rgba(248,113,113,0.08)" : undefined,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg shrink-0" style={{ background: iconBg }}>
            <Icon size={15} color={iconColor} />
          </div>
          <span className={`text-sm font-medium truncate ${isOverLimit ? "text-red-300" : "text-white"}`}>{cat.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <label className="sr-only" htmlFor={`limit-${cat.name}`}>Rámec pro {cat.name}</label>
          <input
            id={`limit-${cat.name}`}
            type="number"
            min="0"
            step="0.01"
            value={cat.limit}
            onChange={(e) => onLimitChange(cat.name, e.target.value)}
            className={`w-20 bg-transparent text-right text-xs border-b border-dashed focus:outline-none px-0.5 py-0.5 ${
              isOverLimit ? "text-red-300 border-red-500/40 focus:border-red-400" : "text-slate-300 border-slate-700 hover:border-slate-500 focus:border-emerald-500"
            }`}
          />
          <span className={`text-xs ${isOverLimit ? "text-red-400/80" : "text-slate-500"}`}>Kč</span>
        </div>
      </div>

      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>

      <div className={`flex items-center justify-between text-xs ${isOverLimit ? "text-red-300" : "text-slate-400"}`}>
        <span>{formatKc(spent)}</span>
        <span>{rawPct}%</span>
      </div>

      {isOverPace && (
        <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-2">
          <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-snug text-amber-300">
            Pozor, utrácíš moc rychle! K večeři budou topinky.
          </p>
        </div>
      )}
    </div>
  );
}

function DailyArenaCard({ dailySpent, dailyLimit, simulatedDay, onEndDay }) {
  const pct = dailyLimit > 0 ? Math.min(100, Math.round((dailySpent / dailyLimit) * 100)) : 0;
  const overLimit = dailySpent > dailyLimit;
  const remaining = dailyLimit - dailySpent;

  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5 backdrop-blur">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Sandwich size={16} className="text-amber-300" />
          <h3 className="text-sm font-semibold text-white">Denní aréna — Obědy a Svačiny</h3>
        </div>
        <span className="text-[11px] text-slate-500">Den {simulatedDay}</span>
      </div>
      <p className="text-xs text-slate-500 mb-4">Denní limit {formatKc(dailyLimit)} (rámec / 30)</p>

      <div className="flex items-baseline justify-between mb-2">
        <span className={`text-2xl font-bold ${overLimit ? "text-red-300" : "text-white"}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {formatKc(dailySpent)}
        </span>
        <span className="text-xs text-slate-400">z {formatKc(dailyLimit)}</span>
      </div>

      <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: overLimit ? "#F87171" : "#FACC15" }}
        />
      </div>

      <p className={`text-xs mb-4 ${overLimit ? "text-red-300" : "text-slate-400"}`}>
        {overLimit ? `Přečerpáno o ${formatKc(Math.abs(remaining))}` : `Zbývá ${formatKc(remaining)} do konce dne`}
      </p>

      <button
        onClick={onEndDay}
        className="w-full rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-sm font-medium py-2.5 transition-colors"
      >
        Ukončit simulační den
      </button>
    </div>
  );
}

function MonthlyBossCard({ spent, limit, onEvaluate, hasNewProgress }) {
  const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
  const displayPct = Math.min(100, pct);
  const overLimit = spent > limit;
  const diffPct = limit > 0 ? ((limit - spent) / limit) * 100 : 0;
  const projected = diffPct >= 0 ? Math.round(diffPct * 20) : -Math.round(Math.abs(diffPct) * 20);

  return (
    <div
      className="rounded-2xl border p-5 backdrop-blur transition-colors"
      style={{
        background: overLimit ? "rgba(248,113,113,0.08)" : "rgba(15,23,42,0.6)",
        borderColor: overLimit ? "rgba(248,113,113,0.5)" : "rgb(30 41 59)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <ShoppingCart size={16} className={overLimit ? "text-red-300" : "text-emerald-400"} />
        <h3 className="text-sm font-semibold text-white">Měsíční boss — Potraviny</h3>
      </div>
      <p className="text-xs text-slate-500 mb-4">Celkový měsíční limit {formatKc(limit)}</p>

      <div className="flex items-baseline justify-between mb-2">
        <span className={`text-2xl font-bold ${overLimit ? "text-red-300" : "text-white"}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {formatKc(spent)}
        </span>
        <span className={`text-xs ${overLimit ? "text-red-300" : "text-slate-400"}`}>{pct} %</span>
      </div>

      <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${displayPct}%`, background: overLimit ? "#F87171" : "#34D399" }}
        />
      </div>

      <p className={`text-xs mb-4 ${overLimit ? "text-red-300" : "text-emerald-400"}`}>
        {overLimit
          ? `Boss útočí: hrozí ${Math.abs(projected)} XP postihu`
          : `Boss oslaben: potenciál +${projected} XP při vyhodnocení`}
      </p>

      <button
        onClick={onEvaluate}
        disabled={!hasNewProgress}
        className="w-full rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-medium py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Vyhodnotit měsíc (Boss)
      </button>
    </div>
  );
}

function GamificationPanel({ xp, streak, level, nextLevel }) {
  const range = nextLevel ? nextLevel.min - level.min : 1;
  const progressed = nextLevel ? xp - level.min : range;
  const pct = nextLevel ? Math.min(100, Math.round((progressed / range) * 100)) : 100;

  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5 backdrop-blur">
      <div className="flex items-center gap-2 mb-4">
        <ChefHat size={16} className="text-emerald-400" />
        <h3 className="text-sm font-semibold text-white">Finanční hra</h3>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
          <Trophy size={20} className="text-emerald-400" />
        </div>
        <div>
          <p className="text-xs text-slate-400">Level {LEVELS.indexOf(level) + 1}</p>
          <p className="text-sm font-semibold text-white">{level.name}</p>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-[11px] text-slate-400 mb-1">
          <span>{xp} XP</span>
          <span>{nextLevel ? `${nextLevel.min} XP → ${nextLevel.name}` : "Maximální level!"}</span>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-slate-950/60 border border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <Flame size={18} className="text-orange-400" />
          <span className="text-sm text-slate-300">Šetřící streak</span>
        </div>
        <span className="text-lg font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {streak} {streak === 1 ? "den" : streak >= 2 && streak <= 4 ? "dny" : "dní"}
        </span>
      </div>
    </div>
  );
}

function CategoryTransactionsModal({ categoryName, transactions, spent, limit, onClose, onDelete }) {
  if (!categoryName) return null;
  const meta = CATEGORY_META[categoryName] || DEFAULT_CATEGORY_META;
  const Icon = meta.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl">
        <div className="flex items-center justify-between p-5 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg shrink-0" style={{ background: meta.bg }}>
              <Icon size={15} color={meta.color} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white truncate">{categoryName}</h3>
              <p className="text-[11px] text-slate-500">
                {formatKc(spent)} z {formatKc(limit)} tento měsíc
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto p-3">
          {transactions.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              V této kategorii zatím tento měsíc nejsou žádné transakce.
            </p>
          ) : (
            <div className="space-y-1">
              {transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg px-2.5 py-2 hover:bg-slate-800/40 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{t.note || t.category}</p>
                    <p className="text-[11px] text-slate-500">{t.date}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-sm font-semibold text-slate-300">{formatKc(t.amount)}</span>
                    <button
                      onClick={() => onDelete(t.id)}
                      aria-label={`Smazat transakci ${t.note || t.category}`}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GoalContributionModal({ open, value, onChange, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Přidat úsporu do fondu</h3>
          </div>
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        <label className="text-[11px] text-slate-400 block mb-1">Částka (Kč)</label>
        <input
          type="number"
          min="0"
          step="1"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onConfirm(); }}
          placeholder="např. 500"
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 mb-4"
        />

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-slate-800 text-slate-300 text-sm font-medium py-2 hover:bg-slate-800/60 transition-colors"
          >
            Zrušit
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold py-2 transition-colors"
          >
            Přidat
          </button>
        </div>
      </div>
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  const style =
    toast.type === "error"
      ? "bg-red-500/15 border-red-500/40 text-red-300"
      : toast.type === "warning"
      ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
      : "bg-emerald-500/15 border-emerald-500/30 text-emerald-300";
  const Icon = toast.type === "error" ? X : toast.type === "warning" ? AlertTriangle : Check;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90vw] max-w-md animate-[fadeIn_0.2s_ease]">
      <div className={`flex items-start gap-2 rounded-xl px-4 py-3 border shadow-2xl backdrop-blur ${style}`}>
        <Icon size={16} className="shrink-0 mt-0.5" />
        <span className="text-sm font-medium whitespace-pre-wrap break-words">{toast.message}</span>
      </div>
    </div>
  );
}

// ---------- Hlavní aplikace ----------

export default function BudgetDashboard() {
  const [transactions, setTransactions] = useState(() => loadPersistedState()?.transactions ?? INITIAL_TRANSACTIONS);
  const [categories, setCategories] = useState(() => loadPersistedState()?.categories ?? INITIAL_CATEGORIES);
  const [goal, setGoal] = useState(() => loadPersistedState()?.goal ?? { name: "Nový iPhone", target: 25000, saved: 0 });
  const [xp, setXp] = useState(() => loadPersistedState()?.xp ?? 0);
  const [streak, setStreak] = useState(() => loadPersistedState()?.streak ?? 0);
  const [dailyLunchSpent, setDailyLunchSpent] = useState(() => loadPersistedState()?.dailyLunchSpent ?? 0);
  const [simulatedDay, setSimulatedDay] = useState(() => loadPersistedState()?.simulatedDay ?? 1);
  const [bossEvaluatedAtSpent, setBossEvaluatedAtSpent] = useState(() => loadPersistedState()?.bossEvaluatedAtSpent ?? null);
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState(null);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalModalValue, setGoalModalValue] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    amount: "",
    type: "expense",
    category: "Potraviny",
    date: new Date().toISOString().slice(0, 10),
    note: "",
  });

  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const showToast = (message, type = "success", duration) => {
    setToast({ message, type });
    const ms = duration ?? (type === "error" ? 9000 : 3200);
    setTimeout(() => setToast(null), ms);
  };

  // Průběžné ukládání celého stavu appky do localStorage —
  // po refreshi nebo zavření prohlížeče se vše načte zpátky (viz hydratace výše).
  useEffect(() => {
    savePersistedState({
      transactions,
      categories,
      goal,
      xp,
      streak,
      dailyLunchSpent,
      simulatedDay,
      bossEvaluatedAtSpent,
    });
  }, [transactions, categories, goal, xp, streak, dailyLunchSpent, simulatedDay, bossEvaluatedAtSpent]);

  const monthTransactions = useMemo(
    () =>
      transactions.filter((t) => {
        const d = new Date(t.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }),
    [transactions]
  );

  const totalIncome = useMemo(
    () => monthTransactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
    [monthTransactions]
  );
  const totalExpense = useMemo(
    () => monthTransactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    [monthTransactions]
  );
  const balance = totalIncome - totalExpense;

  const categorySpent = useMemo(() => {
    const map = {};
    categories.forEach((c) => {
      map[c.name] = monthTransactions
        .filter((t) => t.type === "expense" && t.category === c.name)
        .reduce((s, t) => s + t.amount, 0);
    });
    return map;
  }, [monthTransactions, categories]);

  const budgetTotal = useMemo(() => categories.reduce((s, c) => s + c.limit, 0), [categories]);
  const spentInBudgets = useMemo(
    () => Object.values(categorySpent).reduce((s, v) => s + v, 0),
    [categorySpent]
  );

  const selectedCategoryTransactions = useMemo(() => {
    if (!selectedCategory) return [];
    return monthTransactions
      .filter((t) => t.type === "expense" && t.category === selectedCategory)
      .sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id);
  }, [monthTransactions, selectedCategory]);

  const selectedCategoryObj = categories.find((c) => c.name === selectedCategory);

  const level = useMemo(() => [...LEVELS].reverse().find((l) => xp >= l.min), [xp]);
  const nextLevel = useMemo(() => {
    const idx = LEVELS.indexOf(level);
    return LEVELS[idx + 1] || null;
  }, [level]);

  // Přidání transakce. Streak/XP už negenerují jednotlivé transakce —
  // o to se stará "Ukončit simulační den" (Obědy a Svačiny) a "Vyhodnotit měsíc" (Potraviny).
  const commitTransaction = (tx, opts = {}) => {
    const newTx = { id: Date.now() + Math.random(), ...tx };
    setTransactions((prev) => [newTx, ...prev]);

    if (tx.type === "expense" && tx.category === "Obědy a Svačiny") {
      setDailyLunchSpent((s) => s + tx.amount);
    }

    if (!opts.silent && !opts.customToast) {
      showToast(`Transakce přidána: ${tx.note || tx.category} — ${formatKc(tx.amount)}`, "success");
    }
  };

  const handleFormSubmit = () => {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      showToast("Zadej platnou částku.", "warning");
      return;
    }
    commitTransaction({
      type: form.type,
      category: form.category,
      amount,
      date: form.date,
      note: form.note || form.category,
    });
    setForm((f) => ({ ...f, amount: "", note: "" }));
  };

  const triggerReceiptCapture = () => {
    fileInputRef.current?.click();
  };

  // Reálné napojení na fotoaparát + Vercel backend endpoint /api/scan-receipt.
  // Očekávaný kontrakt API:
  //   POST /api/scan-receipt   body: { image: "<base64 data URL>" }
  //   response 200 JSON:       { store: "Lidl", amount: 850, category: "Potraviny" }
  const handleReceiptScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
    try {
      const base64Image = await compressImageToBase64(file);

      const response = await fetch("/api/scan-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Image }),
      });

      if (!response.ok) {
        let backendMessage = "";
        try {
          const errorBody = await response.json();
          backendMessage = errorBody?.error || errorBody?.message || "";
        } catch (parseErr) {
          // odpověď nebyla JSON — necháme backendMessage prázdné, použije se fallback níž
        }
        throw new Error(
          backendMessage || `API vrátilo status ${response.status} ${response.statusText || ""}`.trim()
        );
      }

      const data = await response.json();

      if (!data || typeof data.amount !== "number" || !data.store) {
        throw new Error(
          `Neplatná odpověď z API: ${JSON.stringify(data)}`
        );
      }

      const matchedCategory = categories.some((c) => c.name === data.category)
        ? data.category
        : "Neočekávané výdaje";

      commitTransaction(
        {
          type: "expense",
          category: matchedCategory,
          amount: data.amount,
          date: new Date().toISOString().slice(0, 10),
          note: data.store,
        },
        { customToast: true }
      );

      const { newLevel, oldLevel } = applyXpDelta(10);
      let msg = `🧾 Pekař rozpoznal účtenku: ${data.store} — ${formatKc(data.amount)} (${matchedCategory}). +10 XP!`;
      if (LEVELS.indexOf(newLevel) > LEVELS.indexOf(oldLevel)) {
        msg += ` 🎉 Level up → ${newLevel.name}!`;
      }
      showToast(msg, "success");
    } catch (err) {
      const detail = err?.message || String(err);
      showToast(`⚠️ Skenování selhalo: ${detail}`, "error");
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const updateCategoryLimit = (name, value) => {
    const num = parseFloat(value);
    setCategories((prev) =>
      prev.map((c) => (c.name === name ? { ...c, limit: value === "" ? 0 : isNaN(num) ? c.limit : num } : c))
    );
  };

  const lunchCategory = categories.find((c) => c.name === "Obědy a Svačiny");
  const dailyLunchLimit = lunchCategory ? lunchCategory.limit / 30 : 0;

  const groceriesCategory = categories.find((c) => c.name === "Potraviny");
  const groceriesSpent = categorySpent["Potraviny"] || 0;
  const groceriesLimit = groceriesCategory ? groceriesCategory.limit : 0;
  const bossHasNewProgress = bossEvaluatedAtSpent !== groceriesSpent;

  const applyXpDelta = (delta) => {
    const oldLevel = levelForXp(xp);
    const newXp = Math.max(0, xp + delta);
    const newLevel = levelForXp(newXp);
    setXp(newXp);
    return { oldLevel, newLevel, newXp };
  };

  // DENNÍ ARÉNA — vyhodnotí pouze "Obědy a Svačiny" a posune simulovaný den
  const endSimulatedDay = () => {
    if (dailyLunchSpent <= dailyLunchLimit) {
      const bonus = Math.round(dailyLunchLimit - dailyLunchSpent);
      setStreak((s) => s + 1);
      const { newLevel, oldLevel } = applyXpDelta(bonus);
      let msg = `☀️ Den ${simulatedDay} splněn! Streak +1, +${bonus} XP za ušetřené obědy.`;
      if (LEVELS.indexOf(newLevel) > LEVELS.indexOf(oldLevel)) {
        msg += ` 🎉 Level up → ${newLevel.name}!`;
      }
      showToast(msg, "success");
    } else {
      setStreak(0);
      showToast(`💥 Den ${simulatedDay}: limit na obědy překročen o ${formatKc(dailyLunchSpent - dailyLunchLimit)}. Streak resetován na 0.`, "warning");
    }
    setDailyLunchSpent(0);
    setSimulatedDay((d) => d + 1);
  };

  // MĚSÍČNÍ BOSS — vyhodnotí celkovou útratu za "Potraviny" proti měsíčnímu limitu
  const evaluateMonthlyBoss = () => {
    if (!groceriesCategory || groceriesLimit <= 0) return;
    const diffPct = ((groceriesLimit - groceriesSpent) / groceriesLimit) * 100;

    let delta = 0;
    let msg = "";
    if (diffPct >= 0) {
      delta = Math.round(diffPct * 20);
      msg = `🏆 Boss Potraviny poražen! Ušetřeno ${diffPct.toFixed(1)} % rámce → +${delta} XP`;
    } else {
      const overPct = Math.abs(diffPct);
      delta = -Math.round(overPct * 20);
      msg = `💥 Boss Potraviny tě přemohl! Přečerpáno o ${overPct.toFixed(1)} % → ${delta} XP`;
    }

    const { newLevel, oldLevel } = applyXpDelta(delta);
    if (LEVELS.indexOf(newLevel) < LEVELS.indexOf(oldLevel)) {
      msg += ` 📉 Degradace na Level ${LEVELS.indexOf(newLevel) + 1} – ${newLevel.name}!`;
    } else if (LEVELS.indexOf(newLevel) > LEVELS.indexOf(oldLevel)) {
      msg += ` 🎉 Level up → ${newLevel.name}!`;
    }

    setBossEvaluatedAtSpent(groceriesSpent);
    showToast(msg, diffPct >= 0 ? "success" : "warning");
  };

  const updateGoal = (field, value) => {
    setGoal((prev) => {
      if (field === "name") return { ...prev, name: value };
      const num = parseFloat(value);
      return { ...prev, [field]: value === "" ? 0 : isNaN(num) ? prev[field] : num };
    });
  };

  const openGoalModal = () => {
    setGoalModalValue("");
    setGoalModalOpen(true);
  };

  const cancelGoalModal = () => {
    setGoalModalOpen(false);
    setGoalModalValue("");
  };

  const confirmGoalContribution = () => {
    const amount = parseFloat(goalModalValue);
    if (!amount || amount <= 0) {
      showToast("Zadej platnou částku.", "warning");
      return;
    }
    setGoal((g) => ({ ...g, saved: g.saved + amount }));
    showToast(`+${formatKc(amount)} přidáno do fondu splněných přání`, "success");
    setGoalModalOpen(false);
    setGoalModalValue("");
  };

  const deleteTransaction = (id) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    showToast("Transakce smazána.", "success");
  };

  const resetMonth = () => {
    const confirmed = window.confirm(
      "Opravdu smazat všechny transakce? Rámce kategorií, XP, level a fond splněných přání zůstanou zachované."
    );
    if (!confirmed) return;
    setTransactions([]);
    setDailyLunchSpent(0);
    setSimulatedDay(1);
    setBossEvaluatedAtSpent(null);
    showToast("🧹 Měsíc resetován — všechny transakce smazány, rámce kategorií zůstaly.", "success");
  };

  const updateTransactionCategory = (id, newCategory) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, category: newCategory } : t))
    );
  };

  const recentTransactions = [...transactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id)
    .slice(0, 8);

  return (
    <div className="min-h-screen bg-[#0B1220] text-slate-100" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes fadeIn { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.7); }
      `}</style>

      <Toast toast={toast} />
      <GoalContributionModal
        open={goalModalOpen}
        value={goalModalValue}
        onChange={setGoalModalValue}
        onConfirm={confirmGoalContribution}
        onCancel={cancelGoalModal}
      />
      <CategoryTransactionsModal
        categoryName={selectedCategory}
        transactions={selectedCategoryTransactions}
        spent={selectedCategory ? categorySpent[selectedCategory] || 0 : 0}
        limit={selectedCategoryObj ? selectedCategoryObj.limit : 0}
        onClose={() => setSelectedCategory(null)}
        onDelete={deleteTransaction}
      />

      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/40 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500">
              <ChefHat size={20} className="text-slate-950" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Peníze pečou
              </h1>
              <p className="text-[11px] text-slate-500 -mt-0.5">Tvůj osobní finanční pekař</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetMonth}
              className="flex items-center gap-1.5 text-xs font-medium rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-red-300 px-3 py-1.5 transition-colors"
            >
              <RotateCcw size={13} /> <span className="hidden sm:inline">Reset měsíce</span>
            </button>
            <div className="hidden sm:flex items-center gap-2 rounded-full bg-slate-900 border border-slate-800 pl-1 pr-3 py-1">
              <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Wallet size={14} />
              </div>
              <span className="text-sm font-medium text-white">{formatKc(balance)}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Dashboard stat cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Wallet} label="Aktuální zůstatek" value={formatKc(balance)} accent="#34D399" sub="Tento měsíc" />
          <StatCard icon={TrendingUp} label="Příjmy" value={formatKc(totalIncome)} accent="#38BDF8" sub="Za tento měsíc" />
          <StatCard icon={TrendingDown} label="Výdaje" value={formatKc(totalExpense)} accent="#F87171" sub="Za tento měsíc" />
          <OverdraftCard balance={balance} limit={OVERDRAFT_LIMIT} />
        </section>

        {/* Přehled: příjmy vs. rozpočtové rámce */}
        <section>
          <BudgetOverviewBars income={totalIncome} budgetTotal={budgetTotal} spentTotal={spentInBudgets} />
        </section>

        {/* Herní aréna: Denní disciplína + Měsíční boss */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DailyArenaCard
            dailySpent={dailyLunchSpent}
            dailyLimit={dailyLunchLimit}
            simulatedDay={simulatedDay}
            onEndDay={endSimulatedDay}
          />
          <MonthlyBossCard
            spent={groceriesSpent}
            limit={groceriesLimit}
            onEvaluate={evaluateMonthlyBoss}
            hasNewProgress={bossHasNewProgress}
          />
        </section>

        {/* Goal fund + Categories */}
        <section className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-1">
            <GoalFundCard goal={goal} onGoalChange={updateGoal} onAddToGoal={openGoalModal} />
          </div>
          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => (
              <CategoryCard
                key={cat.name}
                cat={cat}
                spent={categorySpent[cat.name] || 0}
                allowedToDate={cat.limit * (dayOfMonth / daysInMonth)}
                onLimitChange={updateCategoryLimit}
                onSelect={setSelectedCategory}
              />
            ))}
          </div>
        </section>

        {/* Transactions + form + gamification */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Add transaction */}
          <div className="lg:col-span-2 rounded-2xl bg-slate-900/60 border border-slate-800 p-5 backdrop-blur">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Přidat transakci</h3>
              <div className="flex gap-2">
                <input
                  type="file"
                  accept="image/*"
                  id="receipt-upload"
                  ref={fileInputRef}
                  onChange={handleReceiptScan}
                  style={{ display: "none" }}
                />
                <button
                  onClick={triggerReceiptCapture}
                  disabled={scanning}
                  className="flex items-center gap-1.5 text-xs font-medium rounded-lg bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-300 px-3 py-2 transition-colors disabled:opacity-60"
                >
                  {scanning ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                  {scanning ? "Pekař zkoumá účtenku… 🔍" : "Vyfotit účtenku"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="text-[11px] text-slate-400 block mb-1">Typ</label>
                <select
                  value={form.type}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setForm((f) => ({
                      ...f,
                      type: newType,
                      category: newType === "income" ? "Příjem" : categories[0]?.name || f.category,
                    }));
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="expense">Výdaj</option>
                  <option value="income">Příjem</option>
                </select>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="text-[11px] text-slate-400 block mb-1">Částka (Kč)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="text-[11px] text-slate-400 block mb-1">Kategorie</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="Příjem">Příjem</option>
                  {categories.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="text-[11px] text-slate-400 block mb-1">Datum</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="col-span-2 sm:col-span-3">
                <label className="text-[11px] text-slate-400 block mb-1">Poznámka (nepovinné)</label>
                <input
                  type="text"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") handleFormSubmit(); }}
                  placeholder="např. Lidl, výplata…"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="col-span-2 sm:col-span-1 flex items-end">
                <button
                  type="button"
                  onClick={handleFormSubmit}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-semibold py-2 transition-colors"
                >
                  <Plus size={15} /> Přidat
                </button>
              </div>
            </div>

            {/* Transaction list */}
            <div className="mt-5 border-t border-slate-800 pt-4">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Poslední transakce</h4>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {recentTransactions.map((t) => {
                  const meta = CATEGORY_META[t.category];
                  const Icon = meta ? meta.icon : Wallet;
                  return (
                    <div key={t.id} className="flex items-center justify-between rounded-lg px-2.5 py-2 hover:bg-slate-800/40 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-1.5 rounded-lg shrink-0" style={{ background: meta ? meta.bg : "rgba(52,211,153,0.12)" }}>
                          <Icon size={13} color={meta ? meta.color : "#34D399"} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-white truncate">{t.note || t.category}</p>
                          <div className="flex items-center gap-1 text-[11px] text-slate-500">
                            <select
                              value={t.category}
                              onChange={(e) => updateTransactionCategory(t.id, e.target.value)}
                              aria-label={`Kategorie transakce ${t.note || t.category}`}
                              className="bg-transparent border-none text-[11px] text-slate-400 hover:text-white focus:text-white focus:outline-none cursor-pointer -ml-0.5 py-0"
                            >
                              <option value="Příjem">Příjem</option>
                              {categories.map((c) => (
                                <option key={c.name} value={c.name}>{c.name}</option>
                              ))}
                            </select>
                            <span>· {t.date}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className={`text-sm font-semibold ${t.type === "income" ? "text-emerald-400" : "text-slate-300"}`}>
                          {t.type === "income" ? "+" : "−"}{formatKc(t.amount)}
                        </span>
                        <button
                          onClick={() => deleteTransaction(t.id)}
                          aria-label={`Smazat transakci ${t.note || t.category}`}
                          className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Gamification */}
          <div>
            <GamificationPanel xp={xp} streak={streak} level={level} nextLevel={nextLevel} />
          </div>
        </section>
      </main>
    </div>
  );
}
