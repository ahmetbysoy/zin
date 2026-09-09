import React, { useState } from 'react';
import { 
  Check, 
  Copy, 
  Cpu, 
  Download, 
  Eye, 
  EyeOff, 
  Moon, 
  Plus, 
  RefreshCw, 
  RotateCcw, 
  Sliders, 
  Sun, 
  Trash2, 
  Upload, 
  Volume2, 
  VolumeX, 
  Wrench, 
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

  // İçe/Dışa Aktar state
  const [jsonImportText, setJsonImportText] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // Kova Ekleme İşleyicisi
  const handleCreateBucket = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const minVal = parseFloat(newMin);
    const maxVal = parseFloat(newMax);

    if (!newName.trim()) {
      setFormError('Kova adı boş bırakılamaz.');
      return;
    }
    if (isNaN(minVal) || isNaN(maxVal) || minVal < 0 || maxVal <= minVal) {
      setFormError('Geçerli bir tutar aralığı girin (Min < Max).');
      return;
    }

    const success = bucketManager.createManualBucket({
      name: newName.trim(),
      minValue: minVal,
      maxValue: maxVal,
      icon: newIcon.trim() || '💎',
      color: newColor,
      isActive: true,
      isSmartMoney: newIsSmart,
    });

    if (success) {
      setNewName('');
      setNewMin((maxVal).toString());
      setNewMax((maxVal * 2).toString());
      onRefreshCustomBuckets();
      soundEngine.playSignalChime('alert');
    } else {
      setFormError(`Maksimum ${bucketManager.maxCustomBuckets} kova sınırına ulaşıldı.`);
    }
  };

  // Otomatik 100 Kovaya Genişletme
  const handleAutoExpand = () => {
    const success = bucketManager.addCustomBucket();
    if (success) {
      onRefreshCustomBuckets();
      soundEngine.playSignalChime('bull');
    }
  };

  // Sıfırlama
  const handleResetBuckets = () => {
    if (window.confirm('Tüm özel kovalar varsayılan logaritmik yapıya sıfırlansın mı?')) {
      bucketManager.resetCustomBuckets();
      onRefreshCustomBuckets();
    }
  };

  // JSON Dışa Aktarma
  const handleExportJson = () => {
    const data = bucketManager.exportCustomBuckets();
    navigator.clipboard.writeText(data).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  // JSON İçe Aktarma
  const handleImportJson = () => {
    if (!jsonImportText.trim()) return;
    const ok = bucketManager.importCustomBuckets(jsonImportText);
    if (ok) {
      alert('Kovalar başarıyla içe aktarıldı!');
      setJsonImportText('');
      onRefreshCustomBuckets();
    } else {
      alert('Geçersiz JSON formatı.');
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. SİSTEM & ARAYÜZ YAPILANDIRMASI */}
      <section className="bg-white/95 dark:bg-stone-900 p-4 sm:p-5 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-rose-500" />
          <h2 className="text-base font-black text-stone-900 dark:text-stone-100">
            Sistem & Performans Yapılandırması
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          {/* Ring Buffer Derinliği */}
          <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-800 dark:text-stone-200">
                Ring Buffer Boyutu (İşlem Belleği)
              </span>
              <span className="text-xs font-mono font-black text-rose-600 dark:text-rose-400">
                {appSettings.bufferSize}
              </span>
            </div>
            <div className="flex gap-2">
              {[500, 1000, 2000].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => {
                    bucketManager.ringBuffer.resize(size);
                    onUpdateSettings({ bufferSize: size });
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                    appSettings.bufferSize === size
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'bg-white dark:bg-stone-700 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-600 hover:bg-rose-50'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-stone-500 dark:text-stone-400">
              Yüksek hızda GC takılmasını önleyen Float64Array kaydırmalı tamponu
            </p>
          </div>

          {/* Tema ve Ses Ayarları */}
          <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 space-y-2.5">
            <span className="text-xs font-bold text-stone-800 dark:text-stone-200 block">
              Görsel & Ses Tercihleri
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const newTheme = appSettings.theme === 'dark' ? 'light' : 'dark';
                  onUpdateSettings({ theme: newTheme });
                }}
                className="flex-1 py-2 px-3 rounded-lg text-xs font-bold border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-200 flex items-center justify-center gap-1.5 transition-colors hover:bg-rose-50 dark:hover:bg-stone-600"
              >
                {appSettings.theme === 'dark' ? <Moon className="w-3.5 h-3.5 text-indigo-400" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
                <span>{appSettings.theme === 'dark' ? 'Karanlık Tema' : 'Aydınlık Tema'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const newSound = !appSettings.soundEnabled;
                  soundEngine.setMuted(!newSound);
                  onUpdateSettings({ soundEnabled: newSound });
                  if (newSound) soundEngine.playSignalChime('bull');
                }}
                className="flex-1 py-2 px-3 rounded-lg text-xs font-bold border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-200 flex items-center justify-center gap-1.5 transition-colors hover:bg-rose-50 dark:hover:bg-stone-600"
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
      <section className="bg-white/95 dark:bg-stone-900 p-4 sm:p-5 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-rose-500" />
            <h2 className="text-base font-black text-stone-900 dark:text-stone-100">
              Özel Kova Yönetimi (Maksimum 100 Dilim)
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAutoExpand}
              className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/70 hover:bg-amber-100 text-amber-900 dark:text-amber-200 text-xs font-bold border border-amber-300 dark:border-amber-700 flex items-center gap-1.5 transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>100 Kova Otomatik Genişlet ({customBuckets.length}/100)</span>
            </button>

            <button
              type="button"
              onClick={handleResetBuckets}
              className="px-3 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-stone-700 dark:text-stone-300 text-xs font-bold border border-stone-200 dark:border-stone-700 flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-stone-500" />
              <span>Sıfırla</span>
            </button>
          </div>
        </div>

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
                className="w-full px-2.5 py-1.5 bg-white dark:bg-stone-700 border border-stone-200 dark:border-stone-600 rounded-lg text-stone-900 dark:text-stone-100"
              />
            </div>

            <div>
              <label className="text-[10px] text-stone-500 font-mono block mb-1">Min USDT</label>
              <input
                type="number"
                value={newMin}
                onChange={(e) => setNewMin(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-stone-700 border border-stone-200 dark:border-stone-600 rounded-lg text-stone-900 dark:text-stone-100 font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] text-stone-500 font-mono block mb-1">Maks USDT</label>
              <input
                type="number"
                value={newMax}
                onChange={(e) => setNewMax(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-stone-700 border border-stone-200 dark:border-stone-600 rounded-lg text-stone-900 dark:text-stone-100 font-mono"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full py-1.5 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold flex items-center justify-center gap-1 shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Ekle</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer text-stone-700 dark:text-stone-300">
              <input
                type="checkbox"
                checked={newIsSmart}
                onChange={(e) => setNewIsSmart(e.target.checked)}
                className="rounded text-rose-600 focus:ring-rose-500"
              />
              <span className="font-semibold">Bu Kova "Smart Money" Olarak Sayılsın</span>
            </label>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-stone-500 font-mono">İkon:</span>
              <input
                type="text"
                value={newIcon}
                maxLength={2}
                onChange={(e) => setNewIcon(e.target.value)}
                className="w-10 px-1.5 py-0.5 text-center bg-white dark:bg-stone-700 border border-stone-200 dark:border-stone-600 rounded"
              />
            </div>
          </div>

          {formError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 font-bold">{formError}</p>
          )}
        </form>

        {/* Mevcut Özel Kovalar Tablosu */}
        <div className="overflow-x-auto max-h-[360px] overflow-y-auto border border-stone-200 dark:border-stone-800 rounded-xl">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 sticky top-0">
              <tr>
                <th className="p-2.5">Kova Adı</th>
                <th className="p-2.5">Min USDT</th>
                <th className="p-2.5">Max USDT</th>
                <th className="p-2.5">Tür</th>
                <th className="p-2.5">Durum</th>
                <th className="p-2.5 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {customBuckets.map((b) => (
                <tr key={b.id} className="hover:bg-rose-50/40 dark:hover:bg-stone-800/40">
                  <td className="p-2.5 flex items-center gap-1.5 text-stone-900 dark:text-stone-100 font-bold">
                    <span>{b.icon}</span>
                    <input
                      type="text"
                      value={b.name}
                      onChange={(e) => {
                        bucketManager.updateCustomBucket(b.id, { name: e.target.value });
                        onRefreshCustomBuckets();
                      }}
                      className="bg-transparent border-b border-dashed border-stone-300 dark:border-stone-700 px-1 py-0.5 text-xs font-bold"
                    />
                  </td>
                  <td className="p-2.5 text-stone-600 dark:text-stone-400">
                    ${b.minValue.toLocaleString()}
                  </td>
                  <td className="p-2.5 text-stone-600 dark:text-stone-400">
                    ${b.maxValue.toLocaleString()}
                  </td>
                  <td className="p-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        bucketManager.updateCustomBucket(b.id, { isSmartMoney: !b.isSmartMoney });
                        onRefreshCustomBuckets();
                      }}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors ${
                        b.isSmartMoney
                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-500 border-stone-200 dark:border-stone-700'
                      }`}
                    >
                      {b.isSmartMoney ? 'Smart Money' : 'Retail'}
                    </button>
                  </td>
                  <td className="p-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        bucketManager.toggleBucketActive(b.id);
                        onRefreshCustomBuckets();
                      }}
                      className="flex items-center gap-1 text-xs text-stone-600 dark:text-stone-400 hover:text-stone-900"
                    >
                      {b.isActive ? (
                        <Eye className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-stone-400" />
                      )}
                      <span>{b.isActive ? 'Aktif' : 'Gizli'}</span>
                    </button>
                  </td>
                  <td className="p-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        bucketManager.removeCustomBucket(b.id);
                        onRefreshCustomBuckets();
                      }}
                      className="p-1 text-stone-400 hover:text-rose-600 transition-colors"
                      title="Kovayı Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. VERİ YEDEKLEME & JSON İÇE/DIŞA AKTAR */}
      <section className="bg-white/95 dark:bg-stone-900 p-4 sm:p-5 rounded-2xl border border-pink-200/80 dark:border-stone-800 shadow-xs space-y-3">
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
              className="w-full py-2 px-3 rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-bold text-xs flex items-center justify-center gap-1.5"
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
              className="w-full p-2 text-xs font-mono bg-white dark:bg-stone-700 border border-stone-200 dark:border-stone-600 rounded-lg"
            />
            <button
              type="button"
              onClick={handleImportJson}
              className="w-full py-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5"
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
