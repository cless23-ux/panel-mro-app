import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Package, ArrowDownToLine, ArrowUpFromLine, LayoutGrid, Boxes, ScanLine,
  AlertTriangle, CheckCircle2, Search, Plus, X, Zap, Trash2, Download, Upload, QrCode, Camera
} from "lucide-react";
import { supabase } from './supabaseClient';

/* ---------------- 폰트 및 초기 데이터 ---------------- */
const FONT_LINK =
"Rajdhani:wght@500;600;700|Oswald:wght@500;600;700|IBM+Plex+Mono:wght@400;500;600|Inter:wght@400;500;600;700";

const seedItems = [
  { code: "BB-C1100-T3", name: "부스바 (동바)", spec: "C1100 T3 x 20mm", unit: "m", stock: 62, safety: 50, location: "A-01", manufacturer: "대한전선", category: "부스바" },
  { code: "RT-2.5SQ", name: "압착단자", spec: "Ring Terminal 2.5 sq", unit: "EA", stock: 840, safety: 1000, location: "B-04", manufacturer: "KEC", category: "압착단자" },
  { code: "CG-M20-BR", name: "케이블 글랜드", spec: "Brass Gland M20", unit: "EA", stock: 260, safety: 200, location: "B-07", manufacturer: "동아베스텍", category: "케이블 글랜드" },
];

function uid(p = "T") {
  return `${p}-${Date.now().toString(36)}${Math.floor(Math.random() * 900 + 100)}`;
}
function nowStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const POLL_MS = 8000;

/* ---------------- Supabase 연동 useStorage Hook ---------------- */
function useStorage(key, initial) {
  const [value, setValue] = useState(initial);
  const [loaded, setLoaded] = useState(false);
  const tableName = key === "panel:items" ? "items" : "transactions";

  const load = useCallback(async (silent = false) => {
    try {
      if (supabase) {
        const { data, error } = await supabase.from(tableName).select("*").eq("deleted", false);
        if (!error && data && data.length > 0) {
          setValue(data);
          localStorage.setItem(key, JSON.stringify(data));
          if (!silent) setLoaded(true);
          return;
        }
      }
      const res = localStorage.getItem(key);
      if (res !== null) {
        setValue(JSON.parse(res));
      }
    } catch (e) {
      console.error("Storage load error:", e);
    } finally {
      if (!silent) setLoaded(true);
    }
  }, [key, tableName]);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const save = useCallback(async (next) => {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      if (supabase) {
        if (tableName === "items") {
          await supabase.from("items").upsert(next, { onConflict: "code" });
        } else if (tableName === "transactions") {
          await supabase.from("transactions").upsert(next, { onConflict: "id" });
        }
      }
    } catch (e) {
      console.error("Storage save error:", e);
    }
  }, [key, tableName]);

  return [value, save, loaded, load];
}

function statusOf(item) {
  const safety = Number(item.safety) || 0;
  const stock = Number(item.stock) || 0;
  if (stock < safety) return "danger";
  if (stock < safety * 1.2) return "warn";
  return "ok";
}

const STATUS_META = {
  ok: { label: "정상", color: "#35D08C" },
  warn: { label: "주의", color: "#F5A623" },
  danger: { label: "부족", color: "#EF5350" },
};

function Led({ status, size = 10 }) {
  const c = STATUS_META[status]?.color || "#35D08C";
  return (
    <span
      style={{
        display: "inline-block", width: size, height: size, borderRadius: "50%",
        background: c, boxShadow: `0 0 6px 1px ${c}99`, flexShrink: 0,
      }}
    />
  );
}

function Card({ children, style, className = "" }) {
  return (
    <div
      className={className}
      style={{
        background: "linear-gradient(180deg, #122A3F 0%, #0F2233 100%)",
        border: "1px solid #1F3B54",
        borderRadius: 12,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: "0.14em",
      color: "#5E86A3", textTransform: "uppercase", marginBottom: 12, display: "flex",
      alignItems: "center", gap: 8,
    }}>
      <span style={{ width: 14, height: 2, background: "#F5A623", display: "inline-block" }} />
      {children}
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", style, disabled, type = "button" }) {
  const variants = {
    primary: { background: "#F5A623", color: "#0A1622", border: "1px solid #F5A623" },
    ghost: { background: "transparent", color: "#C9DAE8", border: "1px solid #274460" },
    danger: { background: "transparent", color: "#EF5350", border: "1px solid #4A2A2A" },
    subtle: { background: "#16324A", color: "#C9DAE8", border: "1px solid #274460" },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...variants[variant],
        fontFamily: "'IBM Plex Mono', monospace",
        fontWeight: 600, fontSize: 14, padding: "12px 20px", borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1,
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all .15s",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontFamily: "Inter, sans-serif" }}>
      <span style={{ fontSize: 13, color: "#9FB4C7", fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  background: "#0B1C2C", border: "1px solid #26445F", borderRadius: 8, color: "#E7EEF5",
  padding: "12px 14px", fontSize: 14, fontFamily: "'IBM Plex Mono', monospace", outline: "none", width: "100%",
};

function Select({ value, onChange, options, style }) {
  return (
    <select value={value} onChange={onChange} style={{ ...inputStyle, ...style }}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function SearchableSelect({ items, value, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selectedItem = useMemo(() => items.find((i) => String(i.code).replace(/[\r\n]+/g, "").trim() === String(value).replace(/[\r\n]+/g, "").trim()), [items, value]);

  const filtered = useMemo(() => {
    if (!query) return items.slice(0, 50);
    const q = query.toLowerCase().trim();
    return items.filter((i) =>
      String(i.code).toLowerCase().includes(q) ||
      String(i.name).toLowerCase().includes(q) ||
      String(i.spec).toLowerCase().includes(q) ||
      (i.manufacturer && String(i.manufacturer).toLowerCase().includes(q))
    ).slice(0, 50);
  }, [items, query]);

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          ...inputStyle, cursor: "pointer", display: "flex", justifyContent: "space-between",
          alignItems: "center", background: "#0B1C2C",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selectedItem ? `[${selectedItem.code}] ${selectedItem.name} (${selectedItem.spec || ""})` : "자재를 검색하여 선택하세요"}
        </span>
        <span style={{ fontSize: 10, color: "#7F97AC", marginLeft: 8 }}>▼</span>
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
          background: "#0F2233", border: "1px solid #274460", borderRadius: 8,
          marginTop: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", padding: 8,
        }}>
          <input
            style={{ ...inputStyle, marginBottom: 8 }}
            placeholder="자재명, 코드, 규격 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 12, color: "#7F97AC", fontSize: 13, textAlign: "center" }}>검색 결과가 없습니다.</div>
            ) : (
              filtered.map((item) => (
                <div
                  key={item.code}
                  onClick={() => {
                    onChange(item.code);
                    setOpen(false);
                    setQuery("");
                  }}
                  style={{
                    padding: "10px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13,
                    borderBottom: "1px solid #16293C",
                    background: item.code === value ? "#1F3B54" : "transparent",
                  }}
                >
                  <div style={{ fontWeight: 600, color: "#E7EEF5" }}>{item.name} <span style={{ fontSize: 11, color: "#F5A623" }}>[{item.code}]</span></div>
                  <div style={{ fontSize: 11.5, color: "#7F97AC" }}>{item.spec} | 재고: {item.stock}{item.unit}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  const colors = { ok: "#35D08C", err: "#EF5350", info: "#F5A623" };
  return (
    <div className="toast-box" style={{
      position: "fixed", background: "#0F2233", border: `1px solid ${colors[toast.type] || colors.info}`,
      color: "#E7EEF5", padding: "12px 20px", borderRadius: 20, fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 13, zIndex: 999, boxShadow: "0 8px 24px rgba(0,0,0,0.6)", display: "flex",
      alignItems: "center", gap: 8, animation: "riseIn .2s ease-out",
    }}>
      <Led status={toast.type === "ok" ? "ok" : toast.type === "err" ? "danger" : "warn"} size={8} />
      {toast.text}
    </div>
  );
}

export default function App() {
  const [items, saveItems, itemsLoaded, reloadItems] = useStorage("panel:items", seedItems);
  const [txs, saveTxs, txsLoaded, reloadTxs] = useStorage("panel:transactions", []);
  const [tab, setTab] = useState("out");
  const [toast, setToast] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!window.XLSX) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([reloadItems(), reloadTxs()]);
    setRefreshing(false);
  };

  const notify = (msg, type = "ok") => {
    setToast({ text: msg, type });
    setTimeout(() => { setToast(null); }, 2500);
  };

  const alerts = useMemo(() => items.filter((i) => statusOf(i) === "danger"), [items]);
  const warns = useMemo(() => items.filter((i) => statusOf(i) === "warn"), [items]);

  const NAV = [
    { id: "dashboard", label: "대시보드", icon: LayoutGrid },
    { id: "in", label: "입고등록", icon: ArrowDownToLine },
    { id: "out", label: "출고(스캔)", icon: ArrowUpFromLine },
    { id: "stock", label: "재고조회", icon: Boxes },
    { id: "master", label: "자재마스터", icon: Package, pcOnly: true },
    { id: "trash", label: "삭제복원", icon: Trash2, pcOnly: true },
  ];

  const ready = itemsLoaded && txsLoaded;

  return (
    <div className="app-container" style={{
      background: "#0A1622", color: "#E7EEF5", fontFamily: "Inter, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=${FONT_LINK}&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        ::selection { background: #F5A62355; }
        table { border-collapse: collapse; width: 100%; }
        th, td { text-align: left; padding: 10px 12px; font-size: 13.5px; }
        tbody tr { border-top: 1px solid #17293B; }
        tbody tr:hover { background: #0F2030; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: #21405B; border-radius: 4px; }
        @keyframes riseIn { from { opacity:0; transform: translate(-50%,12px);} to {opacity:1; transform: translate(-50%,0);} }
        input:focus, select:focus { border-color: #F5A623 !important; }
        button:active { transform: scale(0.98); }

        .app-container { display: flex; min-height: 100vh; width: 100%; }
        .pc-sidebar { width: 250px; flex-shrink: 0; border-right: 1px solid #16293C; padding: 24px 18px; display: flex; flex-direction: column; gap: 26px; }
        .mobile-header { display: none; }
        .mobile-bottom-nav { display: none; }
        .main-content { flex: 1; padding: 30px 36px; overflow-y: auto; min-width: 0; }
        .toast-box { bottom: 26px; left: 50%; transform: translateX(-50%); }

        @media (max-width: 768px) {
          .app-container { flex-direction: column; height: 100vh; width: 100vw; overflow: hidden; }
          .pc-sidebar { display: none; }
          .mobile-header {
            height: 52px; padding: 0 16px; border-bottom: 1px solid #16293C; background: #0F2233;
            display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; z-index: 10;
          }
          .mobile-bottom-nav {
            height: 64px; border-top: 1px solid #16293C; background: #0F2233; display: grid;
            grid-template-columns: repeat(4, 1fr); flex-shrink: 0; z-index: 10;
          }
          .main-content { flex: 1; padding: 16px 14px; overflow-y: auto; }
          .toast-box { bottom: 80px; left: 50%; transform: translateX(-50%); width: calc(100% - 32px); max-width: 360px; justify-content: center; }
        }
      `}</style>

      {/* PC 전용 사이드바 */}
      <div className="pc-sidebar">
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 4px" }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src="/Luxco.png" alt="Luxco" style={{ width: "250%", height: "300%", objectFit: "contain" }} />
          </div>
          <div>
            <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "0.02em" }}>선박 생산부</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#5E86A3", letterSpacing: "0.08em" }}>부자재 관리 시스템</div>
          </div>
        </div>

        <button
          onClick={refreshAll}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            padding: "10px 14px", borderRadius: 8, border: "1px solid #1F3B54", background: "#0F2233",
            cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#35D08C" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#35D08C" }} />
            Supabase 연동됨
          </span>
          <span style={{ fontSize: 11, color: refreshing ? "#F5A623" : "#7F97AC" }}>
            {refreshing ? "동기화..." : "↻ 새로고침"}
          </span>
        </button>

        <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {NAV.map((n) => {
            const active = tab === n.id;
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 8,
                  border: "1px solid " + (active ? "#F5A62355" : "transparent"),
                  background: active ? "linear-gradient(90deg, #F5A62322, transparent)" : "transparent",
                  color: active ? "#F5A623" : "#9FB4C7", cursor: "pointer", fontSize: 15,
                  fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, textAlign: "left",
                  borderLeft: active ? "3px solid #F5A623" : "3px solid transparent",
                }}
              >
                <Icon size={18} />
                {n.label}
              </button>
            );
          })}
        </nav>

        <div style={{ marginTop: "auto" }}>
          <Card style={{ padding: 16 }}>
            <SectionLabel>재고 요약</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 7, color: "#9FB4C7" }}><Led status="danger" />부족</span>
                <b style={{ color: "#EF5350" }}>{alerts.length}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 7, color: "#9FB4C7" }}><Led status="warn" />주의</span>
                <b style={{ color: "#F5A623" }}>{warns.length}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 7, color: "#9FB4C7" }}><Led status="ok" />정상</span>
                <b style={{ color: "#35D08C" }}>{items.length - alerts.length - warns.length}</b>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* 모바일 헤더 */}
      <header className="mobile-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/Luxco.png" alt="Luxco" style={{ height: 34, width: "auto", objectFit: "contain", display: "block" }} />
            <span style={{ fontFamily: "Rajdhani, Oswald, sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "0.06em", color: "#fff" }}>
              선박 생산부
            </span>
          </div>
        </div>
        <button
          onClick={refreshAll}
          style={{
            background: "transparent", border: "none", color: refreshing ? "#F5A623" : "#7F97AC",
            fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", cursor: "pointer",
          }}
        >
          {refreshing ? "동기화..." : "↻ 동기화"}
        </button>
      </header>

      {/* 메인 컨텐츠 영역 */}
      <main className="main-content">
        {!ready ? (
          <div style={{ color: "#5E86A3", fontFamily: "'IBM Plex Mono', monospace", textAlign: "center", padding: 40 }}>Supabase 불러오는 중...</div>
        ) : (
          <>
            {tab === "dashboard" && <Dashboard items={items} txs={txs} />}
            {tab === "in" && <InForm items={items} saveItems={saveItems} txs={txs} saveTxs={saveTxs} notify={notify} />}
            {tab === "out" && <OutForm items={items} saveItems={saveItems} txs={txs} saveTxs={saveTxs} notify={notify} />}
            {tab === "stock" && <StockView items={items} />}
            {tab === "master" && <MasterView items={items} saveItems={saveItems} notify={notify} />}
            {tab === "trash" && <TrashView items={items} saveItems={saveItems} notify={notify} />}
          </>
        )}
      </main>

      {/* 모바일 하단 탭 바 */}
      <nav className="mobile-bottom-nav">
        {NAV.filter(n => !n.pcOnly).map((n) => {
          const active = tab === n.id;
          const Icon = n.icon;
          return (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              style={{
                background: "transparent", border: "none", color: active ? "#F5A623" : "#7F97AC",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 4, cursor: "pointer", padding: 0,
              }}
            >
              <Icon size={19} color={active ? "#F5A623" : "#7F97AC"} />
              <span style={{ fontSize: 10.5, fontFamily: "Inter, sans-serif", fontWeight: active ? 700 : 500 }}>
                {n.label}
              </span>
            </button>
          );
        })}
      </nav>

      <Toast toast={toast} />
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard({ items, txs }) {
  const availableShips = useMemo(() => {
    const outTxs = txs.filter((t) => t.type === "out" && t.shipNo && t.shipNo !== "미입력");
    const uniqueShips = Array.from(new Set(outTxs.map((t) => t.shipNo)));
    return uniqueShips.length > 0 ? uniqueShips : ["등록된 호선 없음"];
  }, [txs]);

  const [selectedShip, setSelectedShip] = useState(availableShips[0] || "");

  useEffect(() => {
    if (availableShips.length > 0 && !availableShips.includes(selectedShip)) {
      setSelectedShip(availableShips[0]);
    }
  }, [availableShips, selectedShip]);

  const shipMaterialConsumption = useMemo(() => {
    if (!selectedShip || selectedShip === "등록된 호선 없음") return [];

    const map = {};
    txs
      .filter((t) => t.type === "out" && t.shipNo === selectedShip)
      .forEach((t) => {
        const key = t.itemName || t.itemCode;
        if (!map[key]) {
          map[key] = { name: key, code: t.itemCode, qty: 0, unit: t.unit || "EA" };
        }
        map[key].qty += Number(t.qty) || 0;
      });

    return Object.values(map);
  }, [txs, selectedShip]);

  const recent = [...txs].slice(-6).reverse();
  const alertItems = items.filter((i) => statusOf(i) !== "ok").sort((a, b) => (a.stock / (a.safety || 1)) - (b.stock / (b.safety || 1)));

  const totalOutQty = txs.filter((t) => t.type === "out").reduce((s, t) => s + Number(t.qty), 0);
  const totalInQty = txs.filter((t) => t.type === "in").reduce((s, t) => s + Number(t.qty), 0);

  return (
    <div>
      <Header title="대시보드" subtitle="실시간 재고 · 호선별 소모 현황" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
        <StatCard label="관리 품목 수" value={items.length} unit="종" icon={Package} color="#5EC8FF" />
        <StatCard label="누적 입고" value={totalInQty.toLocaleString()} unit="" icon={ArrowDownToLine} color="#35D08C" />
        <StatCard label="누적 출고" value={totalOutQty.toLocaleString()} unit="" icon={ArrowUpFromLine} color="#F5A623" />
        <StatCard label="안전재고 미달" value={items.filter((i) => statusOf(i) === "danger").length} unit="종" icon={AlertTriangle} color="#EF5350" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginBottom: 20 }}>
        <Card style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <SectionLabel>호선별 부자재 소모 현황</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#7F97AC", fontWeight: 600 }}>호선 선택:</span>
              <select
                value={selectedShip}
                onChange={(e) => setSelectedShip(e.target.value)}
                style={{
                  background: "#0B1C2C", border: "1px solid #274460", color: "#38BDF8",
                  padding: "6px 10px", borderRadius: 6, fontSize: 13, fontWeight: "bold",
                  outline: "none", cursor: "pointer"
                }}
              >
                {availableShips.map((ship) => (
                  <option key={ship} value={ship}>{ship}</option>
                ))}
              </select>
            </div>
          </div>

          {shipMaterialConsumption.length === 0 ? (
            <EmptyState icon={ScanLine} text={`[${selectedShip}] 호선에 출고된 자재 이력이 없습니다.`} color="#5E86A3" />
          ) : (
            <div>
              <div style={{ height: 200, marginBottom: 16 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={shipMaterialConsumption} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#17293B" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#7F97AC", fontSize: 11 }} axisLine={{ stroke: "#1F3B54" }} tickLine={false} />
                    <YAxis tick={{ fill: "#7F97AC", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: "#F5A62311" }}
                      contentStyle={{ background: "#0F2233", border: "1px solid #274460", borderRadius: 8, fontSize: 12 }}
                      formatter={(val, name, props) => [`${val} ${props.payload.unit}`, "소모량"]}
                    />
                    <Bar dataKey="qty" radius={[6, 6, 0, 0]}>
                      {shipMaterialConsumption.map((_, idx) => (
                        <Cell key={idx} fill={["#F5A623", "#38BDF8", "#35D08C", "#EF5350", "#A855F7"][idx % 5]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: "#0B1C2C", borderRadius: 8, padding: 10, maxHeight: 120, overflowY: "auto", border: "1px solid #1F3B54" }}>
                <div style={{ fontSize: 11, color: "#5E86A3", marginBottom: 6, fontWeight: 600 }}>사용 자재 상세 목록</div>
                {shipMaterialConsumption.map((item) => (
                  <div key={item.code} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0", borderBottom: "1px solid #16293C" }}>
                    <span style={{ color: "#E7EEF5", fontWeight: 500 }}>{item.name} <span style={{ fontSize: 10, color: "#7F97AC" }}>({item.code})</span></span>
                    <span style={{ color: "#F5A623", fontWeight: 700, fontFamily: "IBM Plex Mono" }}>{item.qty} {item.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card style={{ padding: 20 }}>
          <SectionLabel>재고부족 경보</SectionLabel>
          {alertItems.length === 0 ? (
            <EmptyState icon={CheckCircle2} text="모든 자재가 충분합니다." color="#35D08C" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 280, overflowY: "auto" }}>
              {alertItems.map((i) => {
                const st = statusOf(i);
                return (
                  <div key={i.code} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    background: "#0B1C2C", border: `1px solid ${STATUS_META[st].color}33`, borderRadius: 8,
                  }}>
                    <Led status={st} size={10} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "#E7EEF5" }}>{i.name}</div>
                      <div style={{ fontSize: 11.5, color: "#7F97AC", fontFamily: "IBM Plex Mono" }}>{i.spec}</div>
                    </div>
                    <div style={{ textAlign: "right", fontFamily: "IBM Plex Mono", fontSize: 12.5 }}>
                      <div style={{ color: STATUS_META[st].color, fontWeight: 700 }}>{i.stock}{i.unit}</div>
                      <div style={{ color: "#5E86A3", fontSize: 10.5 }}>기준 {i.safety}{i.unit}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card style={{ padding: 20 }}>
        <SectionLabel>최근 입출고 이력</SectionLabel>
        {recent.length === 0 ? (
          <EmptyState icon={ScanLine} text="입출고 이력이 아직 없습니다." color="#5E86A3" />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ minWidth: "550px" }}>
              <thead>
                <tr style={{ color: "#5E86A3", fontFamily: "IBM Plex Mono", fontSize: 11.5, textTransform: "uppercase" }}>
                  <th>구분</th><th>자재</th><th>수량</th><th>호선</th><th>공정</th><th>담당자</th><th>일시</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "IBM Plex Mono", fontSize: 11,
                        padding: "3px 8px", borderRadius: 10, fontWeight: 600,
                        color: t.type === "in" ? "#35D08C" : "#F5A623",
                        background: t.type === "in" ? "#35D08C1a" : "#F5A6231a",
                      }}>
                        {t.type === "in" ? "입고" : "출고"}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{t.itemName}</td>
                    <td style={{ fontFamily: "IBM Plex Mono", fontWeight: 600 }}>{t.qty}{t.unit}</td>
                    <td style={{ color: "#9FB4C7", fontSize: 12.5 }}>{t.shipNo || t.project || "-"}</td>
                    <td style={{ color: "#9FB4C7", fontSize: 12.5 }}>{t.process || "-"}</td>
                    <td style={{ color: "#9FB4C7", fontSize: 12.5 }}>{t.worker || "-"}</td>
                    <td style={{ color: "#5E86A3", fontFamily: "IBM Plex Mono", fontSize: 11.5 }}>{t.at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, unit, icon: Icon, color }) {
  return (
    <Card style={{ padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11.5, color: "#7F97AC", fontFamily: "IBM Plex Mono", marginBottom: 6 }}>{label}</div>
          <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 26, fontWeight: 700, color: "#E7EEF5" }}>
            {value}<span style={{ fontSize: 13, color: "#7F97AC", marginLeft: 4 }}>{unit}</span>
          </div>
        </div>
        {Icon && (
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: `${color}1f`, display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Icon size={18} color={color} />
          </div>
        )}
      </div>
    </Card>
  );
}

function EmptyState({ icon: Icon, text, color }) {
  return (
    <div style={{ padding: "28px 10px", textAlign: "center" }}>
      {Icon && <Icon size={26} color={color} style={{ marginBottom: 8, opacity: 0.85 }} />}
      <div style={{ fontSize: 12.5, color: "#7F97AC", fontFamily: "IBM Plex Mono" }}>{text}</div>
    </div>
  );
}

function Header({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h1 style={{ fontFamily: "Oswald, sans-serif", fontSize: 26, fontWeight: 700, margin: 0 }}>{title}</h1>
      <div style={{ color: "#7F97AC", fontSize: 13, marginTop: 2, fontFamily: "IBM Plex Mono" }}>{subtitle}</div>
    </div>
  );
}

/* ---------------- 입고 등록 ---------------- */
function InForm({ items, saveItems, txs, saveTxs, notify }) {
  const [code, setCode] = useState(items[0]?.code || "");
  const [qty, setQty] = useState("");
  const [worker, setWorker] = useState("");

  const item = items.find((i) => String(i.code).replace(/[\r\n]+/g, "").trim() === String(code).replace(/[\r\n]+/g, "").trim());

  const submit = async () => {
    if (!item || !qty || Number(qty) <= 0) { notify("자재와 수량을 확인해주세요.", "err"); return; }
    const nextItems = items.map((i) => String(i.code).replace(/[\r\n]+/g, "").trim() === String(code).replace(/[\r\n]+/g, "").trim() ? { ...i, stock: i.stock + Number(qty) } : i);
    const tx = { id: uid("IN"), type: "in", itemCode: code, itemName: item.name, unit: item.unit, qty: Number(qty), worker: worker || "미지정", at: nowStr() };
    await saveItems(nextItems);
    await saveTxs([...txs, tx]);
    notify(`${item.name} ${qty}${item.unit} 입고 완료 · 현재고 ${item.stock + Number(qty)}${item.unit}`, "ok");
    setQty("");
  };

  return (
    <div>
      <Header title="입고 등록" subtitle="자재 마스터 재고가 실시간으로 재계산됩니다" />
      <Card style={{ padding: 24, maxWidth: 600 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Field label="자재 검색 선택">
            <SearchableSelect items={items} value={code} onChange={setCode} />
            {item && (
              <div style={{ fontSize: 12, color: "#5E86A3", marginTop: 4, fontFamily: "IBM Plex Mono" }}>
                규격: {item.spec} | 업체: {item.manufacturer || "미지정"} | 위치: {item.location}
              </div>
            )}
          </Field>
          <Field label="입고 수량">
            <input style={inputStyle} type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={item ? `단위: ${item.unit}` : ""} />
          </Field>
          <Field label="담당자">
            <input style={inputStyle} value={worker} onChange={(e) => setWorker(e.target.value)} placeholder="이름 입력" />
          </Field>
          {item && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", background: "#0B1C2C", borderRadius: 8, fontFamily: "IBM Plex Mono", fontSize: 13 }}>
              <span style={{ color: "#7F97AC" }}>현재고 → 입고 후</span>
              <span><b style={{ color: "#9FB4C7" }}>{item.stock}{item.unit}</b> → <b style={{ color: "#35D08C" }}>{item.stock + (Number(qty) || 0)}{item.unit}</b></span>
            </div>
          )}
          <Btn onClick={submit} style={{ marginTop: 6 }}><ArrowDownToLine size={18} />입고 확정</Btn>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- 출고 (스캔) ---------------- */
function OutForm({ items, saveItems, txs, saveTxs, notify }) {
  const [scan, setScan] = useState("");
  const [found, setFound] = useState(null);
  const [shipNo, setShipNo] = useState("");
  const [project, setProject] = useState("MSBD/LVSB");
  const [process, setProcess] = useState("배전반 결선");
  const [qty, setQty] = useState("");
  const [worker, setWorker] = useState("울산에이원");
  const [isScanning, setIsScanning] = useState(false);
  const qrScannerRef = useRef(null);

  const projectOptions = ["MSBD/LVSB", "GSP", "DIST", "LGSP", "TEST", "BCD", "선박기타"];
  const processOptions = ["배전반 결선", "배전반 조립", "배전반 어렌지", "A/S"];
  const workerOptions = ["울산에이원", "부산에이원", "본사에이원", "수림기전", "생산팀"];

  const recentOutTxs = useMemo(() => {
    return txs.filter((t) => t.type === "out").slice(-5).reverse();
  }, [txs]);

  const findItemByCode = (rawCode) => {
    if (!rawCode) return null;
    const cleanScan = String(rawCode).replace(/[\r\n\t]+/g, "").trim().toLowerCase();
    const alphaNumScan = cleanScan.replace(/[^a-z0-9]/g, "");

    if (!cleanScan) return null;

    return items.find((i) => {
      if (!i) return false;
      const itemCodeVal = i.code || i.Code || i.자재코드 || i.item_code || "";
      const rawItemCode = String(itemCodeVal).replace(/[\r\n\t]+/g, "").trim().toLowerCase();
      const alphaNumItemCode = rawItemCode.replace(/[^a-z0-9]/g, "");
      const rawItemName = String(i.name || i.Name || i.품명 || "").replace(/[\r\n\t]+/g, "").trim().toLowerCase();
      const alphaNumItemName = rawItemName.replace(/[^a-z0-9]/g, "");

      return (
        rawItemCode === cleanScan || 
        (alphaNumItemCode && alphaNumItemCode === alphaNumScan) ||
        cleanScan.includes(rawItemCode) || 
        rawItemCode.includes(cleanScan) ||
        rawItemName === cleanScan || 
        (alphaNumItemName && alphaNumItemName === alphaNumScan)
      );
    });
  };

  const doScan = (val) => {
    const codeVal = val ?? scan;
    const hit = findItemByCode(codeVal);
    if (hit) { setFound(hit); notify(`자재 선택됨: ${hit.name}`, "ok"); }
    else { setFound(null); notify(`등록되지 않은 자재입니다. (인식값: ${String(codeVal).trim()})`, "err"); }
  };

  const startCamera = async () => {
    if (!window.Html5Qrcode) {
      notify("카메라 모듈을 로딩 중입니다. 잠시 후 다시 시도해주세요.", "err");
      return;
    }
    setIsScanning(true);
  };

  useEffect(() => {
    if (isScanning && window.Html5Qrcode) {
      const html5QrCode = new window.Html5Qrcode("reader");
      qrScannerRef.current = html5QrCode;

      html5QrCode.start(
        { facingMode: "environment" },
        { 
          fps: 15, 
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const qrboxSize = Math.floor(minEdge * 0.85);
            return { width: qrboxSize, height: qrboxSize };
          }
        },
        (decodedText) => {
          const hit = findItemByCode(decodedText);
          if (hit) {
            setFound(hit);
            notify(`스캔 성공: ${hit.name}`, "ok");
            html5QrCode.stop().catch(() => {});
            setIsScanning(false);
          } else {
            notify(`미등록 자재 코드: ${decodedText.replace(/[\r\n]+/g, "").trim()}`, "err");
          }
        },
        () => {}
      ).catch(() => {
        notify("카메라 접근 권한이 없거나 지원되지 않습니다.", "err");
        setIsScanning(false);
      });
    }

    return () => {
      if (qrScannerRef.current && qrScannerRef.current.isScanning) {
        qrScannerRef.current.stop().catch(() => {});
      }
    };
  }, [isScanning, items]);

  const stopCamera = () => {
    if (qrScannerRef.current && qrScannerRef.current.isScanning) {
      qrScannerRef.current.stop().then(() => setIsScanning(false)).catch(() => setIsScanning(false));
    } else {
      setIsScanning(false);
    }
  };

  const submit = async () => {
    if (!found || !qty || Number(qty) <= 0) { notify("자재를 스캔하고 수량을 입력해주세요.", "err"); return; }
    if (Number(qty) > found.stock) { notify("현재고보다 많은 수량은 출고할 수 없습니다.", "err"); return; }
    
    const nextItems = items.map((i) => String(i.code).replace(/[\r\n]+/g, "").trim() === String(found.code).replace(/[\r\n]+/g, "").trim() ? { ...i, stock: i.stock - Number(qty) } : i);
    
    const tx = {
      id: uid("OUT"),
      type: "out",
      itemCode: found.code,
      itemName: found.name,
      unit: found.unit,
      qty: Number(qty),
      shipNo: shipNo || "미입력",
      project: project,
      process: process,
      worker: worker,
      at: nowStr(),
    };

    await saveItems(nextItems);
    await saveTxs([...txs, tx]);
    const remain = found.stock - Number(qty);
    notify(`${found.name} ${qty}${found.unit} 출고 완료 · 잔여 ${remain}${found.unit}`, remain < found.safety ? "info" : "ok");
    
    setQty(""); 
    setShipNo("");
    setFound(null); 
    setScan("");
  };

  const cancelOutTx = async (targetTx) => {
    if (!window.confirm(`[${targetTx.itemName}] ${targetTx.qty}${targetTx.unit} 출고 내역을 취소하고 재고를 다시 원복하시겠습니까?`)) {
      return;
    }

    const nextItems = items.map((i) => {
      if (String(i.code).replace(/[\r\n]+/g, "").trim() === String(targetTx.itemCode).replace(/[\r\n]+/g, "").trim()) {
        return { ...i, stock: Number(i.stock) + Number(targetTx.qty) };
      }
      return i;
    });

    const nextTxs = txs.filter((t) => t.id !== targetTx.id);

    await saveItems(nextItems);
    await saveTxs(nextTxs);
    notify(`출고가 취소되어 재고 ${targetTx.qty}${targetTx.unit}가 복원되었습니다.`, "info");
  };

  const deleteHistory = async (targetTx) => {
    if (!window.confirm(`[${targetTx.itemName}] 출고 이력을 완전히 삭제하시겠습니까?`)) {
        return;
    }
    const nextTxs = txs.filter((t) => t.id !== targetTx.id);
    await saveTxs(nextTxs);
    notify("출고 이력이 삭제되었습니다.", "info");
  };

  return (
    <div>
      <Header title="출고 (QR / 바코드 스캔)" subtitle="스캔으로 빠르게 불출 처리" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        <Card style={{ padding: 22 }}>
          <SectionLabel>1. 자재 QR / 바코드 스캔</SectionLabel>
          {!isScanning ? (
            <div style={{
              border: "2px dashed #274460", borderRadius: 10, padding: "22px 16px",
              textAlign: "center", marginBottom: 16, background: "#0B1C2C",
            }}>
              <Camera size={36} color="#5E86A3" style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 13, color: "#7F97AC", fontFamily: "IBM Plex Mono", marginBottom: 14 }}>
                버튼을 누르면 스마트폰 카메라가 실행됩니다
              </div>
              <Btn onClick={startCamera} style={{ marginBottom: 16, width: "100%" }}><Camera size={18} />카메라 즉시 스캔</Btn>
              
              <div style={{ borderTop: "1px solid #1F3B54", paddingTop: 14, marginTop: 10 }}>
                <div style={{ fontSize: 11.5, color: "#5E86A3", marginBottom: 8 }}>또는 코드 수동 입력</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    value={scan}
                    onChange={(e) => setScan(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && doScan()}
                    placeholder="예: 2-BOLT-HEX10-206"
                  />
                  <Btn onClick={() => doScan()} variant="subtle"><ScanLine size={16} />검색</Btn>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: 10, background: "#0B1C2C", borderRadius: 10, textAlign: "center" }}>
              <div id="reader" style={{ width: "100%", height: 350, background: "#000", borderRadius: 8, overflow: "hidden" }} />
              <Btn onClick={stopCamera} variant="ghost" style={{ marginTop: 12, width: "100%" }}>
                카메라 끄기
              </Btn>
            </div>
          )}
        </Card>

        <Card style={{ padding: 22 }}>
          <SectionLabel>2. 불출 정보 입력</SectionLabel>
          {!found ? (
            <EmptyState icon={ScanLine} text="먼저 자재를 스캔하거나 입력해주세요." color="#5E86A3" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, background: "#0B1C2C", borderRadius: 8, border: "1px solid #274460" }}>
                <Led status={statusOf(found)} size={12} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#38BDF8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {found.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: "#7F97AC", fontFamily: "IBM Plex Mono", marginTop: 2 }}>
                    코드: {found.code} | {found.manufacturer || "업체 미지정"}
                  </div>
                </div>
                <div style={{ textAlign: "right", fontFamily: "IBM Plex Mono", paddingLeft: 8, borderLeft: "1px solid #1F3B54" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: found.stock > 0 ? "#35D08C" : "#EF5350" }}>
                    {found.stock} <span style={{ fontSize: 12 }}>{found.unit}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "#5E86A3" }}>현재고</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="1. 호선">
                  <input style={inputStyle} value={shipNo} onChange={(e) => setShipNo(e.target.value)} placeholder="예: H-2024" />
                </Field>
                <Field label="2. 프로젝트">
                  <Select value={project} onChange={(e) => setProject(e.target.value)} options={projectOptions} />
                </Field>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="3. 공정구분">
                  <Select value={process} onChange={(e) => setProcess(e.target.value)} options={processOptions} />
                </Field>
                <Field label={`4. 불출수량 (${found.unit})`}>
                  <input 
                    style={{ ...inputStyle, fontWeight: "bold", color: "#F5A623" }} 
                    type="number" min="1" max={found.stock} value={qty} 
                    onChange={(e) => setQty(e.target.value)} placeholder="수량 입력"
                  />
                </Field>
              </div>

              <Field label="5. 불출자">
                <Select value={worker} onChange={(e) => setWorker(e.target.value)} options={workerOptions} />
              </Field>

              <Btn 
                onClick={submit} 
                disabled={!qty || Number(qty) <= 0 || Number(qty) > found.stock} 
                style={{ 
                  marginTop: 8, width: "100%", 
                  background: (!qty || Number(qty) <= 0 || Number(qty) > found.stock) ? "#1F3B54" : "#F5A623",
                  color: (!qty || Number(qty) <= 0 || Number(qty) > found.stock) ? "#5E86A3" : "#0A1622",
                  fontWeight: "bold", fontSize: 15
                }}
              >
                <ArrowUpFromLine size={18} />출고 확정
              </Btn>
            </div>
          )}
        </Card>
      </div>

      <Card style={{ padding: 16, marginTop: 20 }}>
        <SectionLabel>최근 등록된 출고 이력 (잘못 등록 시 삭제/원복)</SectionLabel>
        {recentOutTxs.length === 0 ? (
          <EmptyState icon={ScanLine} text="최근 등록된 출고 내역이 없습니다." color="#5E86A3" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
            {recentOutTxs.map((t) => (
              <div
                key={t.id}
                style={{
                  background: "#0B1C2C", border: "1px solid #1F3B54", borderRadius: 8,
                  padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
                }}
              >
                {/* 상단 타이틀 및 날짜 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#38BDF8" }}>{t.itemName}</div>
                    <div style={{ fontSize: 11, color: "#7F97AC", fontFamily: "IBM Plex Mono", marginTop: 2 }}>{t.at}</div>
                  </div>
                </div>

                {/* 중간 상세 정보 그리드 */}
                <div style={{ 
                  display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, 
                  paddingTop: 8, borderTop: "1px solid #14283A", fontSize: 12 
                }}>
                  <div>
                    <span style={{ color: "#5E86A3", fontSize: 11, display: "block" }}>수량</span>
                    <span style={{ fontFamily: "IBM Plex Mono", fontWeight: 700, color: "#F5A623" }}>{t.qty} {t.unit}</span>
                  </div>
                  <div>
                    <span style={{ color: "#5E86A3", fontSize: 11, display: "block" }}>호선</span>
                    <span style={{ color: "#9FB4C7" }}>{t.shipNo || "-"}</span>
                  </div>
                  <div>
                    <span style={{ color: "#5E86A3", fontSize: 11, display: "block" }}>불출자</span>
                    <span style={{ color: "#9FB4C7" }}>{t.worker || "-"}</span>
                  </div>
                </div>

                {/* 하단 버튼 (PC/모바일 동일하게 정렬된 원복 및 삭제 버튼) */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4, borderTop: "1px solid #14283A" }}>
                  <button
                    onClick={() => cancelOutTx(t)}
                    style={{ background: "#123626", border: "1px solid #2ECC71", color: "#2ECC71", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                  >
                    원복
                  </button>
                  <button
                    onClick={() => deleteHistory(t)}
                    style={{ background: "#3A1C1C", border: "1px solid #EF5350", color: "#EF5350", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------------- 재고 조회 ---------------- */
function StockView({ items }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchSearch =
        !search ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.code.toLowerCase().includes(search.toLowerCase()) ||
        (item.manufacturer && item.manufacturer.toLowerCase().includes(search.toLowerCase()));

      const st = statusOf(item);
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "normal" && st === "normal") ||
        (statusFilter === "warning" && st === "warning") ||
        (statusFilter === "danger" && st === "danger");

      return matchSearch && matchStatus;
    });
  }, [items, search, statusFilter]);

  return (
    <div>
      <Header title="재고 현황 조회" subtitle="전체 자재 실시간 재고 및 안전재고 파악" />

      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="자재명, 코드, 제조사 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <Btn variant="subtle" onClick={() => setSearch("")}>초기화</Btn>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
            {[
              { id: "all", label: "전체" },
              { id: "normal", label: "정상" },
              { id: "warning", label: "부족위험" },
              { id: "danger", label: "품절" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                style={{
                  padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: "bold",
                  border: statusFilter === f.id ? "1px solid #38BDF8" : "1px solid #1F3B54",
                  background: statusFilter === f.id ? "#1E3A5F" : "#0B1C2C",
                  color: statusFilter === f.id ? "#38BDF8" : "#7F97AC",
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {filteredItems.length === 0 ? (
        <Card style={{ padding: 20 }}>
          <EmptyState icon={Package} text="검색 결과가 없습니다." color="#5E86A3" />
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredItems.map((item) => {
            const st = statusOf(item);
            return (
              <Card key={item.code} style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Led status={st} size={10} />
                      <span style={{ fontWeight: 700, fontSize: 14, color: "#38BDF8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.name}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "#7F97AC", fontFamily: "IBM Plex Mono" }}>코드: {item.code}</div>
                    {item.manufacturer && (
                      <div style={{ fontSize: 11, color: "#5E86A3", marginTop: 2 }}>제조사: {item.manufacturer}</div>
                    )}
                  </div>

                  <div style={{ textAlign: "right", fontFamily: "IBM Plex Mono", flexShrink: 0 }}>
                    <div style={{
                      fontSize: 16, fontWeight: 700,
                      color: st === "danger" ? "#EF5350" : st === "warning" ? "#F5A623" : "#35D08C",
                    }}>
                      {item.stock} <span style={{ fontSize: 11 }}>{item.unit}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "#5E86A3", marginTop: 2 }}>안전재고: {item.safety} {item.unit}</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- 자재 마스터 관리 ---------------- */
function MasterView({ items, saveItems, notify }) {
  const blank = { code: "", name: "", spec: "", unit: "EA", stock: 0, safety: 0, location: "", manufacturer: "", category: "" };
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);
  const [qrModalItem, setQrModalItem] = useState(null);
  const [masterQRInput, setMasterQRInput] = useState("");

  const addItem = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      notify("자재코드와 품명은 필수 입력 항목입니다.", "err");
      return;
    }

    const exists = items.some((i) => i.code.trim() === form.code.trim());
    if (exists) {
      notify("이미 존재하는 자재 코드입니다.", "err");
      return;
    }

    const newItem = {
      ...form,
      stock: Number(form.stock) || 0,
      safety: Number(form.safety) || 0,
      deleted: false,
    };

    const nextItems = [newItem, ...items];
    await saveItems(nextItems);
    notify(`[${newItem.name}] 자재가 성공적으로 등록되었습니다.`, "ok");
    setForm(blank);
    setShowForm(false);
  };

  const removeItem = async (code) => {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;

    if (supabase) {
      const { error } = await supabase
        .from("items")
        .update({ deleted: true, deleted_at: new Date().toISOString() })
        .eq("code", code);

      if (error) {
        notify("삭제 실패", "err");
        return;
      }
    }

    const updated = items.filter((i) => i.code !== code);
    await saveItems(updated);
    notify("삭제되었습니다.", "ok");
  };

  const exportCSV = () => {
    const headers = ["code,name,spec,category,unit,stock,safety,location,manufacturer\n"];
    const rows = items.map(i => `"${i.code}","${i.name}","${i.spec}","${i.category || ""}","${i.unit}",${i.stock},${i.safety},"${i.location || ""}","${i.manufacturer || ""}"\n`);
    const blob = new Blob(["\uFEFF" + headers + rows.join("")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `MRO_자재마스터_${nowStr().split(" ")[0]}.csv`;
    link.click();
    notify("자재 데이터가 엑셀(CSV)로 다운로드 되었습니다.", "ok");
  };

  const importExcelFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    if (window.XLSX) {
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = window.XLSX.read(data, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawData = window.XLSX.utils.sheet_to_json(worksheet, { defval: "" });

          const parsed = rawData.map(row => {
            const getCol = (...keys) => {
              for (let k of keys) {
                const foundKey = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.toLowerCase());
                if (foundKey && row[foundKey] !== undefined) return String(row[foundKey]).trim();
              }
              return "";
            };

            const code = getCol('코드', 'code', '자재코드');
            const fullName = getCol('품명 / 규격', '품명/규격', '품명', 'name');
            const spec = getCol('규격', 'spec');
            const manufacturer = getCol('생산업체', '제조사', 'manufacturer');
            const unit = getCol('단위', 'unit') || 'EA';
            const stock = Number(getCol('현재고', '재고', 'stock')) || 0;
            const safety = Number(getCol('안전재고', '안전재고기준', 'safety')) || 0;
            const location = getCol('위치', 'location');

            if (!code && !fullName) return null;

            return {
              code: code || uid("ITEM"),
              name: fullName || "미지정 품명",
              spec: spec || "",
              category: "",
              unit: unit,
              stock: stock,
              safety: safety,
              location: location,
              manufacturer: manufacturer,
              deleted: false,
            };
          }).filter(Boolean);

          if (parsed.length > 0) {
            saveItems(parsed);
            notify(`총 ${parsed.length}개의 자재 목록을 성공적으로 불러왔습니다!`, "ok");
          } else {
            notify("엑셀 파일에서 유효한 자재 데이터를 찾을 수 없습니다.", "err");
          }
        } catch (err) {
          console.error(err);
          notify("엑셀 파일을 처리하는 중 오류가 발생했습니다.", "err");
        } finally {
          e.target.value = "";
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleMasterQRKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const rawVal = e.target.value;
      if (!rawVal) return;
      const cleanQuery = rawVal.trim().replace(/[\r\n]+/g, "").toLowerCase();

      const matched = items.find(i => {
        const cCode = String(i.code).replace(/[\r\n]+/g, "").trim().toLowerCase();
        return cCode === cleanQuery || cleanQuery.includes(cCode);
      });

      if (matched) {
        notify(`[QR 스캔 성공] ${matched.name} (${matched.code})`, "ok");
        setQrModalItem(matched);
      } else {
        notify(`[미등록 자재] "${cleanQuery}" 코드를 찾을 수 없습니다.`, "err");
      }
      setMasterQRInput("");
    }
  };

  return (
    <div>
      <Header title="자재 마스터" subtitle="신규 자재 등록 · QR 생성 · 엑셀/CSV 백업 및 복원" />

      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={() => setShowForm((s) => !s)} variant={showForm ? "ghost" : "primary"}>
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? "취소" : "신규 자재 등록"}
          </Btn>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={exportCSV} variant="subtle"><Download size={15} />엑셀 백업 다운로드</Btn>
          <label style={{ display: "inline-block" }}>
            <input type="file" accept=".xlsx, .xls, .csv" onChange={importExcelFile} style={{ display: "none" }} />
            <span style={{
              background: "#16324A", color: "#C9DAE8", border: "1px solid #274460",
              fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 13.5,
              padding: "10px 16px", borderRadius: 8, cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center"
            }}>
              <Upload size={15} />엑셀/CSV 불러오기
            </span>
          </label>
        </div>
      </div>

      <div style={{
        background: "#111c38", border: "1px solid #1e293b", padding: "16px 20px",
        borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 16, flexWrap: "wrap"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "1.05rem", fontWeight: 600, color: "#38bdf8", fontFamily: "'IBM Plex Mono', monospace" }}>
          <QrCode size={22} />
          <span>QR 스캔 / 코드 입력:</span>
        </div>
        <input 
          type="text" 
          value={masterQRInput}
          onChange={(e) => setMasterQRInput(e.target.value)}
          onKeyDown={handleMasterQRKeyDown}
          placeholder="스캐너로 QR을 스캔하세요..." 
          style={{
            flex: 1, minWidth: 200, height: 48, fontSize: "1.1rem", fontWeight: "bold",
            padding: "0 16px", border: "2px solid #38bdf8", borderRadius: 8,
            backgroundColor: "#0b1329", color: "#ffffff", outline: "none",
            fontFamily: "'IBM Plex Mono', monospace"
          }}
          autoComplete="off"
        />
      </div>

      {showForm && (
        <Card style={{ padding: 22, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            <Field label="자재코드 *"><input style={inputStyle} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="예: CG-M32-BR" /></Field>
            <Field label="품명 *"><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 케이블 글랜드" /></Field>
            <Field label="규격"><input style={inputStyle} value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder="예: Brass Gland M32" /></Field>
            <Field label="생산업체 (제조사)"><input style={inputStyle} value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} placeholder="예: 동아베스텍" /></Field>
            <Field label="카테고리"><input style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="예: 글랜드" /></Field>
            <Field label="단위">
              <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} options={["EA", "m", "kg", "roll", "set"]} />
            </Field>
            <Field label="초기 재고"><input style={inputStyle} type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
            <Field label="안전재고 기준"><input style={inputStyle} type="number" value={form.safety} onChange={(e) => setForm({ ...form, safety: e.target.value })} /></Field>
            <Field label="저장 위치"><input style={inputStyle} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="예: A-03" /></Field>
          </div>
          <div style={{ marginTop: 16 }}>
            <Btn onClick={addItem}><Plus size={16} />등록 완료</Btn>
          </div>
        </Card>
      )}

      <Card style={{ padding: 8 }}>
        <div style={{ maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
          <table>
            <thead style={{ position: "sticky", top: 0, background: "#0F2233", zIndex: 1 }}>
              <tr style={{ color: "#5E86A3", fontFamily: "IBM Plex Mono", fontSize: 11.5, textTransform: "uppercase" }}>
                <th>코드</th><th>품명 / 규격</th><th>생산업체</th><th>단위</th><th>현재고</th><th>안전재고</th><th>위치</th><th>QR</th><th>삭제</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const st = statusOf(i);
                return (
                <tr key={i.code}>
                  <td style={{ fontFamily: "IBM Plex Mono", color: "#9FB4C7", fontWeight: 600 }}>{i.code}</td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{i.name}</div>
                    {i.spec && <div style={{ fontSize: 11.5, color: "#7F97AC", fontFamily: "IBM Plex Mono" }}>{i.spec}</div>}
                  </td>
                  <td style={{ color: "#9FB4C7", fontSize: 12.5 }}>{i.manufacturer || "-"}</td>
                  <td style={{ fontFamily: "IBM Plex Mono", color: "#9FB4C7" }}>{i.unit}</td>
                  <td style={{ fontFamily: "IBM Plex Mono", fontWeight: 600, fontSize: 13.5, color: st === "danger" ? "#EF5350" : st === "warn" ? "#F5A623" : "#E7EEF5" }}>{i.stock}</td>
                  <td style={{ fontFamily: "IBM Plex Mono", color: "#7F97AC", fontSize: 13 }}>{i.safety}</td>
                  <td style={{ fontFamily: "IBM Plex Mono", color: "#9FB4C7" }}>{i.location || "-"}</td>
                  <td>
                    <button
                      onClick={() => setQrModalItem(i)}
                      style={{ background: "#16324A", border: "1px solid #274460", color: "#F5A623", padding: "5px 8px", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, fontFamily: "IBM Plex Mono" }}
                    >
                      <QrCode size={13} /> QR
                    </button>
                  </td>
                  <td>
                    <button onClick={() => removeItem(i.code)} style={{ background: "none", border: "none", color: "#EF5350", cursor: "pointer", padding: 4 }}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: 30, color: "#7F97AC" }}>
                    등록된 자재가 없습니다. '신규 자재 등록' 또는 '엑셀/CSV 불러오기'를 진행하세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {qrModalItem && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20,
        }}>
          <div style={{ background: "#0F2233", border: "1px solid #274460", borderRadius: 12, padding: 22, textAlign: "center", maxWidth: 280, width: "100%" }}>
            <h3 style={{ margin: "0 0 6px 0", fontSize: 15, color: "#E7EEF5" }}>{qrModalItem.name}</h3>
            <div style={{ fontSize: 11.5, color: "#7F97AC", marginBottom: 14, fontFamily: "IBM Plex Mono" }}>{qrModalItem.code}</div>
            
            <div style={{ background: "#FFF", padding: 12, borderRadius: 8, display: "inline-block" }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrModalItem.code)}`}
                alt="QR Code"
                style={{ width: 160, height: 160, display: "block" }}
              />
            </div>

            <div style={{ marginTop: 18 }}>
              <Btn onClick={() => setQrModalItem(null)} variant="ghost" style={{ padding: "8px 16px", fontSize: 13 }}>닫기</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TrashView({ items, saveItems, notify }) {
  const [trashItems, setTrashItems] = useState([]);

  useEffect(() => {
    loadTrash();
  }, []);

  async function loadTrash() {
    if (!supabase) return;

    const { data } = await supabase
      .from("items")
      .select("*")
      .eq("deleted", true)
      .order("deleted_at", { ascending: false });

    setTrashItems(data || []);
  }

  const restoreItem = async (code) => {
    const { error } = await supabase
      .from("items")
      .update({ deleted: false, deleted_at: null })
      .eq("code", code);

    if (error) {
      notify("복원 실패", "err");
      return;
    }

    notify("복원되었습니다.", "ok");
    loadTrash();

    const { data } = await supabase
      .from("items")
      .select("*")
      .eq("deleted", false);

    saveItems(data || []);
  };

  const deleteForever = async (code) => {
    if (!window.confirm("영구 삭제하시겠습니까?")) return;

    const { error } = await supabase
      .from("items")
      .delete()
      .eq("code", code);

    if (error) {
      notify("삭제 실패", "err");
      return;
    }

    notify("영구삭제 완료", "ok");
    loadTrash();

    const { data } = await supabase
      .from("items")
      .select("*")
      .eq("deleted", false);

    saveItems(data || []);
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>🗑 삭제 복원</h2>

      {trashItems.length === 0 ? (
        <div style={{ opacity: 0.6 }}>휴지통이 비어 있습니다.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>코드</th>
              <th>품명</th>
              <th>삭제일</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {trashItems.map(item => (
              <tr key={item.code}>
                <td>{item.code}</td>
                <td>{item.name}</td>
                <td>
                  {item.deleted_at ? new Date(item.deleted_at).toLocaleString() : ""}
                </td>
                <td>
                  <Btn onClick={() => restoreItem(item.code)}>복원</Btn>
                  <Btn variant="danger" onClick={() => deleteForever(item.code)} style={{ marginLeft: 8 }}>영구삭제</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}