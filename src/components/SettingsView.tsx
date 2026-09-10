import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { 
  AlertTriangle,
  Check, 
  Copy, 
  Cpu, 
  Download, 
  Eye, 
  EyeOff, 
  Layers,
  Moon, 
  Plus, 
  RotateCcw, 
  Sliders, 
  Sun, 
  Trash2, 
  Upload, 
  Volume2, 
  VolumeX, 
  X,
  Zap 
} from 'lucide-react';
import { soundEngine } from '../audio';
import { BucketManager } from '../engine';
import { AppSettings, CustomBucket } from '../types';

interface SettingsViewProps {
  bucketManager: BucketManager;
  customBuckets: CustomBucket[];
  appSettings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  onRefreshCustomBuckets: () => void;
}

// ------------------------------------------------------------------------
// 📊 BUCKET DAĞILIM & SPEKTRUM ÖNİZLEMESİ (GÖRSEL LOGARİTMİK ÇUBUK)
// ------------------------------------------------------------------------
const BucketDistributionPreview: React.FC<{
  buckets: CustomBucket[];
  proposedMin?: number;
  proposedMax?: number;
  proposedSmart?: boolean;
}> = memo(({ buckets, proposedMin, proposedMax, proposedSmart }) => {
  const activeBuckets = useMemo(() => {
    return [...buckets]
      .filter((b) => b.isActive)
      .sort((a, b) => a.minValue - b.minValue);
  }, [buckets]);

  if (activeBuckets.length === 0 && (proposedMin === undefined || proposedMax === undefined)) {
    return null;
  }

  const minUsdt = 1;
  const maxUsdt = Math.max(
    100_000,
    ...activeBuckets.map((b) => b.maxValue),
    proposedMax || 0
  );

  const getLogPos = (val: number) => {
    const safeVal = Math.max(minUsdt, val);
    const logMin = Math.log10(minUsdt);
    const logMax = Math.log10(maxUsdt);
    const ratio = (Math.log10(safeVal) - logMin) / (logMax - logMin);
    return Math.min(100, Math.max(0, ratio * 100));
  };

  return (
    <div className="p-3 bg-stone-50 dark:bg-stone-800/80 rounded-xl border border-stone-200 dark:border-stone-700 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-rose-500" />
          <span className="text-[11px] font-bold text-stone-800 dark:text-stone-200">
            Kova Spektrum & Dağılım Önizlemesi (Logaritmik $1 - ${Math.round(maxUsdt / 1000)}k)
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> Smart Money
          </span>
          <span className="flex items-center gap-1 text-stone-500 dark:text-stone-400">
            <span className="w-2 h-2 rounded-full bg-stone-400" /> Retail
          </span>
        </div>
      </div>

      {/* Spektrum Çubuğu */}
      <div className="relative w-full h-5 bg-stone-200 dark:bg-stone-900 rounded-lg overflow-hidden border border-stone-300 dark:border-stone-700">
        {activeBuckets.map((b) => {
          const left = getLogPos(b.minValue);
          const right = getLogPos(b.maxValue);
          const width = Math.max(0.5, right - left);

          return (
            <div
              key={b.id}
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: b.color || (b.isSmartMoney ? '#F59E0B' : '#A8A29E'),
              }}
              title={`${b.icon} ${b.name}: $${b.minValue.toLocaleString()} - $${b.maxValue.toLocaleString()} (${b.isSmartMoney ? 'Smart' : 'Retail'})`}
              className="absolute top-0 bottom-0 opacity-80 hover:opacity-100 hover:brightness-110 transition-opacity cursor-pointer border-r border-black/20"
            />
          );
        })}

        {/* Yeni eklenecek kovanın önizleme şeridi */}
        {proposedMin !== undefined && proposedMax !== undefined && proposedMax > proposedMin && (
          <div
            style={{
              left: `${getLogPos(proposedMin)}%`,
              width: `${Math.max(1, getLogPos(proposedMax) - getLogPos(proposedMin))}%`,
            }}
            className={`absolute top-0 bottom-0 border-2 border-dashed ${
              proposedSmart ? 'border-amber-400 bg-amber-500/40' : 'border-rose-400 bg-rose-500/40'
            } animate-pulse z-10 pointer-events-none`}
            title={`Taslak: $${proposedMin} - $${proposedMax}`}
          />
        )}
      </div>

      {/* Eksen Etiketleri */}
      <div className="flex justify-between text-[9px] font-mono text-stone-400">
        <span>$1</span>
        <span>$100</span>
        <span>$1K</span>
        <span>$10K</span>
        <span>$100K+</span>
      </div>
    </div>
  );
});

// ------------------------------------------------------------------------
// 🧩 YEREL STATE & DIRTY KORUMALI SATIR BİLEŞENİ (KLAVYE FOCUS KAYBINI ÖNLER)
// ------------------------------------------------------------------------
interface EditableBucketRowProps {
  bucket: CustomBucket;
  isDeleting: boolean;
  onStartDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onToggleActive: () => void;
  onToggleSmart: () => void;
  onSaveUpdate: (updates: Partial<CustomBucket>) => void;
  isOverlap?: boolean;
}

const EditableBucketRow: React.FC<EditableBucketRowProps> = memo(({
  bucket,
  isDeleting,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
  onToggleActive,
  onToggleSmart,
  onSaveUpdate,
  isOverlap = false,
}) => {
  const [localName, setLocalName] = useState(bucket.name);
  const [localMin, setLocalMin] = useState(bucket.minValue.toString());
  const [localMax, setLocalMax] = useState(bucket.maxValue.toString());
  const [localIcon, setLocalIcon] = useState(bucket.icon);
  const [localColor, setLocalColor] = useState(bucket.color);
  const [isDirty, setIsDirty] = useState(false);

  // Sadece kullanıcı düzenleme yapmıyorken (dirty=false) dışarıdan gelen güncellemeyi al
  useEffect(() => {
    if (isDirty) return;
    setLocalName(bucket.name);
    setLocalMin(bucket.minValue.toString());
    setLocalMax(bucket.maxValue.toString());
    setLocalIcon(bucket.icon);
    setLocalColor(bucket.color);
  }, [bucket.name, bucket.minValue, bucket.maxValue, bucket.icon, bucket.color, isDirty]);

  const commitChanges = useCallback(() => {
    const trimmedName = localName.trim();
    const minVal = parseFloat(localMin);
    const maxVal = parseFloat(localMax);
    const trimmedIcon = localIcon.trim() || '💎';

    // Geçersiz değerlerde eski orijinal kova değerlerine geri dön
    if (!trimmedName) {
      setLocalName(bucket.name);
    }
    if (isNaN(minVal) || isNaN(maxVal) || minVal < 0 || maxVal <= minVal) {
      setLocalMin(bucket.minValue.toString());
      setLocalMax(bucket.maxValue.toString());
      setIsDirty(false);
      return;
    }

    const updates: Partial<CustomBucket> = {};
    if (trimmedName && trimmedName !== bucket.name) updates.name = trimmedName;
    if (!isNaN(minVal) && Math.round(minVal) !== bucket.minValue) updates.minValue = Math.round(minVal);
    if (!isNaN(maxVal) && Math.round(maxVal) !== bucket.maxValue) updates.maxValue = Math.round(maxVal);
    if (trimmedIcon !== bucket.icon) updates.icon = trimmedIcon;
    if (localColor !== bucket.color) updates.color = localColor;

    if (Object.keys(updates).length > 0) {
      onSaveUpdate(updates);
    }
    setIsDirty(false);
  }, [localName, localMin, localMax, localIcon, localColor, bucket, onSaveUpdate]);

  return (
    <tr className={`transition-colors ${isOverlap ? 'bg-amber-500/10' : 'hover:bg-rose-50/40 dark:hover:bg-stone-800/40'}`}>
      {/* İkon & Kova Adı */}
      <td className="p-2.5">
        <div className="flex items-center gap-1.5 text-stone-900 dark:text-stone-100 font-bold">
          <input
            type="text"
            value={localIcon}
            maxLength={8}
            onChange={(e) => {
              setLocalIcon(e.target.value);
              setIsDirty(true);
            }}
            onBlur={commitChanges}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="w-8 px-1 py-0.5 text-center bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded text-xs"
            title="İkonu Değiştir"
          />
          <input
            type="text"
            value={localName}
            onChange={(e) => {
              setLocalName(e.target.value);
              setIsDirty(true);
            }}
            onBlur={commitChanges}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="bg-transparent border-b border-dashed border-stone-300 dark:border-stone-700 px-1 py-0.5 text-xs font-bold w-32 sm:w-36 focus:border-rose-500 focus:outline-hidden"
            title="İsmi Değiştir (Enter veya dışarı tıkla)"
          />
          {isOverlap && (
            <span title="Aralık Çakışması Algılandı" className="text-amber-500 shrink-0">
              <AlertTriangle className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      </td>

      {/* Min USDT */}
      <td className="p-2.5">
        <input
          type="number"
          value={localMin}
          onChange={(e) => {
            setLocalMin(e.target.value);
            setIsDirty(true);
          }}
          onBlur={commitChanges}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-20 sm:w-24 px-1.5 py-0.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded text-xs font-mono tabular-nums focus:border-rose-500 focus:outline-hidden"
          title="Minimum USDT tutarı"
        />
      </td>

      {/* Max USDT */}
      <td className="p-2.5">
        <input
          type="number"
          value={localMax}
          onChange={(e) => {
            setLocalMax(e.target.value);
            setIsDirty(true);
          }}
          onBlur={commitChanges}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-20 sm:w-24 px-1.5 py-0.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded text-xs font-mono tabular-nums focus:border-rose-500 focus:outline-hidden"
          title="Maksimum USDT tutarı"
        />
      </td>

      {/* Renk */}
      <td className="p-2.5">
        <input
          type="color"
          value={localColor}
          onChange={(e) => {
            setLocalColor(e.target.value);
            setIsDirty(true);
          }}
          onBlur={commitChanges}
          className="w-6 h-6 p-0 rounded border-0 cursor-pointer"
          title="Renk Seçin"
        />
      </td>

      {/* Tür: Smart vs Retail */}
      <td className="p-2.5">
        <button
          type="button"
          onClick={onToggleSmart}
          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
            bucket.isSmartMoney
              ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
              : 'bg-stone-100 dark:bg-stone-800 text-stone-500 border-stone-200 dark:border-stone-700'
          }`}
        >
          {bucket.isSmartMoney ? 'Smart' : 'Retail'}
        </button>
      </td>

      {/* Durum: Aktif vs Gizli */}
      <td className="p-2.5">
        <button
          type="button"
          onClick={onToggleActive}
          className="flex items-center gap-1 text-xs text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 cursor-pointer"
        >
          {bucket.isActive ? (
            <Eye className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <EyeOff className="w-3.5 h-3.5 text-stone-400" />
          )}
          <span>{bucket.isActive ? 'Aktif' : 'Gizli'}</span>
        </button>
      </td>

      {/* Silme - Onay Korumalı (Iframe Sandbox Uyumlu Inline Silme) */}
      <td className="p-2.5 text-right whitespace-nowrap">
        {isDeleting ? (
          <div className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-950/80 p-1 rounded-lg border border-rose-200 dark:border-rose-800 animate-in fade-in">
            <span className="text-[10px] font-bold text-rose-700 dark:text-rose-300 px-1">Silinsin mi?</span>
            <button
              type="button"
              onClick={onConfirmDelete}
              className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold cursor-pointer transition-colors shadow-xs"
            >
              Evet
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              className="px-1.5 py-0.5 bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 text-stone-700 dark:text-stone-300 rounded text-[10px] font-bold cursor-pointer transition-colors"
            >
              Vazgeç
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onStartDelete}
            className="p-1 text-stone-400 hover:text-rose-600 transition-colors cursor-pointer"
            title="Kovayı Sil"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </td>
    </tr>
  );
});

// ------------------------------------------------------------------------
// ⚙️ ANA SETTINGS VIEW BİLEŞENİ
// ------------------------------------------------------------------------
export const SettingsView: React.FC<SettingsViewProps> = ({
  bucketManager,
  customBuckets,
  appSettings,
  onUpdateSettings,
  onRefreshCustomBuckets,
}) => {
  // Yeni kova ekleme form state
  const [newName, setNewName] = useState('');
  const [newMin, setNewMin] = useState('1000');
  const [newMax, setNewMax] = useState('5000');
  const [newIcon, setNewIcon] = useState('💎');
  const [newColor, setNewColor] = useState('#EC4899');
  const [newIsSmart, setNewIsSmart] = useState(false);
  const [formError, setFormError] = useState('');

  // Silme işlemi için inline state
  const [deletingBucketId, setDeletingBucketId] = useState<string | null>(null);

  // Sıfırlama modalı
  const [showResetModal, setShowResetModal] = useState(false);

  // İçe/Dışa Aktar state
  const [jsonImportText, setJsonImportText] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const copyTimeoutRef = useRef<any>(null);

  // Toast bildirim state & deterministik timer
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  }, []);

  // Kova Ekleme İşleyicisi (Domain Validation Entegrasyonu)
  const handleCreateBucket = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const minVal = parseFloat(newMin);
    const maxVal = parseFloat(newMax);

    const result = bucketManager.createManualBucket({
      name: newName.trim(),
      minValue: minVal,
      maxValue: maxVal,
      icon: newIcon.trim() || '💎',
      color: newColor,
      isActive: true,
      isSmartMoney: newIsSmart,
    });

    if (result.success) {
      setNewName('');
      setNewMin(maxVal.toString());
      setNewMax((maxVal * 2).toString());
      onRefreshCustomBuckets();
      soundEngine.playSignalChime('alert');
      showToast(`"${newName.trim()}" kovası başarıyla eklendi!`);
    } else {
      setFormError(result.message);
    }
  };

  // Otomatik 100 Kovaya Genişletme (Net İsim & Geri Bildirim)
  const handleAutoExpand = () => {
    const result = bucketManager.expandTo100Buckets();
    if (result.success) {
      onRefreshCustomBuckets();
      soundEngine.playSignalChime('bull');
      showToast(`Kovalar ${result.count} dilimlik logaritmik algoritmaya genişletildi!`);
    } else {
      showToast(result.message, 'error');
    }
  };

  // Sıfırlama Onayı
  const executeReset = () => {
    bucketManager.resetCustomBuckets();
    onRefreshCustomBuckets();
    setShowResetModal(false);
    showToast('Tüm özel kovalar varsayılana sıfırlandı.', 'info');
  };

  // Silme Onayı
  const executeDeleteBucket = (id: string) => {
    const res = bucketManager.removeCustomBucket(id);
    onRefreshCustomBuckets();
    setDeletingBucketId(null);
    if (res.success) {
      showToast(`"${res.removedName || 'Kova'}" silindi.`, 'info');
    }
  };

  // Güvenli JSON Dışa Aktarma (Clipboard API + Fallback + Try/Catch)
  const handleExportJson = async () => {
    try {
      const data = bucketManager.exportCustomBuckets();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(data);
      } else {
        // Fallback: execCommand
        const textArea = document.createElement('textarea');
        textArea.value = data;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopySuccess(true);
      showToast('Kova JSON konfigürasyonu panoya kopyalandı!');
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopySuccess(false), 2000);
    } catch (e) {
      showToast('Panoya kopyalama başarısız oldu.', 'error');
    }
  };

  // JSON İçe Aktarma - Şema Hata Mesajı Gösterimi
  const handleImportJson = () => {
    if (!jsonImportText.trim()) return;
    const result = bucketManager.importCustomBuckets(jsonImportText);
    if (result.success) {
      setJsonImportText('');
      onRefreshCustomBuckets();
      showToast(`${result.count} kova başarıyla içe aktarıldı!`, 'success');
    } else {
      showToast(result.message, 'error');
    }
  };

  const parsedNewMin = parseFloat(newMin);
  const parsedNewMax = parseFloat(newMax);

  return (
    <div className="space-y-5 relative pb-[env(safe-area-inset-bottom)]">
      {/* TOAST BİLDİRİM BİLEŞENİ */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-bounce">
          <div className={`px-4 py-2.5 rounded-xl shadow-lg border flex items-center gap-2 text-xs font-bold ${
            toast.type === 'success' 
              ? 'bg-emerald-600 text-white border-emerald-500' 
              : toast.type === 'error'
              ? 'bg-rose-600 text-white border-rose-500'
              : 'bg-stone-900 text-white border-stone-800 dark:bg-stone-100 dark:text-stone-900'
          }`}>
            <span>{toast.message}</span>
            <button type="button" onClick={() => setToast(null)} className="ml-2 hover:opacity-80 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* SIFIRLAMA ONAY MODALI (IFRAME UYUMLU) */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-rose-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-sm font-black text-stone-900 dark:text-stone-100">Kovaları Sıfırla?</h3>
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-400">
              Tüm özel kovalar varsayılan temiz duruma dönecektir. Yaptığınız değişiklikler silinecektir.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={executeReset}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs cursor-pointer"
              >
                Evet, Sıfırla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. SİSTEM & ARAYÜZ YAPILANDIRMASI */}
      <section className="bg-white/95 dark:bg-stone-900 p-4 sm:p-5 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-rose-500" />
          <h2 className="text-base font-black text-stone-900 dark:text-stone-100">
            Sistem & Performans Yapılandırması
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          {/* Ring Buffer Derinliği - Domain üzerinden Atomik Güncelleme */}
          <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-800 dark:text-stone-200">
                Ring Buffer Boyutu (İşlem Belleği)
              </span>
              <span className="text-xs font-mono font-black text-rose-600 dark:text-rose-400 tabular-nums">
                {appSettings.bufferSize.toLocaleString()}
              </span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {[500, 1000, 2000, 5000, 10000].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => {
                    const validSize = bucketManager.setBufferSize(size);
                    onUpdateSettings({ bufferSize: validSize });
                    showToast(`Ring Buffer ${validSize.toLocaleString()} boyuta ayarlandı`);
                  }}
                  className={`flex-1 min-w-[55px] py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    appSettings.bufferSize === size
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-white dark:bg-stone-700 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-600 hover:bg-rose-50'
                  }`}
                >
                  {size >= 1000 ? `${size / 1000}k` : size}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-stone-500 dark:text-stone-400">
              Quantile P70/P90/P98 hesaplamalarında kullanılan dinamik kayan pencere
            </p>
          </div>

          {/* Tema ve Ses */}
          <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 space-y-2">
            <span className="text-xs font-bold text-stone-800 dark:text-stone-200 block">
              Görsel & Ses Tercihleri
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const nextTheme = appSettings.theme === 'dark' ? 'light' : 'dark';
                  onUpdateSettings({ theme: nextTheme });
                }}
                className="flex-1 py-2 px-3 rounded-lg text-xs font-bold border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-200 flex items-center justify-center gap-1.5 transition-colors hover:bg-rose-50 dark:hover:bg-stone-600 cursor-pointer"
              >
                {appSettings.theme === 'dark' ? <Moon className="w-3.5 h-3.5 text-indigo-400" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
                <span>{appSettings.theme === 'dark' ? 'Karanlık Mod' : 'Aydınlık Mod'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const nextSound = !appSettings.soundEnabled;
                  onUpdateSettings({ soundEnabled: nextSound });
                  soundEngine.setMuted(!nextSound);
                  if (nextSound) soundEngine.playSignalChime('bull');
                }}
                className="flex-1 py-2 px-3 rounded-lg text-xs font-bold border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-200 flex items-center justify-center gap-1.5 transition-colors hover:bg-rose-50 dark:hover:bg-stone-600 cursor-pointer"
              >
                {appSettings.soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-500" /> : <VolumeX className="w-3.5 h-3.5 text-stone-400" />}
                <span>{appSettings.soundEnabled ? 'Ses: Açık' : 'Ses: Kapalı'}</span>
              </button>
            </div>
            <p className="text-[10px] text-stone-500 dark:text-stone-400">
              Web Audio sentezleyici ile Boğa Emilimi / Dağıtım tespitinde anlık bildirim tonu
            </p>
          </div>
        </div>
      </section>

      {/* 2. KOVA YÖNETİMİ & 100 KOVA KERNEL GENİŞLETİCİ */}
      <section className="bg-white/95 dark:bg-stone-900 p-4 sm:p-5 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-rose-500" />
            <h2 className="text-base font-black text-stone-900 dark:text-stone-100">
              Özel Kova Yönetimi (Maksimum 100 Dilim)
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={handleAutoExpand}
              className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/70 hover:bg-amber-100 text-amber-900 dark:text-amber-200 text-xs font-bold border border-amber-300 dark:border-amber-700 flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>100 Kova Otomatik Genişlet ({customBuckets.length}/100)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowResetModal(true)}
              className="px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-stone-700 dark:text-stone-300 text-xs font-bold border border-stone-200 dark:border-stone-700 flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5 text-stone-500" />
              <span>Sıfırla</span>
            </button>
          </div>
        </div>

        {/* Bucket Spektrum Dağılım Çubuğu */}
        <BucketDistributionPreview
          buckets={customBuckets}
          proposedMin={!isNaN(parsedNewMin) && parsedNewMin >= 0 ? parsedNewMin : undefined}
          proposedMax={!isNaN(parsedNewMax) && parsedNewMax > parsedNewMin ? parsedNewMax : undefined}
          proposedSmart={newIsSmart}
        />

        {/* Yeni Kova Ekleme Formu */}
        <form onSubmit={handleCreateBucket} className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 space-y-3">
          <span className="text-xs font-bold text-stone-800 dark:text-stone-200 block">
            + Yeni Özel Kova Ekle
          </span>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <div className="col-span-2 sm:col-span-2">
              <label className="text-[10px] text-stone-500 font-mono block mb-1">Kova Adı</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Örn: Balina Avcısı"
                className="w-full px-2.5 py-1.5 bg-white dark:bg-stone-700 border border-stone-200 dark:border-stone-600 rounded-lg text-stone-900 dark:text-stone-100 focus:border-rose-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-[10px] text-stone-500 font-mono block mb-1">Min USDT</label>
              <input
                type="number"
                value={newMin}
                onChange={(e) => setNewMin(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-stone-700 border border-stone-200 dark:border-stone-600 rounded-lg text-stone-900 dark:text-stone-100 font-mono tabular-nums focus:border-rose-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-[10px] text-stone-500 font-mono block mb-1">Maks USDT</label>
              <input
                type="number"
                value={newMax}
                onChange={(e) => setNewMax(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-stone-700 border border-stone-200 dark:border-stone-600 rounded-lg text-stone-900 dark:text-stone-100 font-mono tabular-nums focus:border-rose-500 focus:outline-hidden"
              />
            </div>

            <div className="flex items-end col-span-2 sm:col-span-1">
              <button
                type="submit"
                className="w-full py-1.5 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold flex items-center justify-center gap-1 shadow-xs transition-colors cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Ekle</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer text-stone-700 dark:text-stone-300">
              <input
                type="checkbox"
                checked={newIsSmart}
                onChange={(e) => setNewIsSmart(e.target.checked)}
                className="rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
              <span className="font-semibold">Bu Kova "Smart Money" Olarak Sayılsın</span>
            </label>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-stone-500 font-mono">İkon:</span>
              <input
                type="text"
                value={newIcon}
                maxLength={8}
                onChange={(e) => setNewIcon(e.target.value)}
                className="w-12 px-1.5 py-0.5 text-center bg-white dark:bg-stone-700 border border-stone-200 dark:border-stone-600 rounded focus:border-rose-500 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-stone-500 font-mono">Renk:</span>
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="w-7 h-7 p-0 rounded-md border border-stone-300 dark:border-stone-600 cursor-pointer"
              />
            </div>
          </div>

          {formError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 font-bold">{formError}</p>
          )}
        </form>

        {/* Mevcut Özel Kovalar Tablosu */}
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-stone-200 dark:border-stone-800 rounded-xl">
          <table className="w-full text-left text-xs font-mono min-w-[620px] border-collapse">
            <thead className="bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 sticky top-0 z-10">
              <tr>
                <th className="p-2.5">İkon & Ad</th>
                <th className="p-2.5">Min USDT</th>
                <th className="p-2.5">Max USDT</th>
                <th className="p-2.5">Renk</th>
                <th className="p-2.5">Tür</th>
                <th className="p-2.5">Durum</th>
                <th className="p-2.5 text-right">Sil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {customBuckets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-stone-400 font-sans text-xs">
                    Henüz özel kova tanımlanmadı. Yukarıdaki formdan ekleyebilir veya otomatik genişletebilirsiniz.
                  </td>
                </tr>
              ) : (
                customBuckets.map((b, idx) => {
                  // Çakışma kontrolü
                  const hasOverlap = customBuckets.some(
                    (other, oIdx) =>
                      oIdx !== idx &&
                      b.isActive &&
                      other.isActive &&
                      b.minValue < other.maxValue &&
                      b.maxValue > other.minValue
                  );

                  return (
                    <EditableBucketRow
                      key={b.id}
                      bucket={b}
                      isDeleting={deletingBucketId === b.id}
                      isOverlap={hasOverlap}
                      onStartDelete={() => setDeletingBucketId(b.id)}
                      onCancelDelete={() => setDeletingBucketId(null)}
                      onConfirmDelete={() => executeDeleteBucket(b.id)}
                      onToggleActive={() => {
                        bucketManager.toggleBucketActive(b.id);
                        onRefreshCustomBuckets();
                      }}
                      onToggleSmart={() => {
                        bucketManager.updateCustomBucket(b.id, { isSmartMoney: !b.isSmartMoney });
                        onRefreshCustomBuckets();
                      }}
                      onSaveUpdate={(updates) => {
                        const res = bucketManager.updateCustomBucket(b.id, updates);
                        onRefreshCustomBuckets();
                        if (res.success) {
                          showToast(`"${b.name}" güncellendi`);
                        } else {
                          showToast(res.message, 'error');
                        }
                      }}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. VERİ YEDEKLEME & JSON İÇE/DIŞA AKTAR */}
      <section className="bg-white/95 dark:bg-stone-900 p-4 sm:p-5 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-rose-500" />
          <h2 className="text-base font-black text-stone-900 dark:text-stone-100">
            Kova Yapılandırma Yedekleme (JSON)
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div className="space-y-2 p-3 bg-stone-50 dark:bg-stone-800/80 rounded-xl border border-stone-200 dark:border-stone-700">
            <span className="text-xs font-bold text-stone-800 dark:text-stone-200 block">Dışa Aktar</span>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              Mevcut {customBuckets.length} özel kovanızı JSON olarak panoya kopyalayın
            </p>
            <button
              type="button"
              onClick={handleExportJson}
              className="w-full py-2 px-3 rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-90 active:scale-95 transition-all shadow-xs"
            >
              {copySuccess ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copySuccess ? 'Kopyalandı!' : 'JSON Formatında Kopyala'}</span>
            </button>
          </div>

          <div className="space-y-2 p-3 bg-stone-50 dark:bg-stone-800/80 rounded-xl border border-stone-200 dark:border-stone-700">
            <span className="text-xs font-bold text-stone-800 dark:text-stone-200 block">İçe Aktar</span>
            <textarea
              rows={2}
              placeholder="Yapıştırılacak JSON verisi..."
              value={jsonImportText}
              onChange={(e) => setJsonImportText(e.target.value)}
              className="w-full p-2 text-xs font-mono bg-white dark:bg-stone-700 border border-stone-200 dark:border-stone-600 rounded-lg text-stone-900 dark:text-stone-100 focus:border-rose-500 focus:outline-hidden"
            />
            <button
              type="button"
              onClick={handleImportJson}
              className="w-full py-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-all"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>İçe Aktar ve Uygula</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
