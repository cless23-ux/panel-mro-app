import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Package, ArrowDownToLine, ArrowUpFromLine, LayoutGrid, Boxes, ScanLine,
  AlertTriangle, CheckCircle2, Search, Plus, X, Zap, Trash2, Download, Upload, QrCode, Camera, Settings as SettingsIcon, Image as ImageIcon, Star, Copy, ShoppingCart, Check, RotateCcw, MessageCircle, Save
} from "lucide-react";
import { supabase } from './supabaseClient';

/* ---------------- 폰트 및 초기 데이터 ---------------- */
const FONT_LINK =
"Rajdhani:wght@500;600;700|Oswald:wght@500;600;700|IBM+Plex+Mono:wght@400;500;600|Inter:wght@400;500;600;700";

const seedItems = [
  { code: "BB-C1100-T3", name: "부스바 (동바)", spec: "C1100 T3 x 20mm", unit: "m", stock: 62, safety: 50, location: "A-01", manufacturer: "대한전선", category: "부스바", memo: "", image_url: "" },
  { code: "RT-2.5SQ", name: "압착단자", spec: "Ring Terminal 2.5 sq", unit: "EA", stock: 840, safety: 1000, location: "B-04", manufacturer: "KEC", category: "압착단자", memo: "", image_url: "" },
  { code: "CG-M20-BR", name: "케이블 글랜드", spec: "Brass Gland M20", unit: "EA", stock: 260, safety: 200, location: "B-07", manufacturer: "동아베스텍", category: "케이블 글랜드", memo: "", image_url: "" },
];

function uid(p = "T") {
  return `${p}-${Date.now().toString(36)}${Math.floor(Math.random() * 900 + 100)}`;
}
function csvSafe(val) {
  const s = String(val ?? "");
  if (/^[=+\-@\t\r]/.test(s)) {
    return `'${s}`;
  }
  return s;
}
function nowStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function timeAgoStr(isoOrDate) {
  if (!isoOrDate) return "";
  const t = new Date(isoOrDate).getTime();
  if (Number.isNaN(t)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 60) return "방금 전";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.floor(diffHour / 24)}일 전`;
}

/* ---------------- 이미지 압축 및 Supabase 업로드 유틸 ---------------- */
async function compressAndUploadImage(file, itemCode) {
  if (!supabase) throw new Error("Supabase 클라이언트가 설정되지 않았습니다.");

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 600;
        let scale = 1;
        if (img.width > MAX_WIDTH) {
          scale = MAX_WIDTH / img.width;
        }
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          async (blob) => {
            if (!blob) {
              reject(new Error("이미지 압축 실패"));
              return;
            }

            try {
              const fileExt = "jpg";
              const safeCode = String(itemCode || "item").replace(/[^a-zA-Z0-9_-]/g, "_");
              const fileName = `${safeCode}_${Date.now()}.${fileExt}`;
              const filePath = `items/${fileName}`;

              const { data, error } = await supabase.storage
                .from("items-images")
                .upload(filePath, blob, {
                  contentType: "image/jpeg",
                  upsert: true,
                });

              if (error) {
                console.error("Storage upload error:", error);
                reject(error);
                return;
              }

              const { data: publicUrlData } = supabase.storage
                .from("items-images")
                .getPublicUrl(filePath);

              resolve(publicUrlData.publicUrl);
            } catch (err) {
              reject(err);
            }
          },
          "image/jpeg",
          0.6
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
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
        if (!error && data) {
          if (tableName === "transactions") {
            setValue(prev => {
              const map = new Map();
              [...prev, ...data].forEach(item => {
                if (item && item.id) map.set(item.id, item);
              });
              const merged = Array.from(map.values());
              localStorage.setItem(key, JSON.stringify(merged));
              return merged;
            });
          } else {
            setValue(data);
            localStorage.setItem(key, JSON.stringify(data));
          }
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

/* ---------------- 긴급자재발주요청 Hook ---------------- */
const URGENT_REQUESTS_CACHE_KEY = "panel:urgentRequests";

function useUrgentRequests() {
  const [requests, setRequests] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from("urgent_requests")
          .select("*")
          .order("created_at", { ascending: false });
        if (!error && data) {
          setRequests(data);
          localStorage.setItem(URGENT_REQUESTS_CACHE_KEY, JSON.stringify(data));
          if (!silent) setLoaded(true);
          return;
        }
      }
      const cached = localStorage.getItem(URGENT_REQUESTS_CACHE_KEY);
      if (cached) setRequests(JSON.parse(cached));
    } catch (e) {
      console.error("Urgent requests load error:", e);
    } finally {
      if (!silent) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const addRequest = useCallback(async ({ itemCode, itemName, requester, shipNo, project, note }) => {
    const newReq = {
      id: uid("URG"),
      item_code: itemCode,
      item_name: itemName,
      requester: requester || "미입력",
      ship_no: shipNo || "",
      project: project || "",
      note: note || "",
      status: "pending",
      created_at: new Date().toISOString(),
      resolved_at: null,
    };

    try {
      if (supabase) {
        const { error } = await supabase.from("urgent_requests").insert(newReq);
        if (error) {
          console.error("Supabase insert error:", error);
          throw error;
        }
      }

      setRequests((prev) => {
        const next = [newReq, ...prev];
        localStorage.setItem(URGENT_REQUESTS_CACHE_KEY, JSON.stringify(next));
        return next;
      });
    } catch (e) {
      console.error("Urgent request save error:", e);
      alert("긴급 발주 저장 중 오류가 발생했습니다. Supabase 테이블 컬럼(ship_no, project)을 확인해 주세요.");
    }
    return newReq;
  }, []);

  const resolveRequest = useCallback(async (id) => {
    const resolvedAt = new Date().toISOString();
    setRequests((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, status: "resolved", resolved_at: resolvedAt } : r));
      localStorage.setItem(URGENT_REQUESTS_CACHE_KEY, JSON.stringify(next));
      return next;
    });
    try {
      if (supabase) {
        await supabase.from("urgent_requests").update({ status: "resolved", resolved_at: resolvedAt }).eq("id", id);
      }
    } catch (e) {
      console.error("Urgent request resolve error:", e);
    }
  }, []);

  return { requests, loaded, addRequest, resolveRequest, reload: load };
}
const OUT_FORM_SETTINGS_ROW_ID = 1;
const DEFAULT_OUT_FORM_SETTINGS = {
  ships: [],
  projects: ["MSBD/LVSB", "GSP", "DIST", "LGSP", "TEST", "BCD", "선박기타"],
  processes: ["배전반 결선", "배전반 조립", "배전반 어렌지", "A/S"],
  workers: ["울산에이원", "부산에이원", "본사에이원", "수림기전", "생산팀"],
};
const OUT_FORM_SETTINGS_CACHE_KEY = "panel:outFormSettings";

/* ---------------- 즐겨찾기 자재 (기기 로컬 전용, 서버 미동기화) ---------------- */
const FAVORITE_ITEMS_KEY = "panel:favoriteItemCodes";
const FAVORITE_ITEMS_LIMIT = 15;

function readFavoriteCodes() {
  try {
    const raw = localStorage.getItem(FAVORITE_ITEMS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function useFavoriteItems(notify) {
  const [favoriteCodes, setFavoriteCodes] = useState(readFavoriteCodes);

  const isFavorite = useCallback((code) => favoriteCodes.includes(String(code).trim()), [favoriteCodes]);

  const toggleFavorite = useCallback((code) => {
    const cleanCode = String(code).trim();
    setFavoriteCodes((prev) => {
      const exists = prev.includes(cleanCode);
      let next;
      if (exists) {
        next = prev.filter((c) => c !== cleanCode);
      } else {
        if (prev.length >= FAVORITE_ITEMS_LIMIT) {
          if (notify) notify(`즐겨찾기는 최대 ${FAVORITE_ITEMS_LIMIT}개까지 등록할 수 있어요.`, "err");
          return prev;
        }
        next = [...prev, cleanCode];
      }
      try { localStorage.setItem(FAVORITE_ITEMS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [notify]);

  return { favoriteCodes, isFavorite, toggleFavorite };
}

function useOutFormSettings() {
  const [settings, setSettings] = useState(DEFAULT_OUT_FORM_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from("out_form_settings")
          .select("*")
          .eq("id", OUT_FORM_SETTINGS_ROW_ID)
          .maybeSingle();
        if (!error && data) {
          const next = {
            ships: Array.isArray(data.ships) ? data.ships : DEFAULT_OUT_FORM_SETTINGS.ships,
            projects: Array.isArray(data.projects) && data.projects.length ? data.projects : DEFAULT_OUT_FORM_SETTINGS.projects,
            processes: Array.isArray(data.processes) && data.processes.length ? data.processes : DEFAULT_OUT_FORM_SETTINGS.processes,
            workers: Array.isArray(data.workers) && data.workers.length ? data.workers : DEFAULT_OUT_FORM_SETTINGS.workers,
          };
          setSettings(next);
          localStorage.setItem(OUT_FORM_SETTINGS_CACHE_KEY, JSON.stringify(next));
          if (!silent) setLoaded(true);
          return;
        }
      }
      const cached = localStorage.getItem(OUT_FORM_SETTINGS_CACHE_KEY);
      if (cached) setSettings(JSON.parse(cached));
    } catch (e) {
      console.error("Out form settings load error:", e);
    }  finally {
      if (!silent) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const saveCategory = useCallback(async (category, nextList) => {
    setSettings((prev) => {
      const next = { ...prev, [category]: nextList };
      localStorage.setItem(OUT_FORM_SETTINGS_CACHE_KEY, JSON.stringify(next));
      return next;
    });
    try {
      if (supabase) {
        await supabase
          .from("out_form_settings")
          .upsert({ id: OUT_FORM_SETTINGS_ROW_ID, [category]: nextList }, { onConflict: "id" });
      }
    } catch (e) {
      console.error("Out form settings save error:", e);
    }
  }, []);

  return [settings, saveCategory, loaded];
}

function statusOf(item) {
  const safety = Number(item.safety) || 0;
  const stock = Number(item.stock) || 0;
  if (stock < safety * 0.2) return "danger";
  if (stock < safety * 0.5) return "warn";
  return "ok";
}

/* ---------------- 원자재 / 부자재 구분 (자재코드 접두사 기준) ---------------- */
/* 원자재: 코드가 "1"로 시작 (예: 1-CG-M20-BR) / 부자재: 코드가 "2"로 시작 (예: 2-CG-M20-BR) */
function getMaterialType(code) {
  const c = String(code || "").trim();
  if (c.startsWith("1")) return "raw";
  if (c.startsWith("2")) return "sub";
  return "etc";
}
const MATERIAL_TYPE_META = {
  raw: { label: "원자재", color: "#38BDF8" },
  sub: { label: "부자재", color: "#A78BFA" },
  etc: { label: "미분류", color: "#7F97AC" },
};
function isRawMaterial(code) {
  return getMaterialType(code) === "raw";
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

const Card = React.forwardRef(function Card({ children, style, className = "", onClick, neon }, ref) {
  const neonStyle = neon
    ? {
        border: `1px solid ${neon}70`,
        boxShadow: `0 0 0 1px ${neon}22, 0 0 20px -9px ${neon}80, inset 0 0 26px -22px ${neon}`,
      }
    : null;
  return (
    <div
      ref={ref}
      className={className}
      onClick={onClick}
      style={{
        background: "linear-gradient(180deg, #122A3F 0%, #0F2233 100%)",
        border: "1px solid #1F3B54",
        borderRadius: 12,
        ...neonStyle,
        ...style,
      }}
    >
      {children}
    </div>
  );
});

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

/* ---------------- 전체 입고/출고 상세 기록 모달 ---------------- */
function TxHistoryModal({ type, txs, onClose, showDeleted = false }) {
  const [search, setSearch] = useState("");
  const isOut = type === "out";
  const isReturn = type === "return";

  const list = useMemo(() => {
    const filtered = (txs || []).filter((t) => t.type === type && (showDeleted || t.deleted !== true));
    const q = search.trim().toLowerCase();
    const searched = q
      ? filtered.filter((t) =>
          String(t.itemName || "").toLowerCase().includes(q) ||
          String(t.itemCode || "").toLowerCase().includes(q) ||
          String(t.worker || "").toLowerCase().includes(q) ||
          String(t.shipNo || "").toLowerCase().includes(q)
        )
      : filtered;
    return [...searched].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }, [txs, type, search, showDeleted]);

  const totalQty = useMemo(() => list.reduce((s, t) => s + (Number(t.qty) || 0), 0), [list]);

  const exportCSV = () => {
    const headers = isOut
      ? ["날짜,자재명,코드,수량,단위,호선,프로젝트,공정구분,불출자\n"]
      : ["날짜,자재명,코드,수량,단위,담당자\n"];
    const rows = list.map((t) => {
      if (isOut) {
        return `"${t.at}","${csvSafe(t.itemName)}","${csvSafe(t.itemCode)}",${t.qty},"${t.unit}","${csvSafe(t.shipNo)}","${csvSafe(t.project)}","${csvSafe(t.process)}","${csvSafe(t.worker)}"\n`;
      }
      return `"${t.at}","${csvSafe(t.itemName)}","${csvSafe(t.itemCode)}",${t.qty},"${t.unit}","${csvSafe(t.worker)}"\n`;
    });
    const blob = new Blob(["\uFEFF" + headers + rows.join("")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `MRO_${isOut ? "출고" : "입고"}기록_${nowStr().split(" ")[0]}.csv`;
    link.click();
  };

  return (
    <div
      onClick={onClose}
      className="app-modal-overlay"
      style={{
        position: "fixed", inset: 0, background: "rgba(6,14,22,0.78)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 900, maxHeight: "85vh", display: "flex", flexDirection: "column",
          background: "#0F2233", border: "1px solid #274460", borderRadius: 14, padding: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: isOut ? "#F5A623" : "#35D08C" }}>
              {isOut ? "전체 출고 상세기록" : "전체 입고 상세기록"}
            </div>
            <div style={{ fontSize: 11.5, color: "#7F97AC", fontFamily: "IBM Plex Mono", marginTop: 2 }}>
              총 {list.length}건 · 합계 {totalQty.toLocaleString()}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={exportCSV}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8,
                border: "1px solid #35D08C88", background: "#35D08C1f", color: "#35D08C",
                fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              <Download size={14} />엑셀 다운로드
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              style={{
                background: "none", border: "none", cursor: "pointer", color: "#7F97AC",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 6,
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <input
          style={{ ...inputStyle, marginBottom: 12 }}
          placeholder="자재명, 코드, 담당자, 호선으로 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div style={{ flex: 1, overflowY: "auto", border: "1px solid #1F3B54", borderRadius: 8 }}>
          {list.length === 0 ? (
            <EmptyState icon={isOut ? ArrowUpFromLine : ArrowDownToLine} text="해당하는 기록이 없습니다." color="#5E86A3" />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ position: "sticky", top: 0, background: "#0B1C2C" }}>
                  <th style={thStyle}>날짜</th>
                  <th style={thStyle}>자재명</th>
                  <th style={thStyle}>코드</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>수량</th>
                  {isOut ? (
                    <>
                      <th style={thStyle}>호선</th>
                      <th style={thStyle}>프로젝트</th>
                      <th style={thStyle}>불출자</th>
                    </>
                  ) : (
                    <th style={thStyle}>담당자</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id} style={{ borderTop: "1px solid #14283A" }}>
                    <td style={{ ...tdStyle, color: "#7F97AC", fontFamily: "IBM Plex Mono", fontSize: 11 }}>{t.at}</td>
                    <td style={{ ...tdStyle, color: "#38BDF8", fontWeight: 600 }}>{t.itemName}</td>
                    <td style={{ ...tdStyle, color: "#7F97AC", fontFamily: "IBM Plex Mono", fontSize: 11 }}>{t.itemCode}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 700, color: isOut ? "#F5A623" : "#35D08C" }}>
                      {t.qty} {t.unit}
                    </td>
                    {isOut ? (
                      <>
                        <td style={{ ...tdStyle, color: "#9FB4C7" }}>{t.shipNo || "-"}</td>
                        <td style={{ ...tdStyle, color: "#9FB4C7" }}>{t.project || "-"}</td>
                        <td style={{ ...tdStyle, color: "#9FB4C7" }}>{t.worker || "-"}</td>
                      </>
                    ) : (
                      <td style={{ ...tdStyle, color: "#9FB4C7" }}>{t.worker || "-"}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
const thStyle = { textAlign: "left", padding: "8px 10px", color: "#5E86A3", fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap" };
const tdStyle = { padding: "8px 10px", whiteSpace: "nowrap" };

const inputStyle = {
  background: "#0B1C2C", border: "1px solid #26445F", borderRadius: 8, color: "#E7EEF5",
  padding: "12px 14px", fontSize: 14, fontFamily: "'IBM Plex Mono', monospace", outline: "none", width: "100%",
};

/* ---------------- 동시사용 재고 원자적 처리 ---------------- */
async function applyStockTransactionsAtomic(operations) {
  if (!supabase) throw new Error("Supabase가 연결되어 있지 않습니다.");
  const { data, error } = await supabase.rpc("mro_apply_stock_transactions", {
    p_operations: operations,
  });
  if (error) throw error;
  return data;
}

/* ---------------- 긴급 발주 요청 버튼 + 모달 ---------------- */
const LAST_REQUESTER_KEY = "panel:lastRequester";

function UrgentRequestButton({ item, requests, addRequest, notify, size = "normal" }) {
  const [open, setOpen] = useState(false);
  const [requester, setRequester] = useState(() => {
    try { return localStorage.getItem(LAST_REQUESTER_KEY) || ""; } catch { return ""; }
  });
  const [shipNo, setShipNo] = useState("");
  const [project, setProject] = useState("MSBD/LVSB");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [outFormSettings] = useOutFormSettings();
  const shipOptions = outFormSettings?.ships || [];
  const projectOptions = outFormSettings?.projects || [];

  useEffect(() => {
    if (projectOptions.length > 0 && !projectOptions.includes(project)) {
      setProject(projectOptions[0]);
    }
  }, [projectOptions]);

  const existingPending = useMemo(() => {
    return (requests || []).find(
      (r) => r.status === "pending" && String(r.item_code).trim() === String(item.code).trim()
    );
  }, [requests, item.code]);

  const handleShipNoChange = (val) => {
    let clean = val.trim();
    if (/^\d+$/.test(clean)) {
      clean = `H${clean}`;
    }
    setShipNo(clean);
  };

  const submit = async () => {
    if (!requester.trim()) { notify("요청자 이름을 입력해주세요.", "err"); return; }
    
    // [설정된 호선만 작성 가능하도록 검증]
    const trimmedShip = shipNo.trim();
    if (!trimmedShip) {
      notify("호선을 입력해주세요.", "err");
      return;
    }
    if (shipOptions.length > 0 && !shipOptions.includes(trimmedShip)) {
      notify("등록되지 않은 호선입니다. 저장된 호선만 입력할 수 있어요.", "err");
      return;
    }

    setSubmitting(true);
    await addRequest({
      itemCode: item.code,
      itemName: item.name,
      requester: requester.trim(),
      shipNo: shipNo.trim(),
      project: project,
      note: note.trim()
    });
    try { localStorage.setItem(LAST_REQUESTER_KEY, requester.trim()); } catch {}
    setSubmitting(false);
    setOpen(false);
    setNote("");
    notify(`🚨 ${item.name} 긴급 발주 요청을 보냈습니다.`, "ok");
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{
          display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
          padding: size === "small" ? "5px 9px" : "7px 12px",
          borderRadius: 7, border: "1px solid #EF535066", background: "#EF535018",
          color: "#FF6B6B", fontSize: size === "small" ? 10.5 : 11.5, fontWeight: 700,
          fontFamily: "'IBM Plex Mono', monospace", cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        <AlertTriangle size={size === "small" ? 11 : 13} />긴급요청
      </button>

      {open && (
        <div
          onClick={(e) => { e.stopPropagation(); setOpen(false); }}
          className="app-modal-overlay"
          style={{
            position: "fixed", inset: 0, background: "rgba(6,14,22,0.72)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 380, background: "#0F2233", border: "1px solid #EF535055",
              borderRadius: 14, padding: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <AlertTriangle size={18} color="#FF6B6B" />
              <span style={{ fontSize: 15, fontWeight: 700, color: "#FF6B6B" }}>긴급 자재 발주 요청</span>
            </div>
            <div style={{ fontSize: 13, color: "#C9DAE8", marginBottom: 4 }}>{item.name}</div>
            <div style={{ fontSize: 11, color: "#7F97AC", fontFamily: "IBM Plex Mono", marginBottom: 14 }}>
              코드: {item.code} · 현재고 {item.stock}{item.unit}
            </div>

            {existingPending && (
              <div style={{
                fontSize: 11.5, color: "#F5A623", background: "#F5A62318", border: "1px solid #F5A62344",
                borderRadius: 8, padding: "8px 10px", marginBottom: 12,
              }}>
                ⚠ {existingPending.requester}님이 {timeAgoStr(existingPending.created_at)} 이미 요청했어요. 그래도 추가로 요청할 수 있어요.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              <Field label="요청자 이름">
                <input style={inputStyle} value={requester} onChange={(e) => setRequester(e.target.value)} placeholder="이름 입력" />
              </Field>
              <Field label="호선 선택/작성 (등록된 호선만 가능)">
                <AutocompleteInput
                  value={shipNo}
                  onChange={handleShipNoChange}
                  options={shipOptions}
                  placeholder="예: H3527 (저장된 호선 선택)"
                />
              </Field>
              <Field label="프로젝트 선택">
                <Select value={project} onChange={(e) => setProject(e.target.value)} options={projectOptions} />
              </Field>
              <Field label="메모 (선택)">
                <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 이번 주 내 필요" />
              </Field>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="ghost" style={{ flex: 1 }} onClick={() => setOpen(false)}>취소</Btn>
              <Btn
                style={{ flex: 2, background: "#EF5350", border: "1px solid #EF5350", color: "#fff" }}
                onClick={submit}
                disabled={submitting}
              >
                <AlertTriangle size={16} />요청 보내기
              </Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Select({ value, onChange, options, style }) {
  return (
    <select value={value} onChange={onChange} style={{ ...inputStyle, ...style }}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function AutocompleteInput({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const filtered = useMemo(() => {
    const list = options || [];
    if (!value) return list.slice(0, 30);
    const q = value.toLowerCase().trim();
    return list.filter((o) => String(o).toLowerCase().includes(q)).slice(0, 30);
  }, [options, value]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        style={inputStyle}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
          background: "#0F2233", border: "1px solid #274460", borderRadius: 8,
          marginTop: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", maxHeight: 200, overflowY: "auto",
        }}>
          {filtered.map((opt) => (
            <div
              key={opt}
              onMouseDown={(e) => { e.preventDefault(); onChange(opt); setOpen(false); }}
              style={{
                padding: "10px 12px", borderRadius: 6, cursor: "pointer", fontSize: 13,
                borderBottom: "1px solid #16293C", color: "#E7EEF5",
              }}
            >
              {opt}
            </div>
          ))}
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


/* ---------------- 실시간 대화 / 개발중 공지 + 개인 메모 ----------------
   현재는 실제 실시간 채팅을 열지 않고, 공지와 개인 메모만 제공합니다.
   추후 Supabase Realtime chat_messages로 확장할 수 있도록 화면을 독립 컴포넌트로 분리합니다.
----------------------------------------------------------------------- */
const PERSONAL_MEMO_KEY = "panel:personalMemos";

function ChatMemoView({ onClose }) {
  const [memos, setMemos] = useState(() => {
    try {
      const raw = localStorage.getItem(PERSONAL_MEMO_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [draft, setDraft] = useState("");

  const persist = (next) => {
    setMemos(next);
    try {
      localStorage.setItem(PERSONAL_MEMO_KEY, JSON.stringify(next));
    } catch {}
  };

  const saveMemo = () => {
    const value = draft.trim();
    if (!value) return;

    persist([
      {
        id: uid("MEMO"),
        text: value,
        createdAt: new Date().toISOString(),
      },
      ...memos,
    ]);
    setDraft("");
  };

  const deleteMemo = (id) => {
    persist(memos.filter((memo) => memo.id !== id));
  };

  return (
    <div style={{ width: "100%", maxWidth: 760, margin: "0 auto" }}>
      {/* 제목 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        marginBottom: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <MessageCircle size={20} color="#22D3EE" />
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#E7EEF5" }}>
              실시간 대화
            </div>
            <div style={{ fontSize: 11, color: "#7F97AC", marginTop: 2 }}>
              현재는 개인 메모 기능을 사용할 수 있습니다.
            </div>
          </div>
        </div>

        <Btn
          variant="ghost"
          onClick={onClose}
          style={{ padding: "7px 11px", fontSize: 11.5 }}
        >
          닫기
        </Btn>
      </div>

      {/* 상단 고정 공지 */}
      <Card
        neon="#F5A623"
        style={{
          padding: 15,
          marginBottom: 14,
          background: "linear-gradient(180deg, #2A2414 0%, #122333 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#F5A62322",
            border: "1px solid #F5A62355",
            flexShrink: 0,
            fontSize: 17,
          }}>
            📢
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{
              color: "#F5A623",
              fontWeight: 800,
              fontSize: 13.5,
              marginBottom: 5,
            }}>
              공지 · 실시간 대화 기능 개발중
            </div>
            <div style={{
              color: "#C9DAE8",
              fontSize: 12.5,
              lineHeight: 1.65,
            }}>
              현재 실시간 대화 기능은 개발중입니다.<br />
              정식 업데이트 전까지 이 공간을 개인 메모로 사용할 수 있습니다.
            </div>
          </div>
        </div>
      </Card>

      {/* 메모 작성 */}
      <Card style={{ padding: 14, marginBottom: 14 }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          color: "#22D3EE",
          fontSize: 12.5,
          fontWeight: 800,
          marginBottom: 9,
          fontFamily: "'IBM Plex Mono', monospace",
        }}>
          📝 내 메모
        </div>

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              saveMemo();
            }
          }}
          placeholder="메모를 입력하세요..."
          rows={4}
          style={{
            ...inputStyle,
            resize: "vertical",
            minHeight: 96,
            lineHeight: 1.55,
            fontFamily: "Inter, sans-serif",
          }}
        />

        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginTop: 9,
        }}>
          <span style={{ color: "#5E86A3", fontSize: 10.5 }}>
            Ctrl + Enter로 저장
          </span>

          <Btn
            onClick={saveMemo}
            disabled={!draft.trim()}
            style={{ padding: "8px 14px", fontSize: 12 }}
          >
            <Save size={14} />
            저장
          </Btn>
        </div>
      </Card>

      {/* 저장된 메모 */}
      <div style={{
        color: "#5E86A3",
        fontSize: 11,
        fontFamily: "'IBM Plex Mono', monospace",
        letterSpacing: "0.08em",
        marginBottom: 8,
      }}>
        SAVED MEMOS · {memos.length}
      </div>

      {memos.length === 0 ? (
        <Card style={{
          padding: 24,
          textAlign: "center",
          color: "#5E86A3",
          fontSize: 12,
        }}>
          저장된 메모가 없습니다.
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {memos.map((memo) => (
            <Card key={memo.id} style={{ padding: 13 }}>
              <div style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 10,
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    color: "#E7EEF5",
                    fontSize: 13,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}>
                    {memo.text}
                  </div>

                  <div style={{
                    color: "#5E86A3",
                    fontSize: 10.5,
                    marginTop: 8,
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}>
                    {new Date(memo.createdAt).toLocaleString("ko-KR")}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => deleteMemo(memo.id)}
                  title="메모 삭제"
                  style={{
                    border: "1px solid #4A2A2A",
                    background: "#EF535012",
                    color: "#EF5350",
                    borderRadius: 7,
                    padding: "6px 8px",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
  /* ---------------- 간단 접근 코드 게이트 ---------------- */
const APP_ACCESS_CODE = "a1234"; // ← 원하는 비밀번호로 바꾸세요
const ACCESS_GATE_KEY = "panel:accessGranted";

function AccessGate({ children }) {
  const [granted, setGranted] = useState(() => {
    try { return localStorage.getItem(ACCESS_GATE_KEY) === "1"; } catch { return false; }
  });
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");

  if (granted) return children;

  const submit = () => {
    if (input.trim() === APP_ACCESS_CODE) {
      try { localStorage.setItem(ACCESS_GATE_KEY, "1"); } catch {}
      setGranted(true);
    } else {
      setErr("코드가 올바르지 않습니다.");
    }
  };

  return (
    <>
      <style>{`
        .access-gate-box * { box-sizing: border-box; }
      `}</style>
      <div className="access-gate-box" style={{
        position: "fixed", inset: 0, background: "#0A1622", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 99999, padding: 20,
        fontFamily: "Inter, -apple-system, sans-serif",
      }}>
        <div style={{ width: "100%", maxWidth: 320, background: "#0F2233", border: "1px solid #274460", borderRadius: 14, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#E7EEF5", marginBottom: 4 }}>선박 생산부 부자재 관리</div>
          <div style={{ fontSize: 12, color: "#7F97AC", marginBottom: 16 }}>접속 코드를 입력하세요</div>
          <input
            type="password"
            value={input}
            onChange={(e) => { setInput(e.target.value); setErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            style={{ background: "#0B1C2C", border: "1px solid #26445F", borderRadius: 8, color: "#E7EEF5", padding: "12px 14px", fontSize: 14, outline: "none", width: "100%", textAlign: "center", marginBottom: 10 }}
            placeholder="접속 코드"
            autoFocus
          />
          {err && <div style={{ color: "#EF5350", fontSize: 12, marginBottom: 10 }}>{err}</div>}
          <button
            onClick={submit}
            style={{ width: "100%", background: "#F5A623", color: "#0A1622", border: "1px solid #F5A623", fontWeight: 600, fontSize: 14, padding: "12px 20px", borderRadius: 8, cursor: "pointer" }}
          >
            입장
          </button>
        </div>
      </div>
    </>
  );
}

export default function App() {
  return (
    <AccessGate>
      <AppInner />
    </AccessGate>
  );
}

function AppInner() {
  const [items, saveItems, itemsLoaded, reloadItems] = useStorage("panel:items", seedItems);
  const [txs, saveTxs, txsLoaded, reloadTxs] = useStorage("panel:transactions", []);

  // 누적출고 전용 조회:
  // 일반 txs는 deleted=false만 보여주므로, 누적출고 창에서만 전체 거래를 가져온다.
  const loadCumulativeOutTxs = useCallback(async () => {
    if (!supabase) return txs;
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("type", "out")
        .order("at", { ascending: false });

      if (error) {
        console.error("누적출고 조회 오류:", error);
        return txs.filter((t) => t.type === "out");
      }
      // 원복 완료된 출고는 누적출고 집계/상세 목록에서 제외합니다.
      // 원본 거래 자체는 DB에 보존하고, 출고 이력 화면에서는 원복완료 상태로 표시합니다.
      return (Array.isArray(data) ? data : txs.filter((t) => t.type === "out"))
        .filter((t) => t.type === "out" && !String(t.reason || "").includes("MRO_REVERSED_OUT:"));
    } catch (e) {
      console.error("누적출고 조회 오류:", e);
      return txs.filter((t) => t.type === "out");
    }
  }, [txs]);

  const [outFormSettings, saveOutFormSettingCategory, outFormSettingsLoaded] = useOutFormSettings();
  const { requests: urgentRequests, addRequest: addUrgentRequest, resolveRequest: resolveUrgentRequest } = useUrgentRequests();
  
  /* 발주 장바구니 상태 (자재코드 및 정보 담기) */
  const [cartItems, setCartItems] = useState(() => {
    try {
      const saved = localStorage.getItem("panel:orderCart");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const addToCart = useCallback((item) => {
    setCartItems(prev => {
      if (prev.some(c => c.code === item.code)) return prev;
      const next = [...prev, item];
      try { localStorage.setItem("panel:orderCart", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const removeFromCart = useCallback((code) => {
    setCartItems(prev => {
      const next = prev.filter(c => c.code !== code);
      try { localStorage.setItem("panel:orderCart", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
    try { localStorage.removeItem("panel:orderCart"); } catch {}
  }, []);

  /* 초기 열림 탭: PC는 대시보드, 모바일은 대시보드가 숨겨져 있으므로 출고(스캔)로 시작 */
  const [tab, setTab] = useState(() => (typeof window !== "undefined" && window.innerWidth <= 768 ? "out" : "dashboard"));
  const [presetItem, setPresetItem] = useState(null);
  const [toast, setToast] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  /* 화면 크기가 모바일로 바뀌었는데 대시보드에 머물러 있으면 출고(스캔)로 이동 */
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768 && tab === "dashboard") {
        setTab("out");
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, [tab]);

  const backPressedRef = useRef(false);
  const backTimerRef = useRef(null);

  /* 모바일 좌우 스와이프로 하단 탭(출고/재고/입고/반납) 전환 - 손가락을 따라오는 드래그 연출 */
  const mainPanelRef = useRef(null);
  const dragStateRef = useRef({ startX: 0, startY: 0, dragging: null, deltaX: 0 });
  const MOBILE_SWIPE_TABS = ["out", "stock", "in", "return"];
  const SWIPE_THRESHOLD = 60;

  /* 모달(긴급요청/이력/QR 등)이 열려 있는 동안에는 스와이프를 완전히 무시한다.
     tab-panel에 transform이 걸리면 그 안에 렌더된 position:fixed 모달이
     뷰포트 기준이 아니라 tab-panel 기준으로 갇혀버려서 화면 밖으로 밀려나 보이는
     버그가 있었음 (재고조회 > 긴급요청 모달 후 스와이프 시 모달이 아래로 내려가던 문제) */
  const isInsideModal = (target) => !!(target && target.closest && target.closest(".app-modal-overlay"));

  const handleMainTouchStart = (e) => {
    if (isInsideModal(e.target)) {
      dragStateRef.current = { startX: 0, startY: 0, dragging: false, deltaX: 0 };
      return;
    }
    const t = e.touches[0];
    dragStateRef.current = { startX: t.clientX, startY: t.clientY, dragging: null, deltaX: 0 };
  };

  const handleMainTouchMove = (e) => {
    if (typeof window === "undefined" || window.innerWidth > 768) return;
    if (isInsideModal(e.target)) return;
    const ds = dragStateRef.current;
    const t = e.touches[0];
    const deltaX = t.clientX - ds.startX;
    const deltaY = t.clientY - ds.startY;

    if (ds.dragging === null) {
      if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) return; // 의도 파악 전
      const curIdx = MOBILE_SWIPE_TABS.indexOf(tab);
      ds.dragging = curIdx !== -1 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;
    }
    if (!ds.dragging) return;

    const curIdx = MOBILE_SWIPE_TABS.indexOf(tab);
    const atFirst = curIdx <= 0;
    const atLast = curIdx >= MOBILE_SWIPE_TABS.length - 1;
    /* 더 넘어갈 탭이 없는 방향으로는 고무줄처럼 저항감 부여 */
    const resisted = (deltaX > 0 && atFirst) || (deltaX < 0 && atLast) ? deltaX * 0.35 : deltaX;
    ds.deltaX = resisted;

    const el = mainPanelRef.current;
    if (el) {
      el.style.transition = "none";
      el.style.transform = `translateX(${resisted}px)`;
      el.style.opacity = String(Math.max(0.7, 1 - Math.abs(resisted) / 600));
    }
  };

  const handleMainTouchEnd = () => {
    const ds = dragStateRef.current;
    const el = mainPanelRef.current;

    if (!ds.dragging) {
      dragStateRef.current = { startX: 0, startY: 0, dragging: null, deltaX: 0 };
      return;
    }

    const curIdx = MOBILE_SWIPE_TABS.indexOf(tab);
    const goNext = ds.deltaX <= -SWIPE_THRESHOLD && curIdx < MOBILE_SWIPE_TABS.length - 1;
    const goPrev = ds.deltaX >= SWIPE_THRESHOLD && curIdx > 0;

    if (goNext || goPrev) {
      /* 임계값을 넘겼으면 즉시 다음 탭으로 - 새 창이 슬라이드 애니메이션으로 이어받음 */
      if (el) { el.style.transition = ""; el.style.transform = ""; el.style.opacity = ""; }
      goToTab(MOBILE_SWIPE_TABS[curIdx + (goNext ? 1 : -1)]);
    } else if (el) {
      /* 임계값 미달 - 손을 뗀 원위치로 고무줄처럼 되돌아옴 */
      el.style.transition = "transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.28s ease";
      el.style.transform = "translateX(0px)";
      el.style.opacity = "1";
      const cleanup = () => {
        if (mainPanelRef.current === el) el.style.transition = "";
        el.removeEventListener("transitionend", cleanup);
      };
      el.addEventListener("transitionend", cleanup);
    }

    dragStateRef.current = { startX: 0, startY: 0, dragging: null, deltaX: 0 };
  };

  const notify = useCallback((msg, type = "ok") => {
    setToast({ text: msg, type });
    setTimeout(() => { setToast(null); }, 2500);
  }, []);

  useEffect(() => {
    window.history.pushState({ page: "app" }, "", window.location.href);

    const handlePopState = (e) => {
      if (backPressedRef.current) {
        clearTimeout(backTimerRef.current);
        window.history.back();
      } else {
        backPressedRef.current = true;
        window.history.pushState({ page: "app" }, "", window.location.href);
        notify("뒤로가기를 한 번 더 누르면 종료됩니다.", "info");

        backTimerRef.current = setTimeout(() => {
          backPressedRef.current = false;
        }, 2000);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (backTimerRef.current) clearTimeout(backTimerRef.current);
    };
  }, [notify]);

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

  const alerts = useMemo(() => items.filter((i) => statusOf(i) === "danger"), [items]);
  const warns = useMemo(() => items.filter((i) => statusOf(i) === "warn"), [items]);
  const pendingUrgentCount = useMemo(
    () => urgentRequests.filter((r) => r.status === "pending").length,
    [urgentRequests]
  );

  /* PC 전용: 탭 제목에 긴급요청 대기 건수 표시 */
  const baseTitleRef = useRef(document.title);
  useEffect(() => {
    if (window.innerWidth <= 768) return;
    if (pendingUrgentCount > 0) {
      document.title = `🚨(${pendingUrgentCount}) ${baseTitleRef.current}`;
    } else {
      document.title = baseTitleRef.current;
    }
    return () => { document.title = baseTitleRef.current; };
  }, [pendingUrgentCount]);

  /* PC 전용: 새 긴급요청 발생 시 알림음 */
  const hasInteractedRef = useRef(false);
  const prevPendingCountRef = useRef(pendingUrgentCount);
  useEffect(() => {
    const markInteracted = () => { hasInteractedRef.current = true; };
    window.addEventListener("pointerdown", markInteracted, { once: true });
    window.addEventListener("keydown", markInteracted, { once: true });
    return () => {
      window.removeEventListener("pointerdown", markInteracted);
      window.removeEventListener("keydown", markInteracted);
    };
  }, []);

  useEffect(() => {
    if (window.innerWidth <= 768) { prevPendingCountRef.current = pendingUrgentCount; return; }
    if (pendingUrgentCount > prevPendingCountRef.current && hasInteractedRef.current) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "square";
          osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
          osc.connect(gain).connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.4);
        }
      } catch (e) { /* 알림음 재생 불가 시 조용히 무시 */ }
    }
    prevPendingCountRef.current = pendingUrgentCount;
  }, [pendingUrgentCount]);

  const NAV = [
    { id: "dashboard", label: "대시보드", icon: LayoutGrid, pcOnly: true },
    { id: "in", label: "입고등록", icon: ArrowDownToLine },
    { id: "out", label: "출고(스캔)", icon: ArrowUpFromLine },
    { id: "return", label: "원자재반납", icon: RotateCcw },
    { id: "stock", label: "재고조회", icon: Boxes },
    { id: "master", label: "자재마스터", icon: Package, pcOnly: true },
    { id: "settings", label: "불출설정", icon: SettingsIcon, pcOnly: true },
    { id: "trash", label: "휴지통", icon: Trash2, pcOnly: true },
    { id: "chat", label: "실시간 대화", icon: MessageCircle },
  ];
  const NAV_IDS = NAV.map((n) => n.id);

  /* 탭(메뉴창)별 네온 포인트 컬러 - 테두리/그로우에 사용 */
  const TAB_NEON = {
    dashboard: "#38BDF8",
    in: "#35D08C",
    out: "#F5A623",
    return: "#22D3EE",
    stock: "#A78BFA",
    master: "#F472B6",
    settings: "#2DD4BF",
    trash: "#EF5350",
    chat: "#22D3EE",
  };

  const [slideDir, setSlideDir] = useState(1);
  const goToTab = (next) => {
    if (next === tab) return;
    const curIdx = NAV_IDS.indexOf(tab);
    const nextIdx = NAV_IDS.indexOf(next);
    setSlideDir(nextIdx >= curIdx ? 1 : -1);
    setTab(next);
  };

const [showSplash, setShowSplash] = useState(true);

useEffect(() => {
  const timer = setTimeout(() => {
    setShowSplash(false);
  }, 2000);

  return () => clearTimeout(timer);
}, []);
  const ready = itemsLoaded && txsLoaded && outFormSettingsLoaded;
if (showSplash) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#00122B",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 99999,
      }}
    >
      <img
        src="/splash.png"
        alt="LUXCO"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    </div>
  );
}
  return (
    <div className="app-container" style={{
      background: "#0A1622", color: "#E7EEF5", fontFamily: "Inter, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=${FONT_LINK}&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html, body, #root { width: 100%; max-width: none; margin: 0; padding: 0; }
        ::selection { background: #F5A62355; }
        table { border-collapse: collapse; width: 100%; }
        th, td { text-align: left; padding: 10px 12px; font-size: 13.5px; }
        tbody tr { border-top: 1px solid #17293B; }
        tbody tr:hover { background: #0F2030; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: #21405B; border-radius: 4px; }
        @keyframes riseIn { from { opacity:0; transform: translate(-50%,12px);} to {opacity:1; transform: translate(-50%,0);} }
        @keyframes urgentBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        @keyframes tabSlideInFromRight { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes tabSlideInFromLeft { from { opacity: 0; transform: translateX(-28px); } to { opacity: 1; transform: translateX(0); } }
        input:focus, select:focus { border-color: #F5A623 !important; }
        button:active { transform: scale(0.98); }

        .app-container { display: flex; min-height: 100vh; width: 100%; }
        .pc-sidebar { width: 250px; flex-shrink: 0; border-right: 1px solid #16293C; padding: 24px 18px; display: flex; flex-direction: column; gap: 26px; }
        .mobile-header { display: none; }
        .mobile-bottom-nav { display: none; }
        .main-content { flex: 1; padding: 30px 36px; overflow-y: auto; overflow-x: hidden; min-width: 0; touch-action: pan-y; }
        .toast-box { bottom: 26px; left: 50%; transform: translateX(-50%); }

        .tab-panel {
          border: 1px solid var(--tab-neon-border, #274460);
          border-radius: 16px;
          padding: 18px 20px;
          background: var(--tab-neon-bg, transparent);
          box-shadow: 0 0 0 1px var(--tab-neon-border, transparent), 0 0 26px -8px var(--tab-neon-glow, transparent), inset 0 0 40px -30px var(--tab-neon-glow, transparent);
          animation: tabSlideInFromRight 0.32s cubic-bezier(0.22, 1, 0.36, 1);
          transition: border-color 0.25s ease, box-shadow 0.25s ease;
          overflow-x: hidden;
          max-width: 100%;
        }
        .tab-panel.dir-back { animation-name: tabSlideInFromLeft; }

        .dashboard-recent-table { display: block; width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .dashboard-recent-cards { display: none; flex-direction: column; gap: 10px; }

        .inbound-grid-container {
          display: grid;
          grid-template-columns: 1.3fr 1fr;
          gap: 20px;
          align-items: start;
        }
        .inbound-grid-container > * { min-width: 0; }

        .outform-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 20px;
          width: 100%;
        }
        .outform-grid > * { min-width: 0; }

        @media (max-width: 768px) {
          .pc-only-block { display: none !important; }
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
          .main-content { flex: 1; padding: 12px 10px; overflow-y: auto; overflow-x: hidden; touch-action: pan-y; }
          .tab-panel { padding: 14px 12px; border-radius: 14px; }
          .toast-box { bottom: 80px; left: 50%; transform: translateX(-50%); width: calc(100% - 32px); max-width: 360px; justify-content: center; }
          .mobile-scroll-table { display: block; width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }

          .dashboard-recent-table { display: none; }
          .dashboard-recent-cards { display: flex; }

          .inbound-grid-container {
            grid-template-columns: 1fr;
            gap: 16px;
          }

          .outform-grid {
            grid-template-columns: 1fr;
            gap: 14px;
          }
        }
      `}</style>

      {/* PC 사이드바 */}
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

        {/* [수정 2] 클릭 시 자재마스터 화면('master')으로 이동하도록 onClick 변경 */}
        {pendingUrgentCount > 0 && (
          <button
            onClick={() => goToTab("master")}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
              padding: "10px 14px", borderRadius: 8, border: "1px solid #EF535066",
              background: "linear-gradient(90deg, #3A1414, #1F0B0B)", cursor: "pointer",
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#FF6B6B", fontWeight: 700 }}>
              🔔 긴급요청 대기중
            </span>
            <span style={{
              minWidth: 20, height: 20, padding: "0 5px", borderRadius: 999, background: "#EF5350",
              color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {pendingUrgentCount}
            </span>
          </button>
        )}

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
          {NAV.filter((n) => !n.mobileTopOnly).map((n) => {
            const active = tab === n.id;
            const Icon = n.icon;
            return (
              <button
                key={n.id}
                onClick={() => goToTab(n.id)}
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/Luxco.png" alt="Luxco" style={{ height: 34, width: "auto", objectFit: "contain", display: "block" }} />
          <span style={{ fontFamily: "Rajdhani, Oswald, sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: "0.06em", color: "#fff" }}>
            선박 생산부
          </span>
          <button
            onClick={() => goToTab("master")}
            title="자재마스터 이동"
            style={{
              background: tab === "master" ? "#F5A62322" : "transparent",
              border: `1px solid ${tab === "master" ? "#F5A623" : "#274460"}`,
              borderRadius: 6,
              padding: "4px 6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#F5A623",
              marginLeft: 4
            }}
          >
            <Package size={17} color="#F5A623" />
          </button>
        </div>
        <button
          onClick={() => goToTab("chat")}
          title="실시간 대화 / 개인 메모"
          style={{
            background: tab === "chat"
              ? "linear-gradient(135deg, #22D3EE33, #8B5CF633)"
              : "linear-gradient(135deg, #22D3EE18, #8B5CF612)",
            border: `1px solid ${tab === "chat" ? "#22D3EE" : "#22D3EE66"}`,
            color: tab === "chat" ? "#FFFFFF" : "#B9F5FF",
            borderRadius: 9,
            padding: "7px 11px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 800,
            fontFamily: "'IBM Plex Mono', monospace",
            boxShadow: tab === "chat"
              ? "0 0 14px -4px #22D3EE"
              : "0 0 10px -6px #22D3EE",
          }}
        >
          <MessageCircle size={15} />
          대화
        </button>
      </header>

      {/* 메인 영역 */}
      <main
        className="main-content"
        onTouchStart={handleMainTouchStart}
        onTouchMove={handleMainTouchMove}
        onTouchEnd={handleMainTouchEnd}
      >
        {!ready ? (
          <div style={{ color: "#5E86A3", fontFamily: "'IBM Plex Mono', monospace", textAlign: "center", padding: 40 }}>Supabase 불러오는 중...</div>
        ) : (
          <div
            key={tab}
            ref={mainPanelRef}
            className={`tab-panel${slideDir < 0 ? " dir-back" : ""}`}
            style={{
              "--tab-neon-border": `${TAB_NEON[tab] || "#274460"}55`,
              "--tab-neon-glow": `${TAB_NEON[tab] || "#274460"}45`,
              "--tab-neon-bg": `${TAB_NEON[tab] || "#274460"}0d`,
            }}
          >
            {tab === "dashboard" && <Dashboard items={items} txs={txs} loadCumulativeOutTxs={loadCumulativeOutTxs} />}
            {tab === "in" && <InboundView items={items} saveItems={saveItems} txs={txs} saveTxs={saveTxs} notify={notify} supabase={typeof supabase !== 'undefined' ? supabase : null} />}
            {tab === "out" && <OutForm items={items} saveItems={saveItems} txs={txs} saveTxs={saveTxs} notify={notify} outFormSettings={outFormSettings} presetItem={presetItem} onConsumePreset={() => setPresetItem(null)} urgentRequests={urgentRequests} addUrgentRequest={addUrgentRequest} />}
            {tab === "return" && <ReturnView items={items} saveItems={saveItems} txs={txs} saveTxs={saveTxs} notify={notify} outFormSettings={outFormSettings} />}
            {tab === "stock" && <StockView items={items} saveItems={saveItems} notify={notify} urgentRequests={urgentRequests} addUrgentRequest={addUrgentRequest} onSelectItem={(item) => { setPresetItem(item); goToTab("out"); }} />}
            {tab === "master" && <MasterView items={items} saveItems={saveItems} notify={notify} urgentRequests={urgentRequests} resolveUrgentRequest={resolveUrgentRequest} cartItems={cartItems} addToCart={addToCart} removeFromCart={removeFromCart} clearCart={clearCart} />}
            {tab === "settings" && <OutFormSettingsView settings={outFormSettings} saveCategory={saveOutFormSettingCategory} notify={notify} />}
            {tab === "trash" && <TrashView items={items} saveItems={saveItems} notify={notify} />}
            {tab === "chat" && <ChatMemoView onClose={() => goToTab("out")} />}
          </div>
        )}
      </main>

      {/* 모바일 하단 탭 */}
      <nav className="mobile-bottom-nav">
        {["out", "stock", "in", "return"].map((id) => {
          const n = NAV.find((item) => item.id === id);
          if (!n) return null;
          const active = tab === n.id;
          const Icon = n.icon;
          const neon = TAB_NEON[n.id] || "#7F97AC";
          const isOut = n.id === "out";

          return (
            <button
              key={n.id}
              onClick={() => goToTab(n.id)}
              style={{
                background: isOut ? (active ? `${neon}22` : `${neon}10`) : "transparent",
                border: isOut ? `1px solid ${neon}${active ? "88" : "44"}` : "none",
                borderRadius: isOut ? 10 : 0,
                color: active ? neon : "#7F97AC",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: isOut ? 2 : 4,
                cursor: "pointer",
                padding: isOut ? "3px 4px" : 0,
                margin: isOut ? "4px 2px" : 0,
                transform: isOut ? "translateY(-4px)" : "none",
                boxShadow: isOut && active ? `0 0 18px -8px ${neon}` : "none",
              }}
            >
              <Icon size={isOut ? 23 : 19} color={active ? neon : "#7F97AC"} />
              <span style={{
                fontSize: isOut ? 10.5 : 10,
                fontFamily: "Inter, sans-serif",
                fontWeight: active || isOut ? 700 : 500,
              }}>
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
function Dashboard({ items, txs, loadCumulativeOutTxs }) {
  const [historyModal, setHistoryModal] = useState(null); // null | "in" | "out"
  const [cumulativeOutTxs, setCumulativeOutTxs] = useState([]);

  useEffect(() => {
    if (historyModal !== "out") return;
    let cancelled = false;
    (async () => {
      const rows = await loadCumulativeOutTxs();
      if (!cancelled) setCumulativeOutTxs(rows);
    })();
    return () => { cancelled = true; };
  }, [historyModal, loadCumulativeOutTxs]);

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

  const ALL_PROJECTS = "전체";

  const availableProjects = useMemo(() => {
    const outTxs = txs.filter(
      (t) => t.type === "out" && t.shipNo === selectedShip && t.project && t.project !== "미입력"
    );
    const uniqueProjects = Array.from(new Set(outTxs.map((t) => t.project)));
    return [ALL_PROJECTS, ...uniqueProjects];
  }, [txs, selectedShip]);

  const [selectedProject, setSelectedProject] = useState(ALL_PROJECTS);

  useEffect(() => {
    if (!availableProjects.includes(selectedProject)) {
      setSelectedProject(ALL_PROJECTS);
    }
  }, [availableProjects, selectedProject]);

  const shipMaterialConsumption = useMemo(() => {
    if (!selectedShip || selectedShip === "등록된 호선 없음") return [];

    const map = {};
    txs
      .filter(
        (t) =>
          t.type === "out" &&
          t.shipNo === selectedShip &&
          (selectedProject === ALL_PROJECTS || t.project === selectedProject)
      )
      .forEach((t) => {
        const key = t.itemName || t.itemCode;
        if (!map[key]) {
          map[key] = { name: key, code: t.itemCode, qty: 0, unit: t.unit || "EA" };
        }
        map[key].qty += Number(t.qty) || 0;
      });

    return Object.values(map);
  }, [txs, selectedShip, selectedProject]);

  const recent = useMemo(() => {
    const parseAt = (t) => {
      const d = new Date(String(t.at || "").replace(" ", "T"));
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    };
    return [...txs].sort((a, b) => parseAt(b) - parseAt(a)).slice(0, 10);
  }, [txs]);
  const alertItems = items.filter((i) => statusOf(i) !== "ok").sort((a, b) => (a.stock / (a.safety || 1)) - (b.stock / (b.safety || 1)));

  const totalOutSource = cumulativeOutTxs.length
    ? cumulativeOutTxs
    : txs.filter((t) => t.type === "out" && !String(t.reason || "").includes("MRO_REVERSED_OUT:"));
  const totalOutQty = totalOutSource.reduce((s, t) => s + Number(t.qty || 0), 0);
  const totalInQty = txs.filter((t) => t.type === "in").reduce((s, t) => s + Number(t.qty), 0);

  return (
    <div>
      <Header title="대시보드" subtitle="실시간 재고 · 호선별 소모 현황" />

      {/* [수정 1] 대시보드 상단 경고창 완전 삭제 */}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
        <StatCard label="관리 품목 수" value={items.length} unit="종" icon={Package} color="#5EC8FF" />
        <StatCard label="누적 입고" value={totalInQty.toLocaleString()} unit="" icon={ArrowDownToLine} color="#35D08C" onClick={() => setHistoryModal("in")} />
        <StatCard label="누적 출고" value={totalOutQty.toLocaleString()} unit="" icon={ArrowUpFromLine} color="#F5A623" onClick={() => setHistoryModal("out")} />
        <StatCard label="안전재고 미달" value={items.filter((i) => statusOf(i) === "danger").length} unit="종" icon={AlertTriangle} color="#EF5350" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginBottom: 20 }}>
        <Card style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <SectionLabel>호선별 부자재 소모 현황</SectionLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
              <span style={{ fontSize: 12, color: "#7F97AC", fontWeight: 600 }}>프로젝트:</span>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                style={{
                  background: "#0B1C2C", border: "1px solid #274460", color: "#F5A623",
                  padding: "6px 10px", borderRadius: 6, fontSize: 13, fontWeight: "bold",
                  outline: "none", cursor: "pointer"
                }}
              >
                {availableProjects.map((proj) => (
                  <option key={proj} value={proj}>{proj}</option>
                ))}
              </select>
            </div>
          </div>

          {shipMaterialConsumption.length === 0 ? (
            <EmptyState
              icon={ScanLine}
              text={
                selectedProject === ALL_PROJECTS
                  ? `[${selectedShip}] 호선에 출고된 자재 이력이 없습니다.`
                  : `[${selectedShip} / ${selectedProject}] 조건에 출고된 자재 이력이 없습니다.`
              }
              color="#5E86A3"
            />
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
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: "0.14em",
              color: "#5E86A3", textTransform: "uppercase", display: "flex",
              alignItems: "center", gap: 8, flexShrink: 0,
            }}>
              <span style={{ width: 14, height: 2, background: "#F5A623", display: "inline-block" }} />
              재고부족 경고
            </div>
          </div>
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
          <>
            {/* PC/태블릿 테이블 뷰 */}
            <div className="dashboard-recent-table">
              <table>
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
                          color: t.type === "in" ? "#35D08C" : t.type === "return" ? "#22D3EE" : "#F5A623",
                          background: t.type === "in" ? "#35D08C1a" : t.type === "return" ? "#22D3EE1a" : "#F5A6231a",
                        }}>
                          {t.type === "in" ? "입고" : t.type === "return" ? "반납" : "출고"}
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

            {/* 모바일 가독성 최적화 카드 뷰 */}
            <div className="dashboard-recent-cards">
              {recent.map((t) => (
                <div
                  key={t.id}
                  style={{
                    background: "#0B1C2C",
                    border: "1px solid #1F3B54",
                    borderRadius: 8,
                    padding: "10px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", fontFamily: "IBM Plex Mono", fontSize: 10.5,
                        padding: "2px 6px", borderRadius: 6, fontWeight: 600,
                        color: t.type === "in" ? "#35D08C" : t.type === "return" ? "#22D3EE" : "#F5A623",
                        background: t.type === "in" ? "#35D08C1a" : t.type === "return" ? "#22D3EE1a" : "#F5A6231a",
                      }}>
                        {t.type === "in" ? "입고" : t.type === "return" ? "반납" : "출고"}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: "#E7EEF5" }}>{t.itemName}</span>
                    </div>
                    <span style={{ fontFamily: "IBM Plex Mono", fontWeight: 700, fontSize: 13.5, color: t.type === "in" ? "#35D08C" : t.type === "return" ? "#22D3EE" : "#F5A623" }}>
                      {t.qty} {t.unit}
                    </span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#9FB4C7", paddingTop: 4, borderTop: "1px dashed #16293C" }}>
                    <span>{t.shipNo || t.project || "미지정"} | {t.process || "미지정"}</span>
                    <span>{t.worker || "담당자 미입력"}</span>
                  </div>

                  <div style={{ fontSize: 10.5, color: "#5E86A3", fontFamily: "IBM Plex Mono", textAlign: "right" }}>
                    {t.at}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {historyModal && (
        <TxHistoryModal type={historyModal} txs={historyModal === "out" ? cumulativeOutTxs : txs} showDeleted={historyModal === "out"} onClose={() => setHistoryModal(null)} />
      )}
    </div>
  );
}

function StatCard({ label, value, unit, icon: Icon, color, onClick }) {
  return (
    <Card
      style={{ padding: "16px 18px", cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
    >
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
      {onClick && (
        <div style={{ fontSize: 10, color: "#5E86A3", marginTop: 8 }}>클릭해서 상세 기록 보기 →</div>
      )}
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

/* ---------------- 출고 (스캔) ---------------- */
function OutForm({ items, saveItems, txs, saveTxs, notify, outFormSettings, presetItem, onConsumePreset, urgentRequests, addUrgentRequest }) {
  const [scan, setScan] = useState("");
  const [found, setFound] = useState(null);
  const [shipNo, setShipNo] = useState("");
  const [project, setProject] = useState("MSBD/LVSB");
  const [process, setProcess] = useState("배전반 결선");
  const [qty, setQty] = useState("");
  const [worker, setWorker] = useState("울산에이원");
  const [isScanning, setIsScanning] = useState(false);
  const [outSubmitting, setOutSubmitting] = useState(false);
  const qrScannerRef = useRef(null);
  const infoCardRef = useRef(null);

  const scrollToInfoCard = () => {
    setTimeout(() => {
      infoCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  };

  useEffect(() => {
    if (presetItem) {
      setFound(presetItem);
      notify(`자재 선택됨: ${presetItem.name}`, "ok");
      scrollToInfoCard();
      if (onConsumePreset) onConsumePreset();
    }
  }, [presetItem]);

  const shipOptions = outFormSettings?.ships || [];
  const projectOptions = outFormSettings?.projects || [];
  const processOptions = outFormSettings?.processes || [];
  const workerOptions = outFormSettings?.workers || [];

  useEffect(() => {
    if (projectOptions.length > 0 && !projectOptions.includes(project)) {
      setProject(projectOptions[0]);
    }
  }, [projectOptions]);

  useEffect(() => {
    if (processOptions.length > 0 && !processOptions.includes(process)) {
      setProcess(processOptions[0]);
    }
  }, [processOptions]);

  useEffect(() => {
    if (workerOptions.length > 0 && !workerOptions.includes(worker)) {
      setWorker(workerOptions[0]);
    }
  }, [workerOptions]);

  // 원복 여부는 원본 거래의 reason에 남긴 감사용 마커로 판단합니다.
  const isReversedOutTx = (tx) =>
    String(tx?.reason || "").includes("MRO_REVERSED_OUT:");

  const recentOutTxs = useMemo(() => {
    const parseAt = (t) => {
      const d = new Date(String(t.at || "").replace(" ", "T"));
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    };
    return txs
      .filter((t) => t.type === "out" && t.deleted !== true)
      .sort((a, b) => parseAt(b) - parseAt(a))
      .slice(0, 15);
  }, [txs]);

  const { favoriteCodes, isFavorite, toggleFavorite } = useFavoriteItems(notify);
  const favoriteItems = useMemo(() => {
    return favoriteCodes
      .map((code) => items.find((i) => String(i.code).trim() === code))
      .filter(Boolean);
  }, [favoriteCodes, items]);

  const selectFavoriteItem = (item) => {
    setFound(item);
    setScan("");
    notify(`자재 선택됨: ${item.name}`, "ok");
    scrollToInfoCard();
  };

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
    if (hit) { setFound(hit); notify(`자재 선택됨: ${hit.name}`, "ok"); scrollToInfoCard(); }
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
            const qrboxSize = Math.max(160, Math.min(230, Math.floor(minEdge * 0.45)));
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
            scrollToInfoCard();
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
    if (outSubmitting) return;
    if (!found || !qty || Number(qty) <= 0) { notify("자재를 스캔하고 수량을 입력해주세요.", "err"); return; }
    if (Number(qty) > found.stock) { notify("현재고보다 많은 수량은 출고할 수 없습니다.", "err"); return; }

    setOutSubmitting(true);
    try {
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
        deleted: false,
      };

      if (supabase) {
        await applyStockTransactionsAtomic([{ code: found.code, delta: -Number(qty), tx }]);
        try {
          await reloadItems();
          await reloadTxs();
        } catch (reloadErr) {
          console.error("출고 후 새로고침 실패(잠시 후 자동으로 갱신됩니다):", reloadErr);
        }
      } else {
        await saveItems(nextItems);
        await saveTxs([...txs, tx]);
      }
      const remain = found.stock - Number(qty);
      notify(`${found.name} ${qty}${found.unit} 출고 완료 · 잔여 ${remain}${found.unit}`, remain < found.safety ? "info" : "ok");

      setQty(""); 
      setShipNo("");
      setProject(projectOptions[0] || "MSBD/LVSB");
      setProcess(processOptions[0] || "배전반 결선");
      setWorker(workerOptions[0] || "울산에이원");
      setFound(null); 
      setScan("");
    } finally {
      setOutSubmitting(false);
    }
  };

  const cancelOutTx = async (targetTx) => {
  if (isReversedOutTx(targetTx)) {
    notify("이미 원복 처리된 불출 이력입니다.", "info");
    return;
  }

  if (!window.confirm(
    `[${targetTx.itemName}] ${targetTx.qty}${targetTx.unit} 불출을 원복하시겠습니까?\n\n재고는 복구되고, 기존 불출 기록은 삭제되지 않습니다.`
  )) {
    return;
  }

  try {
    const marker = `MRO_REVERSED_OUT:${String(targetTx.id)}`;
    const nextReason = String(targetTx.reason || "").includes(marker)
      ? targetTx.reason
      : `${String(targetTx.reason || "").trim()}${String(targetTx.reason || "").trim() ? " | " : ""}${marker}`;

    const nextItems = items.map((i) =>
      String(i.code).replace(/[\r\n]+/g, "").trim() === String(targetTx.itemCode).replace(/[\r\n]+/g, "").trim()
        ? { ...i, stock: Number(i.stock) + Number(targetTx.qty) }
        : i
    );

    const nextTxs = txs.map((t) => (t.id === targetTx.id ? { ...t, reason: nextReason } : t));

    if (supabase) {
      const reverseTx = { ...targetTx, reason: nextReason };
      await applyStockTransactionsAtomic([{ code: targetTx.itemCode, delta: Number(targetTx.qty), txUpdate: reverseTx }]);
      try {
        await reloadItems();
        await reloadTxs();
      } catch (reloadErr) {
        console.error("원복 후 새로고침 실패(잠시 후 자동으로 갱신됩니다):", reloadErr);
      }
    } else {
      await saveItems(nextItems);
      await saveTxs(nextTxs);
    }

    notify(
      `출고가 원복되었습니다. 재고 ${targetTx.qty}${targetTx.unit}가 복원되었으며 원복완료로 처리되었습니다.`,
      "info"
    );
  } catch (e) {
    console.error("원복 처리 오류:", e);
    notify("이력 원복 중 오류가 발생했습니다.", "err");
  }
};

  const deleteHistory = async (targetTx) => {
  if (!window.confirm(
    `[${targetTx.itemName}] 출고 이력을 목록에서 삭제하시겠습니까?\n\nDB 기록은 보존되며 재고에는 영향이 없습니다.`
  )) {
    return;
  }

  try {
    if (supabase) {
      const { error } = await supabase
        .from("transactions")
        .update({ deleted: true })
        .eq("id", targetTx.id);

      if (error) {
        console.error("출고 이력 삭제 오류:", error);
        notify("삭제 처리에 실패했습니다.", "err");
        return;
      }
    }

    const nextTxs = txs.filter((t) => t.id !== targetTx.id);
    await saveTxs(nextTxs);
    notify("출고 이력이 목록에서 삭제되었습니다. DB 기록과 재고는 유지됩니다.", "info");
  } catch (e) {
    console.error("Soft Delete 오류:", e);
    notify("삭제 처리 중 오류가 발생했습니다.", "err");
  }
};

  return (
    <div>
      <Header title="출고 (QR / 바코드 스캔)" subtitle="스캔으로 빠르게 불출 처리" />
      <div className="outform-grid">
        <Card neon="#F5A623" style={{ padding: 22 }}>
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
              <div style={{ fontSize: 11.5, color: "#5E86A3", marginTop: 10 }}>
                주변에 QR코드가 여러 개 있다면, 인식하려는 코드 하나만 사각 박스 안에 딱 맞춰주세요.
              </div>
              <Btn onClick={stopCamera} variant="ghost" style={{ marginTop: 12, width: "100%" }}>
                카메라 끄기
              </Btn>
            </div>
          )}
        </Card>

        {favoriteItems.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            padding: "10px 14px", background: "#0F2233", border: "1px solid #1F3B54",
            borderRadius: 10,
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#5E86A3", flexShrink: 0 }}>
              <Star size={13} color="#F5A623" fill="#F5A623" />즐겨찾기
            </span>
            {favoriteItems.map((item) => {
              const isActive = found && String(found.code).trim() === String(item.code).trim();
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => selectFavoriteItem(item)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 11px 5px 5px",
                    borderRadius: 999,
                    border: isActive ? "1px solid #38BDF8" : "1px solid #274460",
                    background: isActive ? "rgba(56,189,248,0.15)" : "transparent",
                    color: isActive ? "#38BDF8" : "#A9BBCC",
                    fontSize: 11.5,
                    fontFamily: "IBM Plex Mono",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <span style={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                      background: "#152C42", display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <ImageIcon size={12} color="#3E5975" />
                    </span>
                  )}
                  {item.name}
                </button>
              );
            })}
          </div>
        )}

        <Card ref={infoCardRef} neon="#F5A623" style={{ padding: 22 }}>
          <SectionLabel>2. 불출 정보 입력</SectionLabel>
          {!found ? (
            <EmptyState icon={ScanLine} text="먼저 자재를 스캔하거나 선택해주세요." color="#5E86A3" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, background: "#0B1C2C", borderRadius: 8, border: "1px solid #274460" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {found.image_url ? (
                    <img src={found.image_url} alt={found.name} style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ flexShrink: 0 }}><Led status={statusOf(found)} size={12} /></div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#38BDF8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {found.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: "#7F97AC", fontFamily: "IBM Plex Mono", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      코드: {found.code} | {found.manufacturer || "업체 미지정"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontFamily: "IBM Plex Mono", paddingLeft: 8, borderLeft: "1px solid #1F3B54", flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: found.stock > 0 ? "#35D08C" : "#EF5350" }}>
                      {found.stock} <span style={{ fontSize: 12 }}>{found.unit}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "#5E86A3" }}>현재고</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, borderTop: "1px solid #1F3B54", paddingTop: 10 }}>
                  <UrgentRequestButton item={found} requests={urgentRequests} addRequest={addUrgentRequest} notify={notify} size="small" />
                  <button
                    type="button"
                    onClick={() => toggleFavorite(found.code)}
                    aria-label="즐겨찾기 토글"
                    style={{
                      flexShrink: 0, background: "none", border: "none", cursor: "pointer",
                      padding: 4, display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Star
                      size={20}
                      color={isFavorite(found.code) ? "#F5A623" : "#3E5975"}
                      fill={isFavorite(found.code) ? "#F5A623" : "none"}
                    />
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="1. 호선">
                  <AutocompleteInput
                    value={shipNo}
                    onChange={setShipNo}
                    options={shipOptions}
                    placeholder="예: H-2024 (직접 입력 또는 목록 검색)"
                  />
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
                disabled={outSubmitting || !qty || Number(qty) <= 0 || Number(qty) > found.stock} 
                style={{ 
                  marginTop: 8, width: "100%", 
                  background: (outSubmitting || !qty || Number(qty) <= 0 || Number(qty) > found.stock) ? "#1F3B54" : "#F5A623",
                  color: (outSubmitting || !qty || Number(qty) <= 0 || Number(qty) > found.stock) ? "#5E86A3" : "#0A1622",
                  fontWeight: "bold", fontSize: 15
                }}
              >
                <ArrowUpFromLine size={18} />{outSubmitting ? "처리 중..." : "출고 확정"}
              </Btn>
            </div>
          )}
        </Card>

        <Card neon="#F5A623" style={{ padding: 16 }}>
          <SectionLabel>최근 등록된 출고 이력 (잘못 등록 시 삭제/원복)</SectionLabel>
        {recentOutTxs.length === 0 ? (
          <EmptyState icon={ScanLine} text="최근 등록된 출고 내역이 없습니다." color="#5E86A3" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10, maxHeight: 560, overflowY: "auto" }}>
            {recentOutTxs.map((t) => (
              <div
                key={t.id}
                style={{
                  background: "#0B1C2C", border: "1px solid #1F3B54", borderRadius: 8,
                  padding: "9px 14px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
                }}
              >
                <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "#38BDF8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.itemName}
                  </div>
                  <div style={{ fontSize: 10.5, color: "#5E86A3", fontFamily: "IBM Plex Mono", marginTop: 1 }}>{t.at}</div>
                </div>

                <div style={{ display: "flex", gap: 20, fontSize: 12, flexShrink: 0 }}>
                  <div>
                    <span style={{ color: "#5E86A3", fontSize: 10.5, display: "block" }}>수량</span>
                    <span style={{ fontFamily: "IBM Plex Mono", fontWeight: 700, color: "#F5A623" }}>{t.qty} {t.unit}</span>
                  </div>
                  <div>
                    <span style={{ color: "#5E86A3", fontSize: 10.5, display: "block" }}>호선</span>
                    <span style={{ color: "#9FB4C7" }}>{t.shipNo || "-"}</span>
                  </div>
                  <div>
                    <span style={{ color: "#5E86A3", fontSize: 10.5, display: "block" }}>프로젝트</span>
                    <span style={{ color: "#9FB4C7" }}>{t.project || "-"}</span>
                  </div>
                  <div>
                    <span style={{ color: "#5E86A3", fontSize: 10.5, display: "block" }}>불출자</span>
                    <span style={{ color: "#9FB4C7" }}>{t.worker || "-"}</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: "auto" }}>
                  <button
                    onClick={() => cancelOutTx(t)}
                    disabled={isReversedOutTx(t)}
                    style={{
                      background: isReversedOutTx(t) ? "#26352D" : "#123626",
                      border: `1px solid ${isReversedOutTx(t) ? "#607D6B" : "#2ECC71"}`,
                      color: isReversedOutTx(t) ? "#8FA69A" : "#2ECC71",
                      padding: "5px 11px",
                      borderRadius: 6,
                      cursor: isReversedOutTx(t) ? "not-allowed" : "pointer",
                      fontSize: 11.5,
                      fontWeight: 600,
                      opacity: isReversedOutTx(t) ? 0.8 : 1,
                    }}
                  >
                    {isReversedOutTx(t) ? "원복완료" : "원복"}
                  </button>
                  <button
                    onClick={() => deleteHistory(t)}
                    style={{ background: "#3A1C1C", border: "1px solid #EF5350", color: "#EF5350", padding: "5px 11px", borderRadius: 6, cursor: "pointer", fontSize: 11.5, fontWeight: 600 }}
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
    </div>
  );
}

/* ---------------- 자재 반납 ---------------- */
const RETURN_REASONS = ["미사용 잔량", "수량 착오", "자재 상이", "프로젝트 취소/변경", "기타"];

function ReturnView({ items, saveItems, txs, saveTxs, notify, outFormSettings }) {
  const [mode, setMode] = useState("history"); // "history" | "manual"

  // 공통 입력값
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [worker, setWorker] = useState("");
  const [note, setNote] = useState("");

  // 이력 기반 모드
  const [historySearch, setHistorySearch] = useState("");
  const [selectedOutTx, setSelectedOutTx] = useState(null);

  // 자재 직접 입력 모드
  const [manualCode, setManualCode] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualUnit, setManualUnit] = useState("EA");
  const [manualShip, setManualShip] = useState("");
  const [manualProject, setManualProject] = useState("");
  const [returnComplete, setReturnComplete] = useState(null);
  const [returnShipFilter, setReturnShipFilter] = useState("전체");

  const shipOptions = outFormSettings?.ships || [];
  const projectOptions = outFormSettings?.projects || [];

  /* 직접 입력한 코드가 기존 자재인지 자동 확인.
     기존 자재면 기존 재고에 반납하고, 없으면 반납 확정 시 자재마스터에도 신규 등록합니다. */
  const matchedManualItem = useMemo(() => {
    const code = manualCode.trim();
    if (!code) return null;
    return (items || []).find((i) => String(i.code || "").trim() === code) || null;
  }, [items, manualCode]);

  const manualTargetName = matchedManualItem?.name || manualName.trim();
  const manualTargetUnit = matchedManualItem?.unit || manualUnit || "EA";
  const isNewManualItem = !!manualCode.trim() && !matchedManualItem;

  /* 출고건별 이미 반납된 누적 수량 계산 */
  const returnedQtyByOutTxId = useMemo(() => {
    const map = {};
    (txs || []).forEach((t) => {
      if (t.type === "return" && t.linkedOutTxId) {
        map[t.linkedOutTxId] = (map[t.linkedOutTxId] || 0) + (Number(t.qty) || 0);
      }
    });
    return map;
  }, [txs]);

  const outTxList = useMemo(() => {
    const parseAt = (t) => {
      const d = new Date(String(t.at || "").replace(" ", "T"));
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    };
    const q = historySearch.trim().toLowerCase();
    return (txs || [])
      .filter((t) => t.type === "out")
      .filter((t) => isRawMaterial(t.itemCode)) // 원자재만 반납 대상
      .filter((t) => {
        if (!q) return true;
        return (
          String(t.itemName || "").toLowerCase().includes(q) ||
          String(t.itemCode || "").toLowerCase().includes(q) ||
          String(t.shipNo || "").toLowerCase().includes(q)
        );
      })
      .map((t) => ({ ...t, returned: returnedQtyByOutTxId[t.id] || 0 }))
      .filter((t) => t.returned < Number(t.qty))
      .sort((a, b) => parseAt(b) - parseAt(a))
      .slice(0, 40);
  }, [txs, historySearch, returnedQtyByOutTxId]);

  const availableReturnShips = useMemo(() => {
    const ships = (txs || [])
      .filter((t) => t.type === "return" && t.shipNo && t.shipNo.trim())
      .map((t) => t.shipNo);
    return ["전체", ...Array.from(new Set(ships))];
  }, [txs]);

  const recentReturnTxs = useMemo(() => {
    const parseAt = (t) => {
      const d = new Date(String(t.at || "").replace(" ", "T"));
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    };
    return (txs || [])
      .filter((t) => t.type === "return")
      .filter((t) => returnShipFilter === "전체" || t.shipNo === returnShipFilter)
      .sort((a, b) => parseAt(b) - parseAt(a))
      .slice(0, 30);
  }, [txs, returnShipFilter]);

  const exportReturnCSV = () => {
    const allReturnTxs = (txs || [])
      .filter((t) => t.type === "return")
      .filter((t) => returnShipFilter === "전체" || t.shipNo === returnShipFilter)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));

    if (allReturnTxs.length === 0) {
      notify("다운로드할 반납 이력이 없습니다.", "err");
      return;
    }

    const headers = ["날짜,자재명,코드,수량,단위,호선,프로젝트,반납사유,반납자,비고\n"];
    const rows = allReturnTxs.map((t) =>
      `"${t.at}","${csvSafe(t.itemName)}","${csvSafe(t.itemCode)}",${t.qty},"${t.unit}","${csvSafe(t.shipNo)}","${csvSafe(t.project)}","${csvSafe(t.reason)}","${csvSafe(t.worker)}","${csvSafe(t.note)}"\n`
    );
    const blob = new Blob(["\uFEFF" + headers + rows.join("")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const shipLabel = returnShipFilter === "전체" ? "전체" : returnShipFilter;
    link.download = `MRO_원자재반납기록_${shipLabel}_${nowStr().split(" ")[0]}.csv`;
    link.click();
    notify("반납 이력이 엑셀(CSV)로 다운로드 되었습니다.", "ok");
  };

  const selectOutTx = (t) => {
    setSelectedOutTx(t);
    setQty("");
  };

  const maxReturnQty = selectedOutTx ? Number(selectedOutTx.qty) - (returnedQtyByOutTxId[selectedOutTx.id] || 0) : null;

  const resetForm = () => {
    setQty(""); setReason(RETURN_REASONS[0]); setNote("");
    setSelectedOutTx(null); setHistorySearch("");
    setManualCode(""); setManualName(""); setManualUnit("EA"); setManualShip(""); setManualProject("");
  };

  const submit = async () => {
    let targetItem = mode === "history"
      ? (selectedOutTx && items.find((i) => String(i.code).trim() === String(selectedOutTx.itemCode).trim()))
      : matchedManualItem;

    if (mode === "history" && !selectedOutTx) { notify("반납할 출고 이력을 선택해주세요.", "err"); return; }

    let finalManualCode = manualCode.trim();
    if (mode === "manual") {
      if (!manualName.trim() && !matchedManualItem) { notify("자재명을 입력해주세요.", "err"); return; }
      if (matchedManualItem && !isRawMaterial(matchedManualItem.code)) {
        notify("부자재 코드는 원자재 반납 대상이 아닙니다.", "err");
        return;
      }
      if (!matchedManualItem) {
        if (!finalManualCode) {
          finalManualCode = `1-${uid("ITEM")}`;
        } else if (!finalManualCode.startsWith("1-")) {
          finalManualCode = `1-${finalManualCode}`;
        }
      }
    }

    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) { notify("반납 수량을 입력해주세요.", "err"); return; }
    if (mode === "history" && qtyNum > maxReturnQty) {
      notify(`반납 가능 수량(${maxReturnQty}${selectedOutTx.unit})을 초과했습니다.`, "err");
      return;
    }
    if (!worker.trim()) { notify("반납자를 입력해주세요.", "err"); return; }

    // 미등록 자재라면 반납 확정과 동시에 자재마스터에 신규 등록
    if (mode === "manual" && !matchedManualItem) {
      targetItem = {
        code: finalManualCode,
        name: manualName.trim(),
        spec: "",
        unit: manualUnit || "EA",
        stock: 0,
        safety: 0,
        location: "",
        manufacturer: "",
        category: "원자재",
        image_url: "",
        deleted: false,
      };
    }

    if (!targetItem) { notify("입력한 자재 정보를 확인해주세요.", "err"); return; }

    const nextItems = matchedManualItem
      ? items.map((i) =>
          String(i.code).trim() === String(targetItem.code).trim()
            ? { ...i, stock: (Number(i.stock) || 0) + qtyNum }
            : i
        )
      : mode === "manual"
        ? [{ ...targetItem, stock: qtyNum }, ...items]
        : items.map((i) =>
            String(i.code).trim() === String(targetItem.code).trim()
              ? { ...i, stock: (Number(i.stock) || 0) + qtyNum }
              : i
          );

    const tx = {
      id: uid("RET"),
      type: "return",
      itemCode: targetItem.code,
      itemName: targetItem.name,
      unit: targetItem.unit,
      qty: qtyNum,
      shipNo: mode === "history" ? (selectedOutTx.shipNo || "") : (manualShip || ""),
      project: mode === "history" ? (selectedOutTx.project || "") : (manualProject || ""),
      reason,
      worker: worker.trim(),
      note: note.trim(),
      linkedOutTxId: mode === "history" ? selectedOutTx.id : null,
      at: nowStr(),
      deleted: false,
    };

    if (supabase) {
      await applyStockTransactionsAtomic([{
        code: targetItem.code,
        delta: qtyNum,
        tx,
        newItem: mode === "manual" && !matchedManualItem ? { ...targetItem, stock: 0 } : null,
      }]);
      await reloadItems();
      await reloadTxs();
    } else {
      await saveItems(nextItems);
      await saveTxs([...(txs || []), tx]);
    }

    const completion = {
      itemName: targetItem.name,
      itemCode: targetItem.code,
      qty: qtyNum,
      unit: targetItem.unit,
      shipNo: tx.shipNo || "-",
      project: tx.project || "-",
      worker: tx.worker || "-",
      reason: tx.reason || "-",
      isNew: mode === "manual" && !matchedManualItem,
    };

    notify(
      `${targetItem.name} ${qtyNum}${targetItem.unit} 반납 완료 · ${matchedManualItem ? "기존 자재 재고 반영" : mode === "manual" ? "신규 자재도 마스터에 등록" : "재고 반영"}`,
      "ok"
    );
    resetForm();
    setReturnComplete(completion);
  };

  const cancelReturnTx = async (targetTx) => {
    if (!window.confirm(`[${targetTx.itemName}] ${targetTx.qty}${targetTx.unit} 반납 내역을 취소하시겠습니까? (재고에서 다시 차감됩니다)`)) {
      return;
    }
    const nextItems = items.map((i) =>
      String(i.code).trim() === String(targetTx.itemCode).trim()
        ? { ...i, stock: Math.max(0, Number(i.stock) - Number(targetTx.qty)) }
        : i
    );
    const nextTxs = (txs || []).filter((t) => t.id !== targetTx.id);

    if (supabase) {
      await applyStockTransactionsAtomic([{ code: targetTx.itemCode, delta: -Number(targetTx.qty), txDeleteId: targetTx.id }]);
      await reloadItems();
      await reloadTxs();
    } else {
      await saveItems(nextItems);
      await saveTxs(nextTxs);
    }
    notify(`반납이 취소되어 재고 ${targetTx.qty}${targetTx.unit}가 다시 차감되었습니다.`, "info");
  };

  const modeBtnStyle = (active) => ({
    flex: 1, padding: "10px 14px", borderRadius: 8, cursor: "pointer",
    border: active ? "1px solid #22D3EE" : "1px solid #274460",
    background: active ? "#22D3EE1f" : "#0B1C2C",
    color: active ? "#22D3EE" : "#7F97AC",
    fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 13,
  });

  return (
    <div>
      <Header title="원자재 반납" subtitle="출고된 원자재(코드 1-)의 미사용분·오출고분을 반납합니다 · 미등록 자재도 직접 입력하여 등록할 수 있습니다" />
      <div className="outform-grid">
        <Card neon="#22D3EE" style={{ padding: 22 }}>
          <SectionLabel>1. 반납 대상 선택</SectionLabel>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button type="button" style={modeBtnStyle(mode === "manual")} onClick={() => { setMode("manual"); resetForm(); }}>
              자재 직접 입력
            </button>
            <button type="button" style={modeBtnStyle(mode === "history")} onClick={() => { setMode("history"); resetForm(); }}>
              출고 이력에서 선택
            </button>
          </div>

          {mode === "history" ? (
            <div>
              <input
                style={{ ...inputStyle, marginBottom: 10 }}
                placeholder="자재명, 코드, 호선으로 검색"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto" }}>
                {outTxList.length === 0 ? (
                  <EmptyState icon={ArrowUpFromLine} text="반납 가능한 출고 이력이 없습니다." color="#5E86A3" />
                ) : (
                  outTxList.map((t) => {
                    const active = selectedOutTx && selectedOutTx.id === t.id;
                    const remain = Number(t.qty) - t.returned;
                    return (
                      <div
                        key={t.id}
                        onClick={() => selectOutTx(t)}
                        style={{
                          padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                          border: active ? "1px solid #22D3EE" : "1px solid #1F3B54",
                          background: active ? "#22D3EE14" : "#0B1C2C",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13.5, color: "#38BDF8", lineHeight: 1.35 }}>
                              {t.itemName}
                            </div>
                            <div style={{ fontSize: 11, color: "#7F97AC", fontFamily: "IBM Plex Mono", marginTop: 2 }}>
                              {t.shipNo || "-"} · {t.project || "-"} · {t.at}
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0, fontFamily: "IBM Plex Mono" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#22D3EE" }}>{remain}{t.unit}</div>
                            <div style={{ fontSize: 10, color: "#5E86A3" }}>반납가능(출고 {t.qty}{t.unit})</div>
                          </div>
                        </div>
                        {t.returned > 0 && (
                          <div style={{ fontSize: 10.5, color: "#F5A623", marginTop: 6 }}>
                            ※ 이미 {t.returned}{t.unit} 반납됨
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ padding: "10px 12px", background: "#22D3EE0d", border: "1px solid #22D3EE33", borderRadius: 8, color: "#9FB4C7", fontSize: 11.5, lineHeight: 1.5 }}>
                등록된 자재를 검색하지 않고 <strong style={{ color: "#22D3EE" }}>자재명만 입력</strong>해도 반납 등록이 가능합니다.<br />
                자재코드는 비워두면 자동 생성되며(항상 <strong style={{ color: "#22D3EE" }}>1-</strong>로 시작), 기존 코드를 입력하면 기존 자재 재고에 반영됩니다.
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 10 }}>
                <Field label="자재코드 (선택, 비워두면 자동 생성)">
                  <input
                    style={inputStyle}
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="비워두면 자동 생성 · 입력 시 앞에 1- 자동 부착"
                    autoComplete="off"
                  />
                </Field>
                <Field label="자재명">
                  <input
                    style={inputStyle}
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="예: 케이블 글랜드"
                    disabled={!!matchedManualItem}
                  />
                </Field>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="단위">
                  <input
                    style={inputStyle}
                    value={matchedManualItem?.unit || manualUnit}
                    onChange={(e) => setManualUnit(e.target.value.toUpperCase())}
                    placeholder="EA"
                    disabled={!!matchedManualItem}
                  />
                </Field>
                <Field label={`반납 수량 (${manualTargetUnit})`}>
                  <input
                    style={{ ...inputStyle, fontWeight: "bold", color: "#22D3EE" }}
                    type="number"
                    min="1"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    placeholder="수량 입력"
                  />
                </Field>
              </div>

              {matchedManualItem ? (
                <div style={{ padding: "10px 12px", borderRadius: 8, background: "#35D08C12", border: "1px solid #35D08C55", color: "#35D08C", fontSize: 12, lineHeight: 1.5 }}>
                  ✓ 등록된 자재입니다. <strong>{matchedManualItem.name}</strong> / 현재고 {matchedManualItem.stock}{matchedManualItem.unit}<br />
                  반납 확정 시 기존 자재의 재고에 반납 수량이 더해집니다.
                </div>
              ) : (manualCode.trim() || manualName.trim()) ? (
                <div style={{ padding: "10px 12px", borderRadius: 8, background: "#F5A62312", border: "1px solid #F5A62355", color: "#F5A623", fontSize: 12, lineHeight: 1.5 }}>
                  + 미등록 자재입니다. 반납 확정하면 <strong>{manualName.trim() || "입력한 자재"}</strong>가 자재마스터에 신규 등록됩니다.
                </div>
              ) : null}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="호선 (선택)">
                  <AutocompleteInput value={manualShip} onChange={setManualShip} options={shipOptions} placeholder="예: H-2024" />
                </Field>
                <Field label="프로젝트 (선택)">
                  <Select value={manualProject || projectOptions[0] || ""} onChange={(e) => setManualProject(e.target.value)} options={projectOptions.length ? projectOptions : ["-"]} />
                </Field>
              </div>

              {/* 직접입력 모드에서 누락되었던 반납 정보 입력 항목을 원래 위치로 복원 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="반납 사유">
                  <Select value={reason} onChange={(e) => setReason(e.target.value)} options={RETURN_REASONS} />
                </Field>
                <Field label="반납자">
                  <input style={inputStyle} value={worker} onChange={(e) => setWorker(e.target.value)} placeholder="이름 입력" />
                </Field>
              </div>

              <Field label="비고 (선택)">
                <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 규격 상이로 미사용" />
              </Field>

              <Btn
                onClick={submit}
                disabled={(!manualName.trim() && !matchedManualItem) || !qty}
                style={{ marginTop: 4, width: "100%", background: "#22D3EE", border: "1px solid #22D3EE", color: "#0A1622", fontWeight: "bold", fontSize: 15 }}
              >
                <RotateCcw size={18} />반납 확정
              </Btn>
            </div>
          )}
        </Card>

        <Card neon="#22D3EE" style={{ padding: 22 }}>
          <SectionLabel>2. 반납 정보 입력</SectionLabel>
          {(mode === "history" && !selectedOutTx) || (mode === "manual" && !manualName.trim() && !matchedManualItem) ? (
            <EmptyState icon={RotateCcw} text="먼저 반납할 자재 정보를 입력해주세요." color="#5E86A3" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ padding: 14, background: "#0B1C2C", borderRadius: 8, border: "1px solid #274460" }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#38BDF8", lineHeight: 1.35 }}>
                  {mode === "history" ? selectedOutTx.itemName : manualTargetName}
                </div>
                <div style={{ fontSize: 11.5, color: "#7F97AC", fontFamily: "IBM Plex Mono", marginTop: 4 }}>
                  {mode === "history"
                    ? `호선 ${selectedOutTx.shipNo || "-"} · 프로젝트 ${selectedOutTx.project || "-"} · 반납가능 ${maxReturnQty}${selectedOutTx.unit}`
                    : matchedManualItem
                      ? `코드: ${matchedManualItem.code} · 현재고 ${matchedManualItem.stock}${matchedManualItem.unit}`
                      : `코드: ${manualCode.trim() ? (manualCode.trim().startsWith("1-") ? manualCode.trim() : `1-${manualCode.trim()}`) : "자동 생성(1-...)"} · 신규 자재 · 단위 ${manualUnit || "EA"}`}
                </div>
              </div>

              {mode === "history" && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Field label={`반납 수량 (${selectedOutTx.unit})`}>
                      <input
                        style={{ ...inputStyle, fontWeight: "bold", color: "#22D3EE" }}
                        type="number" min="1" max={maxReturnQty}
                        value={qty} onChange={(e) => setQty(e.target.value)} placeholder="수량 입력"
                      />
                    </Field>
                    <Field label="반납 사유">
                      <Select value={reason} onChange={(e) => setReason(e.target.value)} options={RETURN_REASONS} />
                    </Field>
                  </div>

                  <Field label="반납자">
                    <input style={inputStyle} value={worker} onChange={(e) => setWorker(e.target.value)} placeholder="이름 입력" />
                  </Field>

                  <Field label="비고 (선택)">
                    <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 규격 상이로 미사용" />
                  </Field>

                  <Btn
                    onClick={submit}
                    style={{ marginTop: 8, width: "100%", background: "#22D3EE", border: "1px solid #22D3EE", color: "#0A1622", fontWeight: "bold", fontSize: 15 }}
                  >
                    <RotateCcw size={18} />반납 확정
                  </Btn>
                </>
              )}
            </div>
          )}
        </Card>

        <Card neon="#22D3EE" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: "0.14em",
              color: "#5E86A3", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ width: 14, height: 2, background: "#F5A623", display: "inline-block" }} />
              최근 반납 이력 (잘못 등록 시 취소)
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <select
                value={returnShipFilter}
                onChange={(e) => setReturnShipFilter(e.target.value)}
                style={{
                  background: "#0B1C2C", border: "1px solid #274460", color: "#22D3EE",
                  padding: "6px 10px", borderRadius: 6, fontSize: 12, fontWeight: "bold",
                  outline: "none", cursor: "pointer",
                }}
              >
                {availableReturnShips.map((ship) => (
                  <option key={ship} value={ship}>{ship}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={exportReturnCSV}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8,
                  border: "1px solid #35D08C88", background: "#35D08C1f", color: "#35D08C",
                  fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace",
                  whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                <Download size={13} />엑셀 다운로드
              </button>
            </div>
          </div>
          {recentReturnTxs.length === 0 ? (
            <EmptyState icon={RotateCcw} text="최근 등록된 반납 내역이 없습니다." color="#5E86A3" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10, maxHeight: 560, overflowY: "auto" }}>
              {recentReturnTxs.map((t) => (
                <div
                  key={t.id}
                  style={{
                    background: "#0B1C2C", border: "1px solid #1F3B54", borderRadius: 8,
                    padding: "9px 14px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: "#38BDF8", lineHeight: 1.35 }}>
                      {t.itemName}
                    </div>
                    <div style={{ fontSize: 10.5, color: "#5E86A3", fontFamily: "IBM Plex Mono", marginTop: 1 }}>
                      {t.reason} · {t.at}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 20, fontSize: 12, flexShrink: 0 }}>
                    <div>
                      <span style={{ color: "#5E86A3", fontSize: 10.5, display: "block" }}>수량</span>
                      <span style={{ fontFamily: "IBM Plex Mono", fontWeight: 700, color: "#22D3EE" }}>{t.qty} {t.unit}</span>
                    </div>
                    <div>
                      <span style={{ color: "#5E86A3", fontSize: 10.5, display: "block" }}>호선</span>
                      <span style={{ color: "#9FB4C7" }}>{t.shipNo || "-"}</span>
                    </div>
                    <div>
                      <span style={{ color: "#5E86A3", fontSize: 10.5, display: "block" }}>반납자</span>
                      <span style={{ color: "#9FB4C7" }}>{t.worker || "-"}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => cancelReturnTx(t)}
                    style={{ background: "#3A1C1C", border: "1px solid #EF5350", color: "#EF5350", padding: "5px 11px", borderRadius: 6, cursor: "pointer", fontSize: 11.5, fontWeight: 600, marginLeft: "auto", flexShrink: 0 }}
                  >
                    취소
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {returnComplete && (
        <div
          className="app-modal-overlay"
          onClick={() => setReturnComplete(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(6,14,22,0.78)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 430, background: "#0F2233",
              border: "1px solid #35D08C66", borderRadius: 16, padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{
                width: 58, height: 58, margin: "0 auto 12px", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "#35D08C18", border: "1px solid #35D08C66",
              }}>
                <CheckCircle2 size={32} color="#35D08C" />
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#35D08C" }}>반납 등록 완료</div>
              <div style={{ marginTop: 5, fontSize: 12, color: "#7F97AC" }}>반납 내역과 재고가 정상적으로 반영되었습니다.</div>
            </div>

            <div style={{
              background: "#0B1C2C", border: "1px solid #274460", borderRadius: 10,
              padding: 14, display: "flex", flexDirection: "column", gap: 10, marginBottom: 18,
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#38BDF8" }}>{returnComplete.itemName}</div>
              <div style={{ fontSize: 11, color: "#5E86A3", fontFamily: "IBM Plex Mono" }}>코드: {returnComplete.itemCode}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: "#5E86A3" }}>반납 수량</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#22D3EE", fontFamily: "IBM Plex Mono" }}>{returnComplete.qty} {returnComplete.unit}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: "#5E86A3" }}>반납자</div>
                  <div style={{ fontSize: 13, color: "#E7EEF5", marginTop: 3 }}>{returnComplete.worker}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#9FB4C7", lineHeight: 1.6 }}>
                호선: {returnComplete.shipNo} · 프로젝트: {returnComplete.project}<br />
                사유: {returnComplete.reason}
              </div>
              {returnComplete.isNew && (
                <div style={{
                  padding: "8px 10px", borderRadius: 7, background: "#F5A62312",
                  border: "1px solid #F5A62355", color: "#F5A623", fontSize: 11.5,
                }}>
                  신규 자재가 자재마스터에 등록되었습니다.
                </div>
              )}
            </div>

            <Btn
              onClick={() => setReturnComplete(null)}
              style={{ width: "100%", background: "#35D08C", border: "1px solid #35D08C", color: "#07151F", fontWeight: 800, fontSize: 14 }}
            >
              <CheckCircle2 size={17} /> 확인
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 재고 조회 ---------------- */
function StockView({ items, saveItems, onSelectItem, notify, urgentRequests, addUrgentRequest }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [memoDrafts, setMemoDrafts] = useState({});
  const { isFavorite, toggleFavorite } = useFavoriteItems(notify);

  // 자재마스터에 실제 지정된 카테고리만 자동으로 필터 버튼으로 표시합니다.
  const categoryOptions = useMemo(() => {
    const set = new Set();
    items.forEach((item) => {
      const value = String(item.category || "").trim();
      if (value) set.add(value);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [items]);

  useEffect(() => {
    if (categoryFilter !== "all" && !categoryOptions.includes(categoryFilter)) {
      setCategoryFilter("all");
    }
  }, [categoryFilter, categoryOptions]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchSearch =
        !search ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.code.toLowerCase().includes(search.toLowerCase()) ||
        (item.manufacturer && item.manufacturer.toLowerCase().includes(search.toLowerCase())) ||
        (item.memo && item.memo.toLowerCase().includes(search.toLowerCase()));

      const itemCategory = String(item.category || "").trim();
      const matchCategory =
        categoryFilter === "all" || itemCategory === categoryFilter;

      return matchSearch && matchCategory;
    });
  }, [items, search, categoryFilter]);

  const handleCardClick = (item) => {
    if (onSelectItem) {
      onSelectItem(item);
    }
  };

  const handleMemoChange = (code, value) => {
    setMemoDrafts((prev) => ({ ...prev, [code]: value }));
  };

  const handleMemoSave = async (item, value) => {
    const nextMemo = String(value ?? "").trim();
    const currentMemo = String(item.memo ?? "").trim();
    if (nextMemo === currentMemo) {
      setMemoDrafts((prev) => { const next = { ...prev }; delete next[item.code]; return next; });
      return;
    }

    try {
      if (supabase) {
        const { error } = await supabase
          .from("items")
          .update({ memo: nextMemo })
          .eq("code", item.code);
        if (error) throw error;
      }

      const nextItems = items.map((i) =>
        i.code === item.code ? { ...i, memo: nextMemo } : i
      );
      await saveItems(nextItems);
      setMemoDrafts((prev) => { const next = { ...prev }; delete next[item.code]; return next; });
      notify("명칭/메모가 저장되었습니다.", "ok");
    } catch (e) {
      console.error("Stock memo save error:", e);
      notify("명칭/메모 저장에 실패했습니다.", "err");
    }
  };

  return (
    <div>
      <Header title="재고 현황 조회" subtitle="전체 자재 실시간 재고 및 안전재고 파악 (자재 클릭 시 출고창 이동)" />

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
              ...categoryOptions.map((category) => ({ id: category, label: category })),
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setCategoryFilter(f.id)}
                style={{
                  padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: "bold",
                  border: categoryFilter === f.id ? "1px solid #38BDF8" : "1px solid #1F3B54",
                  background: categoryFilter === f.id ? "#1E3A5F" : "#0B1C2C",
                  color: categoryFilter === f.id ? "#38BDF8" : "#7F97AC",
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
              <Card
                key={item.code}
                style={{ padding: 14, cursor: "pointer" }}
                onClick={() => handleCardClick(item)}
              >
                {/* PC: 기존 배치 그대로 유지 */}
                <div className="stock-card-pc-layout" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} style={{ width: 50, height: 50, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 50, height: 50, borderRadius: 8, background: "#0B1C2C", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <ImageIcon size={20} color="#5E86A3" />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Led status={st} size={10} />
                      <span
                        className="stock-item-name"
                        title={item.name}
                        style={{
                          fontWeight: 700,
                          fontSize: 14,
                          color: "#38BDF8",
                          lineHeight: 1.35,
                          display: "-webkit-box",
                          WebkitBoxOrient: "vertical",
                          WebkitLineClamp: 3,
                          overflow: "hidden",
                          wordBreak: "break-word",
                          whiteSpace: "normal",
                        }}
                      >
                        {item.name}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "#7F97AC", fontFamily: "IBM Plex Mono", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>코드: {item.code}</div>
                    {item.manufacturer && (
                      <div style={{ fontSize: 11, color: "#5E86A3", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>제조사: {item.manufacturer}</div>
                    )}
                  </div>

                  <div style={{ textAlign: "right", fontFamily: "IBM Plex Mono", flexShrink: 0 }}>
                    <div style={{
                      fontSize: 16, fontWeight: 700,
                      color: st === "danger" ? "#EF5350" : st === "warn" ? "#F5A623" : "#35D08C",
                    }}>
                      {item.stock} <span style={{ fontSize: 11 }}>{item.unit}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "#5E86A3", marginTop: 2 }}>안전재고: {item.safety} {item.unit}</div>
                  </div>
                </div>

                <div className="stock-card-pc-layout" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, borderTop: "1px solid #1F3B54", marginTop: 10, paddingTop: 10 }}>
                  <UrgentRequestButton item={item} requests={urgentRequests} addRequest={addUrgentRequest} notify={notify} size="small" />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(item.code); }}
                    aria-label="즐겨찾기 토글"
                    style={{
                      flexShrink: 0, background: "none", border: "none", cursor: "pointer",
                      padding: 6, display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Star
                      size={19}
                      color={isFavorite(item.code) ? "#F5A623" : "#3E5975"}
                      fill={isFavorite(item.code) ? "#F5A623" : "none"}
                    />
                  </button>
                </div>

                {/* 모바일 전용: 사진 → 품명 / 사양·규격 → 메모·수량·즐겨찾기 */}
                <div className="stock-card-mobile-layout">
                  <div className="stock-mobile-top">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="stock-mobile-image" />
                    ) : (
                      <div className="stock-mobile-image stock-mobile-image-empty">
                        <ImageIcon size={22} color="#5E86A3" />
                      </div>
                    )}
                    <div className="stock-mobile-info">
                      <div className="stock-mobile-name-row">
                        <Led status={st} size={9} />
                        <span className="stock-mobile-name" title={item.name}>{item.name}</span>
                      </div>
                      <div className="stock-mobile-spec">
                        {item.spec ? `사양/규격: ${item.spec}` : "사양/규격: -"}
                      </div>
                    </div>
                  </div>

                  <div className="stock-mobile-bottom" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      className="stock-mobile-note"
                      placeholder="명칭 / 메모 입력"
                      aria-label={`${item.name} 명칭 또는 메모 입력`}
                      value={Object.prototype.hasOwnProperty.call(memoDrafts, item.code) ? memoDrafts[item.code] : (item.memo || "")}
                      onChange={(e) => handleMemoChange(item.code, e.target.value)}
                      onBlur={(e) => handleMemoSave(item, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="stock-mobile-actions">
                      <div className="stock-mobile-quantity" style={{
                        color: st === "danger" ? "#EF5350" : st === "warn" ? "#F5A623" : "#35D08C",
                      }}>
                        {item.stock} <span>{item.unit}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleFavorite(item.code)}
                        aria-label="즐겨찾기 토글"
                        className="stock-mobile-favorite"
                      >
                        <Star
                          size={20}
                          color={isFavorite(item.code) ? "#F5A623" : "#3E5975"}
                          fill={isFavorite(item.code) ? "#F5A623" : "none"}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <style>{`
        .stock-card-mobile-layout { display: none; }

        @media (max-width: 768px) {
          .stock-card-pc-layout { display: none !important; }
          .stock-card-mobile-layout {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .stock-mobile-top {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            min-width: 0;
          }
          .stock-mobile-image {
            width: 58px;
            height: 58px;
            border-radius: 8px;
            object-fit: cover;
            flex: 0 0 58px;
          }
          .stock-mobile-image-empty {
            background: #0B1C2C;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .stock-mobile-info {
            min-width: 0;
            flex: 1;
            padding-top: 1px;
          }
          .stock-mobile-name-row {
            display: flex;
            align-items: flex-start;
            gap: 6px;
            min-width: 0;
          }
          .stock-mobile-name {
            font-weight: 700;
            font-size: 14px;
            line-height: 1.35;
            color: #38BDF8;
            word-break: break-word;
            white-space: normal;
          }
          .stock-mobile-spec {
            margin-top: 7px;
            font-size: 11.5px;
            line-height: 1.4;
            color: #7F97AC;
            word-break: break-word;
            white-space: normal;
          }
          .stock-mobile-bottom {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
            padding-top: 2px;
          }
          .stock-mobile-note {
            flex: 1;
            min-width: 0;
            height: 34px;
            padding: 7px 9px;
            border-radius: 7px;
            border: 1px solid #274460;
            background: #0B1C2C;
            color: #E7EEF5;
            outline: none;
            font-size: 15px;
          }
          .stock-mobile-note::placeholder { color: #5E86A3; }
          .stock-mobile-note:focus { border-color: #38BDF8; }
          .stock-mobile-actions {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 7px;
            flex-shrink: 0;
          }
          .stock-mobile-quantity {
            font-family: "IBM Plex Mono", monospace;
            font-size: 16px;
            font-weight: 700;
            white-space: nowrap;
          }
          .stock-mobile-quantity span {
            font-size: 10.5px;
            font-weight: 500;
          }
          .stock-mobile-favorite {
            width: 32px;
            height: 32px;
            padding: 0;
            border: none;
            background: none;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
          }
        }
      `}</style>
    </div>
  );
}

/* ---------------- QR 라벨 엑셀 내보내기 ---------------- */
function loadExcelJS() {
  return new Promise((resolve, reject) => {
    if (window.ExcelJS) { resolve(window.ExcelJS); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
    script.async = true;
    script.onload = () => resolve(window.ExcelJS);
    script.onerror = () => reject(new Error("ExcelJS 로드 실패"));
    document.body.appendChild(script);
  });
}

function fetchQrBase64(code) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(code)}`;
  return fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error("QR 이미지 요청 실패");
      return res.blob();
    })
    .then((blob) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }));
}

async function buildQrLabelWorkbook(items) {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("QR라벨");
  sheet.columns = [{ width: 16 }, { width: 13 }, { width: 42 }];

  let row = 1;
  for (const item of items) {
    const startRow = row;
    const rows = [
      ["자재코드 :", item.code],
      ["품명   :", item.name],
      ["규격/사양:", item.spec || ""],
    ];
    rows.forEach(([label, value]) => {
      sheet.getCell(`B${row}`).value = label;
      sheet.getCell(`C${row}`).value = value;
      sheet.getCell(`C${row}`).font = { bold: true };
      ["A", "B", "C"].forEach((col) => {
        sheet.getCell(`${col}${row}`).border = {
          top: { style: "thin" }, left: { style: "thin" },
          bottom: { style: "thin" }, right: { style: "thin" },
        };
      });
      row++;
    });
    const endRow = row - 1;
    sheet.mergeCells(`A${startRow}:A${endRow}`);
    sheet.getCell(`A${startRow}`).alignment = { vertical: "middle", horizontal: "center" };

    try {
      const base64 = await fetchQrBase64(item.code);
      const imageId = workbook.addImage({ base64, extension: "png" });
      sheet.addImage(imageId, { tl: { col: 0, row: startRow - 1 }, br: { col: 1, row: endRow } });
    } catch (e) {
      console.error("QR 이미지 생성 실패:", item.code, e);
    }

    row = endRow + 2;
  }

  return workbook;
}

/* ---------------- 자재 마스터 관리 ---------------- */
function MasterView({ items, saveItems, notify, urgentRequests, resolveUrgentRequest, cartItems, addToCart, removeFromCart, clearCart }) {
  const blank = { code: "", name: "", spec: "", unit: "EA", stock: 0, safety: 0, location: "", manufacturer: "", category: "", memo: "", image_url: "" };
  const [form, setForm] = useState(blank);
  const [formMaterialType, setFormMaterialType] = useState("raw"); // "raw"(원자재) | "sub"(부자재)
  const [showForm, setShowForm] = useState(false);
  const [qrModalItem, setQrModalItem] = useState(null);

  /* 원자재 / 부자재 구분 탭 (자재코드 접두사 1-/2- 기준으로 필터링) */
  const [materialFilter, setMaterialFilter] = useState("all"); // "all" | "raw" | "sub"
  const displayedItems = useMemo(() => {
    if (materialFilter === "all") return items;
    return items.filter((i) => getMaterialType(i.code) === materialFilter);
  }, [items, materialFilter]);

  /* 경고 및 정보창(모달), 장바구니 모달 상태 */
  const [selectedUrgent, setSelectedUrgent] = useState(null);
  const [showCartModal, setShowCartModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const pendingUrgentList = useMemo(() => {
    return (urgentRequests || []).filter((r) => r.status === "pending");
  }, [urgentRequests]);

  const [uploadingImage, setUploadingImage] = useState(false);
  const liveCameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const [targetItemForPhoto, setTargetItemForPhoto] = useState(null);
  const editCameraInputRef = useRef(null);
  const editGalleryInputRef = useRef(null);

  const handleImageFileSelected = async (e, targetCode = null) => {
    const file = e.target.files[0];
    if (!file) return;

    const codeToUse = targetCode || form.code.trim();
    if (!codeToUse) {
      notify("자재 코드를 먼저 입력해야 사진을 첨부할 수 있습니다.", "err");
      e.target.value = "";
      return;
    }

    try {
      setUploadingImage(true);
      notify("이미지를 압축 및 업로드 중...", "info");
      const imageUrl = await compressAndUploadImage(file, codeToUse);

      if (targetCode) {
        const nextItems = items.map((i) => (i.code === targetCode ? { ...i, image_url: imageUrl } : i));
        await saveItems(nextItems);
        notify("자재 사진이 성공적으로 업데이트되었습니다.", "ok");
      } else {
        setForm((prev) => ({ ...prev, image_url: imageUrl }));
        notify("사진 등록이 완료되었습니다.", "ok");
      }
    } catch (err) {
      console.error(err);
      const detail = err?.message || err?.error_description || String(err);
      notify(`이미지 업로드 실패: ${detail}`, "err");
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  };

  const [editingSafetyCode, setEditingSafetyCode] = useState(null);
  const [editingSafetyValue, setEditingSafetyValue] = useState("");

  const startEditSafety = (item) => {
    setEditingSafetyCode(item.code);
    setEditingSafetyValue(String(item.safety ?? 0));
  };

  const commitEditSafety = async (code) => {
    const num = Number(editingSafetyValue);
    if (editingSafetyValue.trim() === "" || Number.isNaN(num) || num < 0) {
      notify("안전재고는 0 이상의 숫자여야 합니다.", "err");
      return;
    }
    const nextItems = items.map((i) => (i.code === code ? { ...i, safety: num } : i));
    await saveItems(nextItems);
    notify("안전재고가 수정되었습니다.", "ok");
    setEditingSafetyCode(null);
    setEditingSafetyValue("");
  };

  const [editingLocationCode, setEditingLocationCode] = useState(null);
  const [editingLocationValue, setEditingLocationValue] = useState("");

  const startEditLocation = (item) => {
    setEditingLocationCode(item.code);
    setEditingLocationValue(item.location || "");
  };

  const commitEditLocation = async (code) => {
    const nextItems = items.map((i) => (i.code === code ? { ...i, location: editingLocationValue.trim() } : i));
    await saveItems(nextItems);
    notify("위치가 수정되었습니다.", "ok");
    setEditingLocationCode(null);
    setEditingLocationValue("");
  };

  const [editingManufacturerCode, setEditingManufacturerCode] = useState(null);
  const [editingManufacturerValue, setEditingManufacturerValue] = useState("");

  const startEditManufacturer = (item) => {
    setEditingManufacturerCode(item.code);
    setEditingManufacturerValue(item.manufacturer || "");
  };

  const commitEditManufacturer = async (code) => {
    const nextItems = items.map((i) => (i.code === code ? { ...i, manufacturer: editingManufacturerValue.trim() } : i));
    await saveItems(nextItems);
    notify("거래처가 수정되었습니다.", "ok");
    setEditingManufacturerCode(null);
    setEditingManufacturerValue("");
  };

  const [editingCategoryCode, setEditingCategoryCode] = useState(null);
  const [editingCategoryValue, setEditingCategoryValue] = useState("");

  const startEditCategory = (item) => {
    setEditingCategoryCode(item.code);
    setEditingCategoryValue(item.category || "");
  };

  const commitEditCategory = async (code) => {
    const nextItems = items.map((i) => (i.code === code ? { ...i, category: editingCategoryValue.trim() } : i));
    await saveItems(nextItems);
    notify("카테고리가 수정되었습니다.", "ok");
    setEditingCategoryCode(null);
    setEditingCategoryValue("");
  };

  const addItem = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      notify("자재코드와 품명은 필수 입력 항목입니다.", "err");
      return;
    }

    const expectedPrefix = formMaterialType === "raw" ? "1" : "2";
    if (!form.code.trim().startsWith(expectedPrefix)) {
      notify(
        `${formMaterialType === "raw" ? "원자재" : "부자재"} 코드는 "${expectedPrefix}"로 시작해야 합니다. 예: ${expectedPrefix}-CG-M20-BR`,
        "err"
      );
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

    const nextItems = [...items, newItem];
    await saveItems(nextItems);
    notify(`[${newItem.name}] 자재가 성공적으로 등록되었습니다.`, "ok");
    setForm(blank);
    setFormMaterialType("raw");
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
    const headers = ["코드,품명,규격,카테고리,단위,현재고,안전재고,위치,거래처,이미지주소\n"];
    const rows = items.map(i => `"${csvSafe(i.code)}","${csvSafe(i.name)}","${csvSafe(i.spec)}","${csvSafe(i.category)}","${i.unit}",${i.stock},${i.safety},"${csvSafe(i.location)}","${csvSafe(i.manufacturer)}","${csvSafe(i.image_url)}"\n`);
    const blob = new Blob(["\uFEFF" + headers + rows.join("")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `MRO_자재마스터_${nowStr().split(" ")[0]}.csv`;
    link.click();
    notify("자재 데이터가 엑셀(CSV)로 다운로드 되었습니다.", "ok");
  };

  const [qrExporting, setQrExporting] = useState(false);
  const exportQRLabelsExcel = async () => {
    if (items.length === 0) { notify("등록된 자재가 없습니다.", "err"); return; }
    setQrExporting(true);
    notify("QR 라벨 엑셀을 생성 중입니다...", "info");
    try {
      const workbook = await buildQrLabelWorkbook(items);
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `QR라벨_${nowStr().split(" ")[0]}.xlsx`;
      link.click();
      notify("QR 라벨 엑셀이 다운로드되었습니다.", "ok");
    } catch (e) {
      console.error(e);
      notify("QR 라벨 엑셀 생성 중 오류가 발생했습니다.", "err");
    } finally {
      setQrExporting(false);
    }
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
            const manufacturer = getCol('거래처', '생산업체', '제조사', 'manufacturer');
            const unit = getCol('단위', 'unit') || 'EA';
            const stock = Number(getCol('현재고', '재고', '수량', '입고수량', '재고수량', 'stock', 'qty')) || 0;
            const safety = Number(getCol('안전재고', '안전재고기준', 'safety')) || 0;
            const location = getCol('위치', 'location');
            const imageUrl = getCol('이미지', 'image_url', '사진');

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
              image_url: imageUrl || "",
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

  const triggerPhotoUpload = (code) => {
    setTargetItemForPhoto(code);
    if (window.confirm("사진 등록 방식을 선택하세요.\n확인: 라이브 촬영 / 취소: 갤러리")) {
      editCameraInputRef.current.click();
    } else {
      editGalleryInputRef.current.click();
    }
  };

  const copyCodeToClipboard = (code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      notify("자재코드가 클립보드에 복사되었습니다.", "ok");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const currentUrgentMasterItem = useMemo(() => {
    if (!selectedUrgent) return null;
    return items.find((i) => String(i.code).trim() === String(selectedUrgent.item_code).trim()) || null;
  }, [selectedUrgent, items]);

  return (
    <div>
      <style>{`
        .master-table-view { display: block; width: 100%; overflow-x: auto; }
        .master-cards-view { display: none; flex-direction: column; gap: 12px; }

        @media (max-width: 768px) {
          .master-table-view { display: none; }
          .master-cards-view { display: flex; }
        }

        .urgent-stack-container {
          display: flex;
          align-items: center;
          gap: 10px; /* 카드 사이 간격 확보 */
          padding: 8px 4px;
          overflow-x: auto;
          width: 100%;
          white-space: nowrap;
          -webkit-overflow-scrolling: touch;
        }
        .urgent-stack-item {
          transition: transform 0.25s ease, box-shadow 0.25s ease;
          cursor: pointer;
          flex-shrink: 0;
          margin-left: 0 !important; /* 겹침 현상 제거 */
        }
        .urgent-stack-item:hover {
          transform: translateY(-2px);
        }
      `}</style>

      <Header title="자재 마스터" subtitle="신규 자재 등록 · QR 생성 · 사진 관리 및 백업" />

      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={editCameraInputRef}
        style={{ display: "none" }}
        onChange={(e) => handleImageFileSelected(e, targetItemForPhoto)}
      />
      <input
        type="file"
        accept="image/*"
        ref={editGalleryInputRef}
        style={{ display: "none" }}
        onChange={(e) => handleImageFileSelected(e, targetItemForPhoto)}
      />

      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={() => setShowForm((s) => !s)} variant={showForm ? "ghost" : "primary"}>
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? "취소" : "신규 자재 등록"}
          </Btn>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {/* 발주 장바구니 버튼 */}
          <button
            onClick={() => setShowCartModal(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 8,
              background: "#38BDF822", border: "1px solid #38BDF8", color: "#38BDF8",
              fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace"
            }}
          >
            <ShoppingCart size={16} />
            발주 장바구니
            {cartItems.length > 0 && (
              <span style={{
                background: "#38BDF8", color: "#0A1622", borderRadius: 999,
                padding: "2px 7px", fontSize: 11, fontWeight: 800, marginLeft: 2
              }}>
                {cartItems.length}
              </span>
            )}
          </button>

          <Btn onClick={exportCSV} variant="subtle"><Download size={15} />엑셀 백업</Btn>
          <Btn onClick={exportQRLabelsExcel} variant="subtle" disabled={qrExporting}>
            <QrCode size={15} />{qrExporting ? "생성 중..." : "QR 라벨"}
          </Btn>
          <label style={{ display: "inline-block" }}>
            <input type="file" accept=".xlsx, .xls, .csv" onChange={importExcelFile} style={{ display: "none" }} />
            <span style={{
              background: "#16324A", color: "#C9DAE8", border: "1px solid #274460",
              fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 13.5,
              padding: "10px 16px", borderRadius: 8, cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center"
            }}>
              <Upload size={15} />불러오기
            </span>
          </label>
        </div>
      </div>

      {/* 원자재 / 부자재 구분 필터 탭 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[
          { id: "all", label: `전체 (${items.length})` },
          { id: "raw", label: `원자재 (${items.filter((i) => getMaterialType(i.code) === "raw").length})` },
          { id: "sub", label: `부자재 (${items.filter((i) => getMaterialType(i.code) === "sub").length})` },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setMaterialFilter(f.id)}
            style={{
              padding: "8px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
              border: materialFilter === f.id ? `1px solid ${MATERIAL_TYPE_META[f.id]?.color || "#38BDF8"}` : "1px solid #1F3B54",
              background: materialFilter === f.id ? `${MATERIAL_TYPE_META[f.id]?.color || "#38BDF8"}1f` : "#0B1C2C",
              color: materialFilter === f.id ? (MATERIAL_TYPE_META[f.id]?.color || "#38BDF8") : "#7F97AC",
              cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace", whiteSpace: "nowrap",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 긴급요청 경고 바 */}
      <div style={{
        background: pendingUrgentList.length > 0 ? "linear-gradient(90deg, #2A1010 0%, #150B0B 100%)" : "#0B1C2C",
        border: `1px solid ${pendingUrgentList.length > 0 ? "#EF535066" : "#1E3A5F"}`,
        borderRadius: 12, padding: "12px 16px", marginBottom: 20,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 64
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <AlertTriangle size={18} color={pendingUrgentList.length > 0 ? "#FF6B6B" : "#5E86A3"} />
            <span style={{
              fontSize: 13.5, fontWeight: 700,
              color: pendingUrgentList.length > 0 ? "#FF6B6B" : "#5E86A3",
              fontFamily: "'IBM Plex Mono', monospace"
            }}>
              긴급발주 요청 ({pendingUrgentList.length})
            </span>
          </div>

          {pendingUrgentList.length === 0 ? (
            <span style={{ fontSize: 12.5, color: "#5E86A3", fontFamily: "'IBM Plex Mono', monospace" }}>
              현재 접수된 긴급 발주 요청이 없습니다.
            </span>
          ) : (
            <div className="urgent-stack-container">
              {pendingUrgentList.map((req, index) => {
                const overlapMargin = index > 0 ? "-32px" : "0px";
                return (
                  <div
                    key={req.id}
                    onClick={() => setSelectedUrgent(req)}
                    className="urgent-stack-item"
                    style={{
                      marginLeft: overlapMargin,
                      zIndex: pendingUrgentList.length - index,
                      background: "#1E0F0F",
                      border: "1px solid #EF5350AA",
                      borderRadius: 8,
                      padding: "8px 14px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 190
                    }}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%", background: "#FF5252",
                      boxShadow: "0 0 6px #FF5252", flexShrink: 0
                    }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#FFD1D1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {req.item_name}
                      </div>
                      <div style={{ fontSize: 10.5, color: "#FFA8A8", fontFamily: "IBM Plex Mono" }}>
                        {req.requester} · {timeAgoStr(req.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <Card style={{ padding: 22, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            <Field label="구분 *">
              <Select
                value={formMaterialType === "raw" ? "원자재" : "부자재"}
                onChange={(e) => setFormMaterialType(e.target.value === "원자재" ? "raw" : "sub")}
                options={["원자재", "부자재"]}
              />
            </Field>
            <Field label="자재코드 *">
              <input
                style={inputStyle}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder={formMaterialType === "raw" ? "예: 1-CG-M32-BR" : "예: 2-CG-M32-BR"}
              />
            </Field>
            <Field label="품명 *"><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 케이블 글랜드" /></Field>
            <Field label="규격"><input style={inputStyle} value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder="예: Brass Gland M32" /></Field>
            <Field label="거래처"><input style={inputStyle} value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} placeholder="예: 동아베스텍" /></Field>
            <Field label="카테고리"><input style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="예: 글랜드" /></Field>
            <Field label="단위">
              <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} options={["EA", "m", "kg", "roll", "set"]} />
            </Field>
            <Field label="초기 재고"><input style={inputStyle} type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
            <Field label="안전재고 기준"><input style={inputStyle} type="number" value={form.safety} onChange={(e) => setForm({ ...form, safety: e.target.value })} /></Field>
            <Field label="저장 위치"><input style={inputStyle} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="예: A-03" /></Field>
            
            <div style={{ gridColumn: "1 / -1", background: "#0B1C2C", padding: 14, borderRadius: 8, border: "1px dashed #274460" }}>
              <span style={{ fontSize: 13, color: "#9FB4C7", fontWeight: 600, display: "block", marginBottom: 8 }}>
                자재 사진 첨부 (자동 압축)
              </span>

              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={liveCameraInputRef}
                style={{ display: "none" }}
                onChange={(e) => handleImageFileSelected(e, null)}
              />
              <input
                type="file"
                accept="image/*"
                ref={galleryInputRef}
                style={{ display: "none" }}
                onChange={(e) => handleImageFileSelected(e, null)}
              />

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <Btn
                  variant="subtle"
                  disabled={uploadingImage || !form.code.trim()}
                  onClick={() => liveCameraInputRef.current && liveCameraInputRef.current.click()}
                  style={{ fontSize: 13, padding: "8px 14px" }}
                >
                  <Camera size={16} /> 촬영
                </Btn>
                <Btn
                  variant="subtle"
                  disabled={uploadingImage || !form.code.trim()}
                  onClick={() => galleryInputRef.current && galleryInputRef.current.click()}
                  style={{ fontSize: 13, padding: "8px 14px" }}
                >
                  <ImageIcon size={16} /> 갤러리
                </Btn>

                {form.image_url && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                    <img src={form.image_url} alt="미리보기" style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover", border: "1px solid #38BDF8" }} />
                    <span style={{ fontSize: 12, color: "#35D08C" }}>✓ 등록됨</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <Btn onClick={addItem} disabled={uploadingImage}><Plus size={16} />등록 완료</Btn>
          </div>
        </Card>
      )}

      {/* 1) PC/태블릿용 테이블 뷰 */}
      <Card style={{ padding: 8 }} className="master-table-view">
        <div style={{ maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
          <table>
            <thead style={{ position: "sticky", top: 0, background: "#0F2233", zIndex: 1 }}>
              <tr style={{ color: "#5E86A3", fontFamily: "IBM Plex Mono", fontSize: 11.5, textTransform: "uppercase" }}>
                <th>No.</th><th>사진</th><th>구분</th><th>코드</th><th>품명 / 규격</th><th>거래처</th><th>카테고리</th><th>단위</th><th>현재고</th><th>안전재고</th><th>위치</th><th>QR</th><th>삭제</th>
              </tr>
            </thead>
            <tbody>
              {displayedItems.map((i, index) => {
                const st = statusOf(i);
                const mType = getMaterialType(i.code);
                return (
                <tr key={i.code}>
                  <td>{index + 1}</td>
                  <td>
                    {i.image_url ? (
                      <img
                        src={i.image_url}
                        alt={i.name}
                        onClick={() => triggerPhotoUpload(i.code)}
                        style={{ width: 38, height: 38, borderRadius: 6, objectFit: "cover", cursor: "pointer" }}
                        title="클릭하여 사진 변경"
                      />
                    ) : (
                      <button
                        onClick={() => triggerPhotoUpload(i.code)}
                        style={{ background: "#0B1C2C", border: "1px solid #274460", color: "#5E86A3", padding: "6px", borderRadius: 6, cursor: "pointer" }}
                        title="사진 첨부"
                      >
                        <Camera size={14} />
                      </button>
                    )}
                  </td>
                  <td>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10.5, fontWeight: 700,
                      color: MATERIAL_TYPE_META[mType].color, background: `${MATERIAL_TYPE_META[mType].color}1f`,
                      fontFamily: "'IBM Plex Mono', monospace", whiteSpace: "nowrap",
                    }}>
                      {MATERIAL_TYPE_META[mType].label}
                    </span>
                  </td>
                  <td style={{ fontFamily: "IBM Plex Mono", color: "#9FB4C7", fontWeight: 600 }}>{i.code}</td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{i.name}</div>
                    {i.spec && <div style={{ fontSize: 11.5, color: "#7F97AC", fontFamily: "IBM Plex Mono" }}>{i.spec}</div>}
                  </td>
                  <td style={{ color: "#9FB4C7", fontSize: 12.5 }}>
                    {editingManufacturerCode === i.code ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingManufacturerValue}
                        onChange={(e) => setEditingManufacturerValue(e.target.value)}
                        onBlur={() => commitEditManufacturer(i.code)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEditManufacturer(i.code);
                          if (e.key === "Escape") setEditingManufacturerCode(null);
                        }}
                        style={{ ...inputStyle, width: 110, padding: "4px 8px", fontSize: 13 }}
                      />
                    ) : (
                      <span
                        onClick={() => startEditManufacturer(i)}
                        title="클릭하여 거래처 수정"
                        style={{ cursor: "pointer", borderBottom: "1px dashed #5E86A3" }}
                      >
                        {i.manufacturer || "-"}
                      </span>
                    )}
                  </td>
                  <td style={{ color: "#9FB4C7", fontSize: 12.5 }}>
                    {editingCategoryCode === i.code ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingCategoryValue}
                        onChange={(e) => setEditingCategoryValue(e.target.value)}
                        onBlur={() => commitEditCategory(i.code)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEditCategory(i.code);
                          if (e.key === "Escape") setEditingCategoryCode(null);
                        }}
                        style={{ ...inputStyle, width: 110, padding: "4px 8px", fontSize: 13 }}
                      />
                    ) : (
                      <span
                        onClick={() => startEditCategory(i)}
                        title="클릭하여 카테고리 수정"
                        style={{ cursor: "pointer", borderBottom: "1px dashed #5E86A3" }}
                      >
                        {i.category || "-"}
                      </span>
                    )}
                  </td>
                  <td style={{ fontFamily: "IBM Plex Mono", color: "#9FB4C7" }}>{i.unit}</td>
                  <td style={{ fontFamily: "IBM Plex Mono", fontWeight: 600, fontSize: 13.5, color: st === "danger" ? "#EF5350" : st === "warn" ? "#F5A623" : "#E7EEF5" }}>{i.stock}</td>
                  <td style={{ fontFamily: "IBM Plex Mono", color: "#7F97AC", fontSize: 13 }}>
                    {editingSafetyCode === i.code ? (
                      <input
                        type="number"
                        min="0"
                        autoFocus
                        value={editingSafetyValue}
                        onChange={(e) => setEditingSafetyValue(e.target.value)}
                        onBlur={() => commitEditSafety(i.code)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEditSafety(i.code);
                          if (e.key === "Escape") setEditingSafetyCode(null);
                        }}
                        style={{ ...inputStyle, width: 84, padding: "4px 8px", fontSize: 13 }}
                      />
                    ) : (
                      <span
                        onClick={() => startEditSafety(i)}
                        title="클릭하여 안전재고 수정"
                        style={{ cursor: "pointer", borderBottom: "1px dashed #5E86A3" }}
                      >
                        {i.safety}
                      </span>
                    )}
                  </td>
                  <td style={{ fontFamily: "IBM Plex Mono", color: "#9FB4C7" }}>
                    {editingLocationCode === i.code ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingLocationValue}
                        onChange={(e) => setEditingLocationValue(e.target.value)}
                        onBlur={() => commitEditLocation(i.code)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEditLocation(i.code);
                          if (e.key === "Escape") setEditingLocationCode(null);
                        }}
                        style={{ ...inputStyle, width: 84, padding: "4px 8px", fontSize: 13 }}
                      />
                    ) : (
                      <span
                        onClick={() => startEditLocation(i)}
                        title="클릭하여 위치 수정"
                        style={{ cursor: "pointer", borderBottom: "1px dashed #5E86A3" }}
                      >
                        {i.location || "-"}
                      </span>
                    )}
                  </td>
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
            </tbody>
          </table>
        </div>
      </Card>

      {/* 2) 모바일 전용 카드 뷰 */}
      <div className="master-cards-view">
        {displayedItems.length === 0 ? (
          <Card style={{ padding: 20 }}>
            <EmptyState icon={Package} text="등록된 자재가 없습니다." color="#5E86A3" />
          </Card>
        ) : (
          displayedItems.map((i) => {
            const st = statusOf(i);
            const mType = getMaterialType(i.code);
            return (
              <Card key={i.code} style={{ padding: 14 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
                  {i.image_url ? (
                    <img
                      src={i.image_url}
                      alt={i.name}
                      onClick={() => triggerPhotoUpload(i.code)}
                      style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <div
                      onClick={() => triggerPhotoUpload(i.code)}
                      style={{ width: 48, height: 48, borderRadius: 8, background: "#0B1C2C", border: "1px solid #274460", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer" }}
                    >
                      <Camera size={18} color="#5E86A3" />
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{
                        display: "inline-block", padding: "1px 7px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                        color: MATERIAL_TYPE_META[mType].color, background: `${MATERIAL_TYPE_META[mType].color}1f`,
                        fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0,
                      }}>
                        {MATERIAL_TYPE_META[mType].label}
                      </span>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#38BDF8", wordBreak: "break-all" }}>
                        {i.name}
                      </div>
                    </div>
                    <div style={{ fontSize: 11.5, color: "#7F97AC", fontFamily: "IBM Plex Mono", marginTop: 2 }}>
                      {i.code} {i.spec ? `| ${i.spec}` : ""}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => {
                        if (window.innerWidth > 768) {
                          setQrModalItem(i);
                        }
                      }}
                      style={{ background: "#16324A", border: "1px solid #274460", color: "#F5A623", padding: "6px 8px", borderRadius: 6, cursor: "pointer" }}
                    >
                      <QrCode size={14} />
                    </button>
                    <button
                      onClick={() => removeItem(i.code)}
                      style={{ background: "#2A1818", border: "1px solid #4A2A2A", color: "#EF5350", padding: "6px 8px", borderRadius: 6, cursor: "pointer" }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: "#0B1C2C", padding: "8px 10px", borderRadius: 6, fontSize: 12, marginBottom: 10 }}>
                  <div>
                    <span style={{ color: "#5E86A3", display: "block", fontSize: 10.5 }}>거래처</span>
                    {editingManufacturerCode === i.code ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingManufacturerValue}
                        onChange={(e) => setEditingManufacturerValue(e.target.value)}
                        onBlur={() => commitEditManufacturer(i.code)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEditManufacturer(i.code);
                          if (e.key === "Escape") setEditingManufacturerCode(null);
                        }}
                        style={{ ...inputStyle, width: "100%", padding: "2px 4px", fontSize: 12 }}
                      />
                    ) : (
                      <span onClick={() => startEditManufacturer(i)} style={{ color: "#E7EEF5", borderBottom: "1px dashed #5E86A3" }}>
                        {i.manufacturer || "미지정"}
                      </span>
                    )}
                  </div>

                  <div>
                    <span style={{ color: "#5E86A3", display: "block", fontSize: 10.5 }}>저장 위치</span>
                    {editingLocationCode === i.code ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingLocationValue}
                        onChange={(e) => setEditingLocationValue(e.target.value)}
                        onBlur={() => commitEditLocation(i.code)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEditLocation(i.code);
                          if (e.key === "Escape") setEditingLocationCode(null);
                        }}
                        style={{ ...inputStyle, width: "100%", padding: "2px 4px", fontSize: 12 }}
                      />
                    ) : (
                      <span onClick={() => startEditLocation(i)} style={{ color: "#E7EEF5", borderBottom: "1px dashed #5E86A3" }}>
                        {i.location || "미지정"}
                      </span>
                    )}
                  </div>
                  <div>
                    <span style={{ color: "#5E86A3", display: "block", fontSize: 10.5 }}>카테고리</span>
                    {editingCategoryCode === i.code ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingCategoryValue}
                        onChange={(e) => setEditingCategoryValue(e.target.value)}
                        onBlur={() => commitEditCategory(i.code)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEditCategory(i.code);
                          if (e.key === "Escape") setEditingCategoryCode(null);
                        }}
                        style={{ ...inputStyle, width: "100%", padding: "2px 4px", fontSize: 12 }}
                      />
                    ) : (
                      <span onClick={() => startEditCategory(i)} style={{ color: "#E7EEF5", borderBottom: "1px dashed #5E86A3", cursor: "pointer" }}>
                        {i.category || "미지정"}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #1A3146", paddingTop: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Led status={st} size={8} />
                    <span style={{ fontSize: 12, color: "#9FB4C7" }}>
                      안전재고:{" "}
                      {editingSafetyCode === i.code ? (
                        <input
                          type="number"
                          min="0"
                          autoFocus
                          value={editingSafetyValue}
                          onChange={(e) => setEditingSafetyValue(e.target.value)}
                          onBlur={() => commitEditSafety(i.code)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEditSafety(i.code);
                            if (e.key === "Escape") setEditingSafetyCode(null);
                          }}
                          style={{ ...inputStyle, width: 50, padding: "2px 4px", fontSize: 11, display: "inline-block" }}
                        />
                      ) : (
                        <strong onClick={() => startEditSafety(i)} style={{ borderBottom: "1px dashed #5E86A3", cursor: "pointer" }}>
                          {i.safety} {i.unit}
                        </strong>
                      )}
                    </span>
                  </div>

                  <div style={{ fontFamily: "IBM Plex Mono", fontSize: 15, fontWeight: 700, color: st === "danger" ? "#EF5350" : st === "warn" ? "#F5A623" : "#35D08C" }}>
                    {i.stock} <span style={{ fontSize: 11, fontWeight: 400, color: "#7F97AC" }}>{i.unit}</span>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* 긴급 요청 상세 정보 모달 */}
      {selectedUrgent && (
        <div
          onClick={() => setSelectedUrgent(null)}
          className="app-modal-overlay"
          style={{
            position: "fixed", inset: 0, background: "rgba(6,14,22,0.82)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 440, background: "#0F2233", border: "1px solid #EF5350AA",
              borderRadius: 14, padding: 22, color: "#E7EEF5", boxShadow: "0 12px 32px rgba(0,0,0,0.6)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#FF6B6B", fontWeight: 700, fontSize: 16 }}>
                <AlertTriangle size={20} />
                긴급 자재 발주 상세 정보
              </div>
              <button
                onClick={() => setSelectedUrgent(null)}
                style={{ background: "none", border: "none", color: "#7F97AC", cursor: "pointer", padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ background: "#0B1C2C", border: "1px solid #1F3B54", borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#38BDF8", marginBottom: 6 }}>
                {selectedUrgent.item_name}
              </div>
              
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, background: "#152C42", padding: "6px 10px", borderRadius: 6 }}>
                <span style={{ fontSize: 12, color: "#9FB4C7", fontFamily: "IBM Plex Mono" }}>
                  코드: <strong style={{ color: "#FFF" }}>{selectedUrgent.item_code}</strong>
                </span>
                <button
                  onClick={() => copyCodeToClipboard(selectedUrgent.item_code)}
                  style={{
                    display: "flex", alignItems: "center", gap: 4, background: "#274460", border: "none",
                    color: copied ? "#35D08C" : "#C9DAE8", padding: "4px 8px", borderRadius: 4, fontSize: 11, cursor: "pointer"
                  }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "복사됨" : "코드 복사"}
                </button>
              </div>

              {currentUrgentMasterItem ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, color: "#9FB4C7" }}>
                  <div>규격: {currentUrgentMasterItem.spec || "-"}</div>
                  <div>거래처: {currentUrgentMasterItem.manufacturer || "-"}</div>
                  <div>현재고: <strong style={{ color: "#EF5350" }}>{currentUrgentMasterItem.stock} {currentUrgentMasterItem.unit}</strong></div>
                  <div>안전재고: {currentUrgentMasterItem.safety} {currentUrgentMasterItem.unit}</div>
                </div>
              ) : (
                <div style={{ fontSize: 11.5, color: "#5E86A3" }}>※ 자재 마스터에 등록된 기본 상세 정보를 불러올 수 없습니다.</div>
              )}
            </div>

            <div style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 6, color: "#C9DAE8", marginBottom: 18 }}>
              <div><strong>요청자:</strong> {selectedUrgent.requester}</div>
              {selectedUrgent.ship_no && <div><strong>호선:</strong> {selectedUrgent.ship_no}</div>}
              {selectedUrgent.project && <div><strong>프로젝트:</strong> {selectedUrgent.project}</div>}
              <div><strong>요청시각:</strong> {selectedUrgent.created_at ? new Date(selectedUrgent.created_at).toLocaleString() : "-"}</div>
              {selectedUrgent.note && <div><strong>메모:</strong> {selectedUrgent.note}</div>}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn
                variant="subtle"
                style={{ flex: 1, fontSize: 13 }}
                onClick={() => {
                  const targetItem = currentUrgentMasterItem || { code: selectedUrgent.item_code, name: selectedUrgent.item_name, stock: 0, unit: "EA" };
                  addToCart(targetItem);
                  notify(`[${targetItem.name}] 자재를 발주 장바구니에 담았습니다.`, "ok");
                }}
              >
                <ShoppingCart size={15} /> 발주 장바구니 담기
              </Btn>
              <Btn
                style={{ flex: 1, background: "#35D08C", border: "1px solid #35D08C", color: "#0A1622", fontSize: 13 }}
                onClick={async () => {
                  await resolveUrgentRequest(selectedUrgent.id);
                  notify("긴급요청 처리가 완료되었습니다.", "ok");
                  setSelectedUrgent(null);
                }}
              >
                <CheckCircle2 size={15} /> 처리완료 완료
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* 발주 장바구니 모달 */}
      {showCartModal && (
        <div
          onClick={() => setShowCartModal(false)}
          className="app-modal-overlay"
          style={{
            position: "fixed", inset: 0, background: "rgba(6,14,22,0.82)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 500, background: "#0F2233", border: "1px solid #38BDF8AA",
              borderRadius: 14, padding: 22, color: "#E7EEF5", boxShadow: "0 12px 32px rgba(0,0,0,0.6)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#38BDF8", fontWeight: 700, fontSize: 16 }}>
                <ShoppingCart size={20} />
                한번에 몰아서 발주하기 (장바구니)
              </div>
              <button onClick={() => setShowCartModal(false)} style={{ background: "none", border: "none", color: "#7F97AC", cursor: "pointer", padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            {cartItems.length === 0 ? (
              <EmptyState icon={ShoppingCart} text="장바구니에 담긴 자재가 없습니다." color="#5E86A3" />
            ) : (
              <div>
                <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {cartItems.map((cItem) => (
                    <div key={cItem.code} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0B1C2C", padding: "10px 12px", borderRadius: 8, border: "1px solid #1F3B54" }}>
                      <div>
                        <div style={{ fontWeight: 700, color: "#38BDF8", fontSize: 13.5 }}>{cItem.name}</div>
                        <div style={{ fontSize: 11, color: "#7F97AC", fontFamily: "IBM Plex Mono" }}>{cItem.code}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button
                          onClick={() => copyCodeToClipboard(cItem.code)}
                          style={{ background: "#16324A", border: "1px solid #274460", color: "#C9DAE8", padding: "4px 8px", borderRadius: 4, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                        >
                          <Copy size={12} /> 복사
                        </button>
                        <button
                          onClick={() => removeFromCart(cItem.code)}
                          style={{ background: "none", border: "none", color: "#EF5350", cursor: "pointer" }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <Btn
                    variant="ghost"
                    onClick={() => {
                      const allCodes = cartItems.map(c => c.code).join("\n");
                      navigator.clipboard.writeText(allCodes);
                      notify("전체 자재 코드가 복사되었습니다.", "ok");
                    }}
                    style={{ flex: 1, fontSize: 12.5 }}
                  >
                    <Copy size={14} /> 전체 목록 복사
                  </Btn>
                  <Btn
                    variant="danger"
                    onClick={() => { clearCart(); notify("장바구니가 비워졌습니다.", "info"); }}
                    style={{ fontSize: 12.5 }}
                  >
                    비우기
                  </Btn>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {qrModalItem && window.innerWidth > 768 && (
        <div className="app-modal-overlay" style={{
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

/* ---------------- 입고 등록 ---------------- */
function InboundView({ items, saveItems, txs, saveTxs, notify, supabase }) {
  const [selectedCode, setSelectedCode] = useState("");
  const [qty, setQty] = useState(1);
  const [person, setPerson] = useState("");

  const [useCamera, setUseCamera] = useState(false);
  const [invoiceQRInput, setInvoiceQRInput] = useState("");
  const [invoiceData, setInvoiceData] = useState(null);
  const [invoicePerson, setInvoicePerson] = useState("");
  const [loading, setLoading] = useState(false);

  const [quickRegItem, setQuickRegItem] = useState(null);
  const [quickName, setQuickName] = useState("");
  const [quickSpec, setQuickSpec] = useState("");
  const [quickUnit, setQuickUnit] = useState("EA");

  const [itemSearchText, setItemSearchText] = useState("");
  const [itemDropdownOpen, setItemDropdownOpen] = useState(false);
  const itemInputWrapRef = useRef(null);

  const filteredItemsForInbound = useMemo(() => {
    const list = items || [];
    if (!itemSearchText.trim()) return list.slice(0, 30);
    const q = itemSearchText.toLowerCase().trim();
    return list.filter((i) => 
      String(i.name).toLowerCase().includes(q) || 
      String(i.code).toLowerCase().includes(q) ||
      String(i.spec || "").toLowerCase().includes(q)
    ).slice(0, 30);
  }, [items, itemSearchText]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (itemInputWrapRef.current && !itemInputWrapRef.current.contains(e.target)) {
        setItemDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const selectedItem = items.find((i) => i.code === selectedCode);

  const recentInTxs = useMemo(() => {
    const parseAt = (t) => {
      const d = new Date(String(t.at || "").replace(" ", "T"));
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    };
    return (txs || [])
      .filter((t) => t.type === "in")
      .sort((a, b) => parseAt(b) - parseAt(a))
      .slice(0, 15);
  }, [txs]);

  useEffect(() => {
    let html5QrCode = null;
    if (useCamera) {
      const startScanner = async () => {
        try {
          if (!window.Html5Qrcode) {
            const script = document.createElement("script");
            script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
            script.async = true;
            document.body.appendChild(script);
            await new Promise((resolve) => (script.onload = resolve));
          }

          html5QrCode = new window.Html5Qrcode("inbound-qr-reader");
          await html5QrCode.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            (decodedText) => {
              fetchInvoiceData(decodedText);
              setUseCamera(false);
            },
            () => {}
          );
        } catch (err) {
          console.error("카메라 접근 에러:", err);
          if (notify) notify("카메라를 켤 수 없습니다. 권한을 확인해주세요.", "err");
          setUseCamera(false);
        }
      };
      startScanner();
    }

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => html5QrCode.clear()).catch(console.error);
      }
    };
  }, [useCamera]);

  const fetchInvoiceData = async (rawVal) => {
    if (!rawVal) return;
    let keyCode = rawVal.trim();

const patterns = [
  /KEY_CODE\s*[:=]\s*([A-Za-z0-9_-]+)/i,
  /["']?KEY_CODE["']?\s*[:=]\s*["']?([A-Za-z0-9_-]+)/i,
  /\b(\d{4,})\b/
];

for (const r of patterns) {
  const m = rawVal.match(r);
  if (m && m[1]) {
    keyCode = m[1];
    break;
  }
}

keyCode = String(keyCode)
  .replace(/[^0-9A-Za-z_-]/g, "")
  .trim();
    

    setLoading(true);
    notify(`명세서 코드 [${keyCode}] 데이터 조회 중...`, "info");

    try {
      if (!supabase) {
        notify("Supabase가 연동되어 있지 않습니다.", "err");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("key_code", keyCode)
        .single();

      if (error || !data) {
        notify(`[KEY_CODE: ${keyCode}]에 해당하는 거래명세서를 찾을 수 없습니다.`, "err");
        setInvoiceData(null);
      } else {
        const parsedList = (data.items || []).map((invItem) => {
          const masterItem = items.find((i) => i.code === invItem.code);
          const defaultQty = Number(invItem.qty) || 0;
          return {
            code: invItem.code,
            masterItem: masterItem || null,
            docQty: defaultQty,
            inputQty: defaultQty,
            checked: true,
          };
        });

        setInvoiceData({
          key_code: data.key_code,
          supplier: data.supplier || "미지정 거래처",
          list: parsedList,
        });
        notify(`명세서 [${keyCode}] 불러오기 완료 (${parsedList.length}건)`, "ok");
      }
    } catch (err) {
      console.error(err);
      notify("거래명세서 조회 중 오류가 발생했습니다.", "err");
    } finally {
      setLoading(false);
      setInvoiceQRInput("");
    }
  };

  const handleInvoiceQRScan = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      fetchInvoiceData(e.target.value);
    }
  };

  const toggleItemCheck = (idx) => {
    if (!invoiceData) return;
    const nextList = [...invoiceData.list];
    nextList[idx].checked = !nextList[idx].checked;
    setInvoiceData({ ...invoiceData, list: nextList });
  };

  const toggleAllCheck = (e) => {
    if (!invoiceData) return;
    const isAll = e.target.checked;
    const nextList = invoiceData.list.map((item) => ({ ...item, checked: isAll }));
    setInvoiceData({ ...invoiceData, list: nextList });
  };

  const handleQtyChange = (idx, value) => {
    if (!invoiceData) return;
    const nextList = [...invoiceData.list];
    nextList[idx].inputQty = Number(value) || 0;
    setInvoiceData({ ...invoiceData, list: nextList });
  };

  const handleOpenQuickReg = (code) => {
    setQuickRegItem(code);
    setQuickName("");
    setQuickSpec("");
    setQuickUnit("EA");
  };

  const handleSaveQuickReg = async () => {
    if (!quickName.trim()) {
      notify("품명을 입력해주세요.", "err");
      return;
    }

    const newItem = {
      code: quickRegItem,
      name: quickName.trim(),
      spec: quickSpec.trim(),
      unit: quickUnit,
      stock: 0,
      safety: 0,
      location: "",
      manufacturer: invoiceData?.supplier || "",
      category: "",
      image_url: "",
      deleted: false,
    };

    const nextItems = [...items, newItem];
    await saveItems(nextItems);

    if (invoiceData) {
      const updatedList = invoiceData.list.map((inv) => {
        if (inv.code === quickRegItem) {
          return { ...inv, masterItem: newItem };
        }
        return inv;
      });
      setInvoiceData({ ...invoiceData, list: updatedList });
    }

    notify(`[${newItem.name}] 자재가 마스터에 바로 등록되었습니다!`, "ok");
    setQuickRegItem(null);
  };

  const handleSelectedInbound = async () => {
    if (!invoiceData) return;
    const targetList = invoiceData.list.filter((i) => i.checked);

    if (targetList.length === 0) {
      notify("입고 처리할 품목을 1개 이상 선택해 주세요.", "err");
      return;
    }

    if (!invoicePerson.trim()) {
      notify("담당자 이름을 입력해 주세요.", "err");
      return;
    }

    const updatedItems = [...items];
    const newTxs = [];
    let updateCount = 0;

    targetList.forEach(({ code, masterItem, inputQty }) => {
      if (masterItem && inputQty > 0) {
        const idx = updatedItems.findIndex((i) => i.code === code);
        if (idx !== -1) {
          updatedItems[idx] = {
            ...updatedItems[idx],
            stock: (Number(updatedItems[idx].stock) || 0) + inputQty,
          };
          updateCount++;

          newTxs.push({
            id: uid("IN"),
            type: "in",
            itemCode: masterItem.code,
            itemName: masterItem.name,
            unit: masterItem.unit,
            qty: inputQty,
            worker: invoicePerson,
            at: nowStr(),
            deleted: false,
          });
        }
      }
    });

    if (updateCount === 0) {
      notify("선택된 자재 중 마스터에 등록된 자재가 없거나 수량이 0입니다.", "err");
      return;
    }

    if (supabase) {
      const inboundOps = targetList
        .filter(({ masterItem, inputQty }) => masterItem && inputQty > 0)
        .map(({ masterItem, inputQty }, opIndex) => ({
          code: masterItem.code,
          delta: Number(inputQty),
          tx: newTxs[opIndex],
        }));
      await applyStockTransactionsAtomic(inboundOps);
      await reloadItems();
      await reloadTxs();
    } else {
      await saveItems(updatedItems);
      if (saveTxs) await saveTxs([...(txs || []), ...newTxs]);
    }

    notify(`선택한 ${updateCount}개 품목 입고 처리 완료!`, "ok");
    setInvoiceData(null);
    setInvoicePerson("");
  };

  const handleBatchInbound = async () => {
    if (!invoiceData || !invoiceData.list || invoiceData.list.length === 0) {
      notify("입고할 명세서 항목이 없습니다.", "err");
      return;
    }

    if (!invoicePerson.trim()) {
      notify("담당자 이름을 입력해 주세요.", "err");
      return;
    }

    const updatedItems = [...items];
    const newTxs = [];
    let updateCount = 0;

    invoiceData.list.forEach(({ code, masterItem, docQty }) => {
      if (masterItem && docQty > 0) {
        const idx = updatedItems.findIndex((i) => i.code === code);
        if (idx !== -1) {
          updatedItems[idx] = {
            ...updatedItems[idx],
            stock: (Number(updatedItems[idx].stock) || 0) + docQty,
          };
          updateCount++;

          newTxs.push({
            id: uid("IN"),
            type: "in",
            itemCode: masterItem.code,
            itemName: masterItem.name,
            unit: masterItem.unit,
            qty: docQty,
            worker: invoicePerson,
            at: nowStr(),
            deleted: false,
          });
        }
      }
    });

    if (updateCount === 0) {
      notify("마스터에 등록된 자재가 없습니다.", "err");
      return;
    }

    if (supabase) {
      const inboundOps = invoiceData.list
        .filter(({ masterItem, docQty }) => masterItem && docQty > 0)
        .map(({ masterItem, docQty }, opIndex) => ({
          code: masterItem.code,
          delta: Number(docQty),
          tx: newTxs[opIndex],
        }));
      await applyStockTransactionsAtomic(inboundOps);
      await reloadItems();
      await reloadTxs();
    } else {
      await saveItems(updatedItems);
      if (saveTxs) await saveTxs([...(txs || []), ...newTxs]);
    }

    notify(`명세서 [${invoiceData.key_code}] 전체 ${updateCount}건 일괄 입고 완료!`, "ok");
    setInvoiceData(null);
    setInvoicePerson("");
  };

  const handleSingleInbound = async () => {
    if (!selectedItem) {
      notify("자재를 선택하세요.", "err");
      return;
    }
    const inputQty = Number(qty);
    if (!inputQty || inputQty <= 0) {
      notify("올바른 수량을 입력하세요.", "err");
      return;
    }
    if (!person.trim()) {
      notify("담당자 이름을 입력하세요.", "err");
      return;
    }

    const nextItems = items.map((i) =>
      i.code === selectedItem.code ? { ...i, stock: (Number(i.stock) || 0) + inputQty } : i
    );

    const tx = {
      id: uid("IN"),
      type: "in",
      itemCode: selectedItem.code,
      itemName: selectedItem.name,
      unit: selectedItem.unit,
      qty: inputQty,
      worker: person,
      at: nowStr(),
      deleted: false,
    };

    if (supabase) {
      await applyStockTransactionsAtomic([{ code: selectedItem.code, delta: inputQty, tx }]);
      await reloadItems();
      await reloadTxs();
    } else {
      await saveItems(nextItems);
      if (saveTxs) await saveTxs([...(txs || []), tx]);
    }

    notify(`[${selectedItem.name}] ${inputQty}${selectedItem.unit} 입고 완료!`, "ok");
    setQty(1);
  };

  const cancelInTx = async (targetTx) => {
    if (!window.confirm(`[${targetTx.itemName}] ${targetTx.qty}${targetTx.unit} 입고 내역을 철회(재고 차감)하시겠습니까?`)) {
      return;
    }

    const nextItems = items.map((i) => {
      if (String(i.code).replace(/[\r\n]+/g, "").trim() === String(targetTx.itemCode).replace(/[\r\n]+/g, "").trim()) {
        return { ...i, stock: Math.max(0, Number(i.stock) - Number(targetTx.qty)) };
      }
      return i;
    });

    const nextTxs = (txs || []).filter((t) => t.id !== targetTx.id);

    if (supabase) {
      await applyStockTransactionsAtomic([{ code: targetTx.itemCode, delta: -Number(targetTx.qty), txDeleteId: targetTx.id }]);
      await reloadItems();
      await reloadTxs();
    } else {
      await saveItems(nextItems);
      if (saveTxs) await saveTxs(nextTxs);
    }
    notify(`입고가 철회되어 재고 ${targetTx.qty}${targetTx.unit}가 차감되었습니다.`, "info");
  };

  const isAllChecked = invoiceData?.list.every((i) => i.checked);

  return (
    <div>
      <Header title="입고 등록" subtitle="거래명세서 QR 스캔 (선택/일괄 입고) 및 개별 자재 입고 처리" />

      <Card neon="#38bdf8" style={{ padding: 16, marginBottom: 20, border: "2px solid #38bdf8", background: "#0b172a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "1.05rem", fontWeight: 600, color: "#38bdf8", marginBottom: 12 }}>
          <QrCode size={22} />
          <span>거래명세서 QR 스캔</span>
        </div>

        {!useCamera ? (
          <button
            onClick={() => setUseCamera(true)}
            style={{
              width: "100%", padding: "12px", background: "#0284c7", color: "#fff", border: "none",
              borderRadius: 8, fontWeight: "bold", fontSize: 14, cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12
            }}
          >
            <Camera size={18} /> 📹 카메라로 QR 스캔하기
          </button>
        ) : (
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <div id="inbound-qr-reader" style={{ width: "100%", maxWidth: 320, margin: "0 auto", background: "#000", borderRadius: 8, overflow: "hidden" }} />
            <button
              onClick={() => setUseCamera(false)}
              style={{ marginTop: 10, padding: "8px 16px", background: "#EF4444", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }}
            >
              📷 카메라 끄기
            </button>
          </div>
        )}

        <input
          type="text"
          value={invoiceQRInput}
          onChange={(e) => setInvoiceQRInput(e.target.value)}
          onKeyDown={handleInvoiceQRScan}
          placeholder="스캐너 스캔 또는 QR 키코드 입력 (예: 17035)..."
          disabled={loading}
          style={{
            width: "100%", height: 44, fontSize: "0.95rem", padding: "0 14px",
            border: "1px solid #0284c7", borderRadius: 8, backgroundColor: "#030712",
            color: "#ffffff", outline: "none", fontFamily: "'IBM Plex Mono', monospace",
          }}
          autoComplete="off"
        />

        {invoiceData && (
          <div style={{ marginTop: 16, background: "#0f172a", padding: 12, borderRadius: 8, border: "1px solid #1e293b" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: "bold", color: "#f59e0b" }}>
                  명세서 KEY: {invoiceData.key_code}
                </span>
                <span style={{ display: "block", fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>
                  공급자: {invoiceData.supplier}
                </span>
              </div>
              <Btn onClick={() => setInvoiceData(null)} variant="ghost" style={{ fontSize: 11, padding: "4px 8px" }}>
                닫기 / 취소
              </Btn>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0b1329", padding: "8px 12px", borderRadius: 6, marginBottom: 10, fontSize: 12, border: "1px solid #1e293b" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: "#38bdf8", fontWeight: 600 }}>
                <input type="checkbox" checked={isAllChecked} onChange={toggleAllCheck} style={{ width: 16, height: 16 }} />
                전체 선택
              </label>
              <span style={{ color: "#94a3b8" }}>
                총 <b>{invoiceData.list.length}</b>개 품목
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto", marginBottom: 14 }}>
              {invoiceData.list.map(({ code, masterItem, docQty, inputQty, checked }, idx) => {
                return (
                  <div 
                    key={idx} 
                    style={{ 
                      background: "#0b1329", 
                      border: `1px solid ${checked ? "#38bdf855" : "#1e293b"}`, 
                      borderRadius: 8, 
                      padding: "10px 12px", 
                      opacity: checked ? 1 : 0.5,
                      transition: "all 0.2s"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <input 
                        type="checkbox" 
                        checked={checked} 
                        onChange={() => toggleItemCheck(idx)} 
                        style={{ width: 18, height: 18, marginTop: 3, cursor: "pointer" }} 
                      />
                      
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: "#38bdf8", fontWeight: "bold" }}>
                          {code}
                        </div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#E7EEF5", marginTop: 2, wordBreak: "break-all" }}>
                          {masterItem ? masterItem.name : <span style={{ color: "#ef4444" }}>미등록 자재</span>}
                        </div>
                        {masterItem?.spec && (
                          <div style={{ fontSize: 11, color: "#7F97AC", fontFamily: "IBM Plex Mono", marginTop: 1 }}>
                            {masterItem.spec}
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>명세: {docQty} EA</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: "#38bdf8" }}>실입고:</span>
                          <input
                            type="number"
                            min="0"
                            value={inputQty}
                            disabled={!checked}
                            onChange={(e) => handleQtyChange(idx, e.target.value)}
                            style={{
                              ...inputStyle,
                              width: 58,
                              height: 30,
                              padding: "2px 4px",
                              fontSize: 12,
                              textAlign: "center",
                              borderColor: checked ? "#38bdf8" : "#334155",
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {!masterItem && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #1e293b", display: "flex", justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => handleOpenQuickReg(code)}
                          style={{
                            background: "#f59e0b", color: "#000", border: "none",
                            borderRadius: 4, padding: "4px 10px", fontSize: 11, fontWeight: "bold",
                            cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4
                          }}
                        >
                          <Plus size={12} /> 마스터 등록 바로가기
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between", borderTop: "1px solid #1e293b", paddingTop: 12 }}>
              <input
                type="text"
                value={invoicePerson}
                onChange={(e) => setInvoicePerson(e.target.value)}
                placeholder="담당자 이름 입력 *"
                style={{ ...inputStyle, width: "100%", maxWidth: 160, padding: "8px 12px" }}
              />

              <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 180 }}>
                <Btn onClick={handleSelectedInbound} style={{ flex: 1, backgroundColor: "#0284c7", color: "#ffffff", fontWeight: "bold", padding: "10px 8px", fontSize: 12.5, justifyContent: "center" }}>
                  선택 입고
                </Btn>
                <Btn onClick={handleBatchInbound} style={{ flex: 1, backgroundColor: "#f59e0b", color: "#000000", fontWeight: "bold", padding: "10px 8px", fontSize: 12.5, justifyContent: "center" }}>
                  전체 일괄
                </Btn>
              </div>
            </div>
          </div>
        )}
      </Card>

      {quickRegItem && (
        <div className="app-modal-overlay" style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
        }}>
          <div style={{ background: "#0F2233", border: "1px solid #38bdf8", borderRadius: 12, padding: 20, maxWidth: 360, width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: "#38bdf8" }}>⚡ 원클릭 자재 마스터 등록</h3>
              <X size={18} color="#7F97AC" style={{ cursor: "pointer" }} onClick={() => setQuickRegItem(null)} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="자재코드 (자동 입력)">
                <input style={{ ...inputStyle, opacity: 0.7 }} value={quickRegItem} readOnly />
              </Field>
              <Field label="품명 *">
                <input style={inputStyle} value={quickName} onChange={(e) => setQuickName(e.target.value)} placeholder="예: 케이블 타이" autoFocus />
              </Field>
              <Field label="규격/사양">
                <input style={inputStyle} value={quickSpec} onChange={(e) => setQuickSpec(e.target.value)} placeholder="예: 300mm Black" />
              </Field>
              <Field label="단위">
                <Select value={quickUnit} onChange={(e) => setQuickUnit(e.target.value)} options={["EA", "m", "kg", "roll", "set"]} />
              </Field>

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn variant="ghost" onClick={() => setQuickRegItem(null)} style={{ flex: 1, padding: "10px" }}>취소</Btn>
                <Btn onClick={handleSaveQuickReg} style={{ flex: 1, padding: "10px" }}>등록 완료</Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      <Card neon="#35D08C" style={{ maxWidth: 760, margin: "0 auto", padding: 22 }}>
        <h3 style={{ margin: "0 0 16px 0", color: "#94a3b8", fontSize: 14 }}>개별 자재 수동 입고</h3>
        
        <div className="inbound-grid-container">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="자재 검색 및 선택">
              <div ref={itemInputWrapRef} style={{ position: "relative" }}>
                <input
                  type="text"
                  style={{ ...inputStyle, paddingRight: itemSearchText ? 34 : inputStyle.paddingRight }}
                  value={itemSearchText}
                  onChange={(e) => {
                    setItemSearchText(e.target.value);
                    setSelectedCode("");
                    setItemDropdownOpen(true);
                  }}
                  onFocus={() => setItemDropdownOpen(true)}
                  placeholder="자재명 또는 코드를 입력/선택하세요"
                  autoComplete="off"
                />
                {itemSearchText && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setItemSearchText("");
                      setSelectedCode("");
                      setItemDropdownOpen(false);
                    }}
                    aria-label="선택 지우기"
                    style={{
                      position: "absolute", top: "50%", right: 10, transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer", padding: 4,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#7F97AC",
                    }}
                  >
                    <X size={16} />
                  </button>
                )}
                {itemDropdownOpen && filteredItemsForInbound.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                    background: "#0F2233", border: "1px solid #274460", borderRadius: 8,
                    marginTop: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", maxHeight: 220, overflowY: "auto",
                  }}>
                    {filteredItemsForInbound.map((i) => (
                      <div
                        key={i.code}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedCode(i.code);
                          setItemSearchText(`[${i.code}] ${i.name}`);
                          setItemDropdownOpen(false);
                        }}
                        style={{
                          padding: "10px 12px", borderBottom: "1px solid #16293C", cursor: "pointer",
                          fontSize: 13, color: "#E7EEF5", background: selectedCode === i.code ? "#1E3A5F" : "transparent"
                        }}
                      >
                        <div style={{ fontWeight: 600, color: "#38BDF8" }}>{i.name}</div>
                        <div style={{ fontSize: 11, color: "#7F97AC", fontFamily: "IBM Plex Mono" }}>{i.code} {i.spec ? `| ${i.spec}` : ""}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Field>

            {selectedItem && (
              <div style={{ fontSize: 11.5, color: "#64748b" }}>
                규격: {selectedItem.spec || "-"} | 업체: {selectedItem.manufacturer || "-"} | 위치: {selectedItem.location || "-"}
              </div>
            )}

            <Field label="입고 수량">
              <input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field label="담당자">
              <input
                type="text"
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                placeholder="이름 입력"
                style={inputStyle}
              />
            </Field>

            {selectedItem && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #1e293b", fontWeight: "bold", fontSize: 13 }}>
                <span>현재고 → 입고 후</span>
                <span style={{ color: "#10b981" }}>
                  {selectedItem.stock}EA → {(Number(selectedItem.stock) || 0) + (Number(qty) || 0)}EA
                </span>
              </div>
            )}

            <div style={{ marginTop: 4 }}>
              <Btn onClick={handleSingleInbound} style={{ width: "100%", height: 44, fontSize: 14, justifyContent: "center" }}>
                ↓ 입고 확정
              </Btn>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0B1C2C", border: "1px solid #274460", borderRadius: 10, padding: 16, height: "100%", minHeight: 200 }}>
            <span style={{ fontSize: 11.5, color: "#5E86A3", marginBottom: 10, fontFamily: "IBM Plex Mono", fontWeight: "bold" }}>자재 사진</span>
            {selectedItem && selectedItem.image_url ? (
              <img 
                src={selectedItem.image_url} 
                alt={selectedItem.name} 
                style={{ width: "100%", maxWidth: 160, height: 160, borderRadius: 8, objectFit: "cover", border: "1px solid #38BDF8" }} 
              />
            ) : (
              <div style={{ width: "100%", maxWidth: 160, height: 160, borderRadius: 8, background: "#0F2233", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 10, border: "1px dashed #274460" }}>
                <ImageIcon size={30} color="#5E86A3" style={{ marginBottom: 6 }} />
                <span style={{ fontSize: 11, color: "#7F97AC" }}>{selectedItem ? "사진 없음" : "자재 선택 시 표시"}</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card neon="#35D08C" style={{ padding: 16, marginTop: 20 }}>
        <SectionLabel>최근 등록된 입고 이력 (잘못 등록 시 철회)</SectionLabel>
        {recentInTxs.length === 0 ? (
          <EmptyState icon={ScanLine} text="최근 등록된 입고 내역이 없습니다." color="#5E86A3" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10, maxHeight: 560, overflowY: "auto" }}>
            {recentInTxs.map((t) => (
              <div
                key={t.id}
                style={{
                  background: "#0B1C2C", border: "1px solid #1F3B54", borderRadius: 8,
                  padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#35D08C" }}>
                    {t.itemName} ({t.qty} {t.unit})
                  </div>
                  <div style={{ fontSize: 11, color: "#5E86A3", fontFamily: "IBM Plex Mono", marginTop: 2 }}>
                    {t.at} | 담당자: {t.worker || "-"}
                  </div>
                </div>
                <button
                  onClick={() => cancelInTx(t)}
                  style={{
                    background: "#3A1C1C", border: "1px solid #EF5350", color: "#EF5350",
                    padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0
                  }}
                >
                  입고 철회
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
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

function OptionListEditor({ title, description, category, options, saveCategory, notify, placeholder }) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const addMultiple = async (rawText) => {
    const parts = rawText
      .split(/[\n\r,\t]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    const uniqueParts = Array.from(new Set(parts));
    const newOnes = uniqueParts.filter((p) => !options.includes(p));
    const skipped = uniqueParts.length - newOnes.length;

    if (newOnes.length === 0) {
      notify("모두 이미 등록된 항목입니다.", "err");
      return;
    }

    setSaving(true);
    await saveCategory(category, [...options, ...newOnes]);
    setSaving(false);
    setDraft("");

    if (newOnes.length === 1) {
      notify(`[${newOnes[0]}] 항목이 추가되었습니다.`, "ok");
    } else {
      notify(`${newOnes.length}개 항목이 추가되었습니다.${skipped > 0 ? ` (중복 ${skipped}개 제외)` : ""}`, "ok");
    }
  };

  const addOption = () => addMultiple(draft);

  const handlePaste = (e) => {
    const text = e.clipboardData.getData("text");
    if (/[\n\r,\t]/.test(text)) {
      e.preventDefault();
      addMultiple(text);
    }
  };

  const removeOption = async (val) => {
    if (!window.confirm(`[${val}] 항목을 목록에서 삭제하시겠습니까?`)) return;
    setSaving(true);
    await saveCategory(category, options.filter((o) => o !== val));
    setSaving(false);
    notify(`[${val}] 항목이 삭제되었습니다.`, "info");
  };

  return (
    <Card style={{ padding: 20 }}>
      <SectionLabel>{title}</SectionLabel>
      {description && (
        <div style={{ fontSize: 12, color: "#7F97AC", marginTop: -6, marginBottom: 14, fontFamily: "IBM Plex Mono" }}>{description}</div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addOption()}
          onPaste={handlePaste}
          placeholder={placeholder}
        />
        <Btn onClick={addOption} variant="subtle" disabled={saving}><Plus size={16} />추가</Btn>
      </div>
      <div style={{ fontSize: 11, color: "#5E86A3", marginBottom: 14, fontFamily: "IBM Plex Mono" }}>
        여러 개를 한 번에 추가하려면 줄바꿈 또는 쉼표(,)로 구분된 목록을 이 칸에 붙여넣으세요.
      </div>
      {options.length === 0 ? (
        <EmptyState icon={Package} text="등록된 항목이 없습니다." color="#5E86A3" />
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {options.map((opt) => (
            <div key={opt} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 10px 7px 12px",
              background: "#0B1C2C", border: "1px solid #274460", borderRadius: 20, fontSize: 13,
              color: "#E7EEF5", fontFamily: "IBM Plex Mono",
            }}>
              <span>{opt}</span>
              <button
                onClick={() => removeOption(opt)}
                disabled={saving}
                style={{ background: "none", border: "none", color: "#EF5350", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function OutFormSettingsView({ settings, saveCategory, notify }) {
  return (
    <div>
      <Header title="불출 설정 관리" subtitle="출고(스캔) 화면의 호선 · 프로젝트 · 공정구분 · 불출자 목록을 관리합니다 (PC 전용 · 전 기기 자동 동기화)" />
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <OptionListEditor
          title="호선 목록"
          description="출고 화면에서는 직접 입력도 가능하지만, 여기 등록해두면 검색 추천 목록으로 표시됩니다."
          category="ships"
          options={settings.ships}
          saveCategory={saveCategory}
          notify={notify}
          placeholder="예: H-2024"
        />
        <OptionListEditor
          title="프로젝트 목록"
          category="projects"
          options={settings.projects}
          saveCategory={saveCategory}
          notify={notify}
          placeholder="예: MSBD/LVSB"
        />
        <OptionListEditor
          title="공정구분 목록"
          category="processes"
          options={settings.processes}
          saveCategory={saveCategory}
          notify={notify}
          placeholder="예: 배전반 결선"
        />
        <OptionListEditor
          title="불출자 목록"
          category="workers"
          options={settings.workers}
          saveCategory={saveCategory}
          notify={notify}
          placeholder="예: 울산에이원"
        />
      </div>
    </div>
  );
}