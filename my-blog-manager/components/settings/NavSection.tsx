"use client";

import { motion } from 'framer-motion';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical } from 'lucide-react';

export default function NavSection({ formData, handleUpdate, pushToQueue }: any) {
  // 🌟 防崩溃兜底
  const navItems: any[] = formData?.navItems || [];

  // Reorder 回调：拖拽结束后把新顺序写回 formData
  const setItems = (next: any[]) => {
    handleUpdate('navItems', next);
  };

  // 切换某一项的 enabled 开关
  const toggleEnabled = (id: string) => {
    setItems(navItems.map((it) => (it.id === id ? { ...it, enabled: !it.enabled } : it)));
  };

  // 暂存到操作队列（沿用项目统一模式）
  const handleSave = () => {
    pushToQueue('顶栏导航设置');
  };

  return (
    <motion.section
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl border border-white/50 dark:border-slate-800/50 rounded-[40px] p-8 shadow-2xl relative"
    >
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">🧭 顶栏导航设置</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            拖拽左侧 <span className="font-bold">⠿</span> 手柄调整导航项顺序，右侧开关控制该项是否出现在前台顶栏。
            顺序即列表从上到下的排列，被关闭的项不会显示。
          </p>
        </div>

        <Reorder.Group
          axis="y"
          values={navItems}
          onReorder={setItems}
          as="ul"
          className="flex flex-col gap-3 list-none p-0 m-0"
        >
          {navItems.map((item) => (
            <NavRow key={item.id} item={item} onToggle={toggleEnabled} />
          ))}
        </Reorder.Group>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            className="px-8 py-3 bg-indigo-500 text-white rounded-2xl text-sm font-black shadow-lg shadow-indigo-500/30 hover:bg-indigo-600 hover:scale-105 transition-all"
          >
            暂存至操作队列
          </button>
        </div>
      </div>
    </motion.section>
  );
}

// 🌟 单行：拖拽手柄 + 名称 + href 预览 + 开关
function NavRow({ item, onToggle }: { item: any; onToggle: (id: string) => void }) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={dragControls}
      layout
      whileDrag={{ scale: 1.03, boxShadow: '0 10px 30px rgba(0,0,0,0.2)', cursor: 'grabbing' }}
      className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 rounded-2xl px-4 py-3 flex items-center gap-4 cursor-default touch-none"
    >
      {/* 拖拽手柄：仅此处可触发拖拽 */}
      <span
        onPointerDown={(e) => dragControls.start(e)}
        className="text-slate-400 hover:text-indigo-500 cursor-grab active:cursor-grabbing touch-none select-none shrink-0"
        title="拖拽调整顺序"
      >
        <GripVertical size={20} />
      </span>

      {/* 名称 + 路径 */}
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-black truncate ${item.enabled ? 'text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
          {item.name}
        </div>
        <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate font-mono">
          {item.href}
        </div>
      </div>

      {/* 开关：复用 ProfileSection 的手写 Tailwind 滑动按钮样式 */}
      <button
        onClick={() => onToggle(item.id)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
          item.enabled ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700'
        }`}
        title={item.enabled ? '已开启（点击关闭）' : '已关闭（点击开启）'}
      >
        <span className="sr-only">Toggle {item.name}</span>
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            item.enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </Reorder.Item>
  );
}
