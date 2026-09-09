import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  AlertCircle, 
  CheckCircle2, 
  Download, 
  Filter, 
  Info, 
  Search, 
  Terminal, 
  Trash2 
} from 'lucide-react';
import { TerminalLog } from '../types';

interface LogsViewProps {
  logs: TerminalLog[];
  onClearLogs: () => void;
}

export const LogsView: React.FC<LogsViewProps> = ({ logs, onClearLogs }) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterType !== 'all' && log.type !== filterType) return false;
      if (searchQuery.trim() && !log.text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [logs, filterType, searchQuery]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  const handleExportLogs = () => {
    const content = logs.map((l) => `[${l.time}] [${l.type.toUpperCase()}] ${l.text}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kara-para-terminal-logs-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      {/* Log Header Controls */}
      <div className="bg-white/95 dark:bg-stone-900 p-4 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-rose-500" />
            <h2 className="text-base font-black text-stone-900 dark:text-stone-100">
              Terminal & Sistem Günlükleri
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
              {filteredLogs.length} / {logs.length}
            </span>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            <button
              type="button"
              onClick={handleExportLogs}
              className="px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-bold border border-stone-200 dark:border-stone-700 flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-stone-500" />
              <span>İndir (.txt)</span>
            </button>

            <button
              type="button"
              onClick={onClearLogs}
              className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 text-xs font-bold border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Temizle</span>
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2 border-t border-rose-100 dark:border-stone-800">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Loglarda filtrele veya ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-rose-400 text-stone-900 dark:text-stone-100"
            />
          </div>

          <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 p-1 rounded-xl text-xs font-bold">
            {(['all', 'info', 'success', 'warn', 'error'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setFilterType(type)}
                className={`px-2.5 py-1 rounded-lg capitalize transition-all ${
                  filterType === type
                    ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 shadow-2xs'
                    : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Terminal Display */}
      <div
        ref={logContainerRef}
        className="bg-stone-950 text-stone-200 font-mono text-xs p-4 rounded-2xl border border-stone-800 h-[480px] overflow-y-auto space-y-1.5 shadow-inner"
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-stone-500 italic">
            Kayıtlı terminal mesajı bulunmuyor.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isError = log.type === 'error';
            const isWarn = log.type === 'warn';
            const isSuccess = log.type === 'success';

            return (
              <div
                key={log.id}
                className="flex items-start gap-2 py-0.5 hover:bg-stone-900/80 px-1.5 rounded transition-colors"
              >
                <span className="text-stone-500 shrink-0 text-[11px] select-none">
                  [{log.time}]
                </span>
                <span
                  className={`font-bold uppercase text-[10px] px-1 py-0.2 rounded shrink-0 ${
                    isError
                      ? 'bg-rose-950 text-rose-400 border border-rose-800'
                      : isWarn
                      ? 'bg-amber-950 text-amber-400 border border-amber-800'
                      : isSuccess
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-stone-800 text-stone-300'
                  }`}
                >
                  {log.type}
                </span>
                <span
                  className={`break-all leading-relaxed ${
                    isError
                      ? 'text-rose-300 font-medium'
                      : isWarn
                      ? 'text-amber-300'
                      : isSuccess
                      ? 'text-emerald-300'
                      : 'text-stone-300'
                  }`}
                >
                  {log.text}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-stone-500 font-mono px-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded text-rose-600 focus:ring-rose-500"
          />
          <span>Yeni loglarda otomatik aşağı kaydır</span>
        </label>
        <span>WebSocket Log Stream v3.1</span>
      </div>
    </div>
  );
};
