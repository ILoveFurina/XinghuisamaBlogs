"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

interface ImageCropperProps {
  src: string;                 // 原图 object URL 或远程 URL
  aspectRatio?: number | null; // null/undefined = 自由裁剪；数值 = 锁定宽高比(w/h)
  maxWidth?: number;           // 输出长边上限，默认 2400
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
  title?: string;              // 如 "第 1/3 张"
}

type Rect = { x: number; y: number; w: number; h: number };

// 8 个手柄：四角 + 四边
const HANDLES = [
  { key: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
  { key: 'n', x: 0.5, y: 0, cursor: 'ns-resize' },
  { key: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { key: 'e', x: 1, y: 0.5, cursor: 'ew-resize' },
  { key: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
  { key: 's', x: 0.5, y: 1, cursor: 'ns-resize' },
  { key: 'sw', x: 0, y: 1, cursor: 'nesw-resize' },
  { key: 'w', x: 0, y: 0.5, cursor: 'ew-resize' },
] as const;

const MIN_SIZE = 48; // 裁剪框最小边（显示 px）

export default function ImageCropper({
  src,
  aspectRatio = null,
  maxWidth = 2400,
  onConfirm,
  onCancel,
  title,
}: ImageCropperProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // 自然尺寸与渲染尺寸（驱动渲染读数，用 state）
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  // 拖拽交互的临时状态（不驱动渲染，用 ref）
  const dragRef = useRef<{
    mode: 'move' | 'resize';
    handle?: string;
    startX: number;
    startY: number;
    orig: Rect;
  } | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  // 自由模式下可选锁定比例
  const [lockFree, setLockFree] = useState(false);

  // 推断输出类型：jpeg/png/webp 保持源；其它回退 png
  const inferOutputType = useCallback((srcUrl: string): 'image/jpeg' | 'image/png' | 'image/webp' => {
    const m = srcUrl.match(/\.(jpe?g|png|webp)(\?|$)/i);
    if (m) {
      const ext = m[1].toLowerCase();
      if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
      if (ext === 'png') return 'image/png';
      if (ext === 'webp') return 'image/webp';
    }
    // object URL 的 type 无法从路径判断，默认 jpeg（照片最常见）
    return 'image/jpeg';
  }, []);

  // 计算初始裁剪框
  const computeInitialRect = useCallback((dispW: number, dispH: number, ratio: number | null): Rect => {
    if (ratio) {
      // 锁定比例：容器内最大居中该比例矩形
      let w = dispW, h = w / ratio;
      if (h > dispH) { h = dispH; w = h * ratio; }
      w *= 0.9; h *= 0.9;
      return { x: (dispW - w) / 2, y: (dispH - h) / 2, w, h };
    }
    // 自由：80% 居中
    const w = dispW * 0.8, h = dispH * 0.8;
    return { x: (dispW - w) / 2, y: (dispH - h) / 2, w, h };
  }, []);

  const handleImageLoad = useCallback(() => {
    const img = imgRef.current;
    const cont = containerRef.current;
    if (!img || !cont) return;
    const nat = { w: img.naturalWidth, h: img.naturalHeight };
    const b = cont.getBoundingClientRect();
    const disp = { w: b.width, h: b.height };
    setNatural(nat);
    setDisplaySize(disp);
    setRect(computeInitialRect(disp.w, disp.h, aspectRatio));
    setLoaded(true);
  }, [aspectRatio, computeInitialRect]);

  // clamp 裁剪框到显示区内并保证最小尺寸（可选锁定比例）
  const clampRect = useCallback((r: Rect, dispW: number, dispH: number, ratio: number | null): Rect => {
    let { x, y, w, h } = r;
    if (ratio) {
      // 以 w 为主推导 h，保证比例
      if (w / ratio > h) h = w / ratio; else w = h * ratio;
    }
    w = Math.max(MIN_SIZE, w);
    h = Math.max(MIN_SIZE, h);
    if (ratio) {
      // 修正后再次保比例（以较小者为准，避免超出）
      if (w / ratio > h) w = h * ratio; else h = w / ratio;
    }
    w = Math.min(w, dispW);
    h = Math.min(h, dispH);
    x = Math.max(0, Math.min(x, dispW - w));
    y = Math.max(0, Math.min(y, dispH - h));
    return { x, y, w, h };
  }, []);

  const onPointerDown = (e: React.PointerEvent, mode: 'move' | 'resize', handle?: string) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...rect },
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const disp = displaySize;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const o = drag.orig;
    const ratio = aspectRatio ?? (lockFree ? rect.w / rect.h : null);

    if (drag.mode === 'move') {
      setRect(clampRect({ ...o, x: o.x + dx, y: o.y + dy }, disp.w, disp.h, ratio));
      return;
    }

    // resize：根据手柄调整对应边
    let { x, y, w, h } = o;
    const hInfo = HANDLES.find(hh => hh.key === drag.handle);
    if (!hInfo) return;
    const left = hInfo.x === 0, right = hInfo.x === 1;
    const top = hInfo.y === 0, bottom = hInfo.y === 1;
    if (right) w = o.w + dx;
    if (left) { w = o.w - dx; x = o.x + dx; }
    if (bottom) h = o.h + dy;
    if (top) { h = o.h - dy; y = o.y + dy; }
    // 防止翻转
    if (w < MIN_SIZE) { if (left) x = o.x + o.w - MIN_SIZE; w = MIN_SIZE; }
    if (h < MIN_SIZE) { if (top) y = o.y + o.h - MIN_SIZE; h = MIN_SIZE; }
    setRect(clampRect({ x, y, w, h }, disp.w, disp.h, ratio));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) {
      try { (e.target as Element).releasePointerCapture(e.pointerId); } catch {}
    }
    dragRef.current = null;
  };

  // 窗口尺寸变化时重新计算显示尺寸与裁剪框比例
  useEffect(() => {
    const onResize = () => {
      const cont = containerRef.current;
      if (!cont || !loaded) return;
      const b = cont.getBoundingClientRect();
      const old = displaySize;
      // 按比例迁移裁剪框
      const sx = b.width / (old.w || 1);
      const sy = b.height / (old.h || 1);
      setDisplaySize({ w: b.width, h: b.height });
      setRect(prev => clampRect({ x: prev.x * sx, y: prev.y * sy, w: prev.w * sx, h: prev.h * sy }, b.width, b.height, aspectRatio));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [loaded, aspectRatio, clampRect, displaySize]);

  // 确认裁剪：canvas drawImage 输出 Blob
  const handleConfirm = async () => {
    const img = imgRef.current;
    if (!img) return;
    const nat = natural;
    const disp = displaySize;
    const scaleX = nat.w / disp.w;
    const scaleY = nat.h / disp.h;
    let sx = rect.x * scaleX;
    let sy = rect.y * scaleY;
    let sW = rect.w * scaleX;
    let sH = rect.h * scaleY;
    // 防御性 clamp
    sW = Math.max(1, Math.min(sW, nat.w - sx));
    sH = Math.max(1, Math.min(sH, nat.h - sy));
    sx = Math.max(0, Math.min(sx, nat.w - 1));
    sy = Math.max(0, Math.min(sy, nat.h - 1));

    // 输出尺寸封顶
    const longEdge = Math.max(sW, sH);
    const scale = longEdge > maxWidth ? maxWidth / longEdge : 1;
    const outW = Math.max(1, Math.round(sW * scale));
    const outH = Math.max(1, Math.round(sH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sW, sH, 0, 0, outW, outH);

    const type = inferOutputType(src);
    const quality = type === 'image/png' ? undefined : 0.92;
    canvas.toBlob((blob) => {
      if (blob) onConfirm(blob);
    }, type, quality);
  };

  // 实时像素尺寸读数
  const outW = loaded && displaySize.w ? Math.round(rect.w * (natural.w / displaySize.w)) : 0;
  const outH = loaded && displaySize.h ? Math.round(rect.h * (natural.h / displaySize.h)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col gap-3"
    >
      {title && (
        <div className="text-xs font-bold text-slate-600 dark:text-slate-300 text-center">{title}</div>
      )}
      <div
        ref={containerRef}
        className="relative w-full select-none touch-none rounded-2xl overflow-hidden bg-slate-900/80 dark:bg-black/60 border border-white/30 dark:border-slate-700/50 shadow-inner"
        // 容器宽高比 = 图片自然比例，使 object-contain 无黑边、显示尺寸==图片尺寸
        style={natural.w && natural.h ? { aspectRatio: `${natural.w} / ${natural.h}` } : undefined}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <img
          ref={imgRef}
          src={src}
          alt="待裁剪"
          draggable={false}
          onLoad={handleImageLoad}
          className="block w-full h-full object-contain pointer-events-none"
        />
        {loaded && (
          <>
            {/* 遮罩：用 4 块半透明覆盖裁剪框外区域 */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute bg-black/50" style={{ top: 0, left: 0, right: 0, height: rect.y }} />
              <div className="absolute bg-black/50" style={{ top: rect.y + rect.h, left: 0, right: 0, bottom: 0 }} />
              <div className="absolute bg-black/50" style={{ top: rect.y, left: 0, width: rect.x, height: rect.h }} />
              <div className="absolute bg-black/50" style={{ top: rect.y, left: rect.x + rect.w, right: 0, height: rect.h }} />
            </div>

            {/* 裁剪框 */}
            <div
              onPointerDown={(e) => onPointerDown(e, 'move')}
              className="absolute border-2 border-emerald-400 cursor-move"
              style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            >
              {/* 九宫格辅助线 */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/3 left-0 right-0 border-t border-white/40" />
                <div className="absolute top-2/3 left-0 right-0 border-t border-white/40" />
                <div className="absolute left-1/3 top-0 bottom-0 border-l border-white/40" />
                <div className="absolute left-2/3 top-0 bottom-0 border-l border-white/40" />
              </div>
              {/* 8 个手柄 */}
              {HANDLES.map(hh => (
                <div
                  key={hh.key}
                  onPointerDown={(e) => onPointerDown(e, 'resize', hh.key)}
                  className="absolute w-3.5 h-3.5 bg-emerald-400 border-2 border-white rounded-sm shadow"
                  style={{
                    left: `calc(${hh.x * 100}% - 7px)`,
                    top: `calc(${hh.y * 100}% - 7px)`,
                    cursor: hh.cursor,
                    touchAction: 'none',
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          {loaded ? `输出尺寸：${outW} × ${outH}px` : '加载中…'}
        </div>
        {!aspectRatio && (
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={lockFree}
              onChange={(e) => setLockFree(e.target.checked)}
              className="w-3.5 h-3.5 accent-emerald-500"
            />
            锁定比例
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onCancel}
          className="py-2.5 rounded-xl bg-white/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 font-bold text-xs hover:bg-white dark:hover:bg-slate-700 transition-all shadow-sm"
        >
          取消
        </button>
        <button
          onClick={handleConfirm}
          disabled={!loaded}
          className="py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black text-xs shadow-lg shadow-emerald-500/30 hover:from-emerald-600 hover:to-teal-600 transition-all active:scale-95 disabled:opacity-50"
        >
          ✂️ 确认裁剪
        </button>
      </div>
    </motion.div>
  );
}
