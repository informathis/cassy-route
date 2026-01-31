
import React, { useState, useCallback, useMemo } from 'react';
import { 
  Truck, 
  Upload, 
  Play, 
  Download, 
  Settings as SettingsIcon, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  Table as TableIcon,
  Trash2,
  FileText,
  ShieldAlert,
  Search,
  MapPin
} from 'lucide-react';
import { 
  HGVParams, 
  CalculationResult, 
  CalculationStatus 
} from './types';
import { 
  DEFAULT_HGV_PARAMS, 
  ORIGIN, 
  MAX_DESTINATIONS,
  COLUMN_MAPPINGS,
  CONCURRENCY_LIMIT
} from './constants';
import { processBatch } from './services/batchProcessor';

const StatusBadge = ({ status, message }: { status: CalculationStatus, message?: string }) => {
  switch (status) {
    case 'success': 
      return <span className="px-2 py-1 text-[10px] font-black uppercase rounded bg-green-100 text-green-700 flex items-center gap-1"><CheckCircle2 size={10}/> Succès</span>;
    case 'invalid_location': 
      return <span className="px-2 py-1 text-[10px] font-black uppercase rounded bg-orange-100 text-orange-700 flex items-center gap-1" title={message}><AlertCircle size={10}/> {message || "Invalide"}</span>;
    case 'error': 
      return <span className="px-2 py-1 text-[10px] font-black uppercase rounded bg-red-100 text-red-700 flex items-center gap-1" title={message}><AlertCircle size={10}/> Erreur</span>;
    case 'geocoding':
      return <span className="px-2 py-1 text-[10px] font-black uppercase rounded bg-blue-100 text-blue-700 flex items-center gap-1 animate-pulse"><Loader2 size={10} className="animate-spin"/> Géo...</span>;
    case 'routing':
      return <span className="px-2 py-1 text-[10px] font-black uppercase rounded bg-indigo-100 text-indigo-700 flex items-center gap-1 animate-pulse"><Loader2 size={10} className="animate-spin"/> Route...</span>;
    default: 
      return <span className="px-2 py-1 text-[10px] font-black uppercase rounded bg-slate-100 text-slate-400">Attente</span>;
  }
};

export default function App() {
  const [params, setParams] = useState<HGVParams>(DEFAULT_HGV_PARAMS);
  const [data, setData] = useState<CalculationResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');

  const hasApiKey = useMemo(() => {
    try {
      // @ts-ignore
      return typeof process !== 'undefined' && !!process.env.API_KEY;
    } catch {
      return false;
    }
  }, []);

  const parseCSV = useCallback((text: string) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return;

    // Détection auto du délimiteur
    const firstLine = lines[0];
    let delimiter = ',';
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(';')) delimiter = ';';

    const splitLine = (line: string) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === delimiter && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = splitLine(lines[0]).map(h => h.toLowerCase().trim());
    const rows = lines.slice(1).map((line, idx) => {
      const values = splitLine(line);
      const row: any = { id: `Ligne ${idx + 1}`, status: 'pending' };
      
      headers.forEach((header, i) => {
        const val = values[i];
        if (!val) return;

        // Matching plus souple des colonnes
        if (COLUMN_MAPPINGS.id.some(m => header.includes(m))) row.id = val;
        if (COLUMN_MAPPINGS.address.some(m => header.includes(m))) row.address = val;
        if (COLUMN_MAPPINGS.postcode.some(m => header.includes(m))) row.postcode = val;
        if (COLUMN_MAPPINGS.city.some(m => header.includes(m))) row.city = val;
        
        // Pour Lat/Lon on cherche une inclusion exacte ou très proche
        if (COLUMN_MAPPINGS.lat.some(m => header.includes(m))) {
          const num = parseFloat(val.replace(',', '.'));
          if (!isNaN(num)) row.lat = num;
        }
        if (COLUMN_MAPPINGS.lon.some(m => header.includes(m))) {
          const num = parseFloat(val.replace(',', '.'));
          if (!isNaN(num)) row.lon = num;
        }
      });
      return row as CalculationResult;
    });

    setData(rows.slice(0, MAX_DESTINATIONS));
    setProgress(0);
  }, []);

  // Fix: Added handleFileUpload to process selected CSV files
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        parseCSV(text);
      }
    };
    reader.readAsText(file);
  }, [parseCSV]);

  // Fix: Added handlePaste to process data pasted directly into the application
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    if (text) {
      parseCSV(text);
    }
  }, [parseCSV]);

  const startCalculation = async () => {
    if (data.length === 0 || isProcessing) return;
    setIsProcessing(true);
    setProgress(0);

    // On réinitialise les statuts si on relance
    setData(prev => prev.map(r => ({ ...r, status: r.status === 'success' ? 'success' : 'pending' })));

    await processBatch(data, params, (idx, updatedRow) => {
      setData(prev => {
        const next = [...prev];
        next[idx] = updatedRow;
        return next;
      });
      setProgress(idx + 1);
    });

    setIsProcessing(false);
  };

  const exportResults = () => {
    const header = "ID;Adresse;CP;Ville;Lat;Lon;Distance_km;Duree_min;Status;Message\n";
    const content = data.map(r => 
      `"${r.id}";"${r.address || ''}";"${r.postcode || ''}";"${r.city || ''}";${r.lat || ''};${r.lon || ''};${r.distance_km || ''};${r.duration_min || ''};${r.status};"${r.error_message || ''}"`
    ).join('\n');
    
    const blob = new Blob([header + content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `calcul_pl_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    const s = searchTerm.toLowerCase();
    return data.filter(r => 
      r.id?.toString().toLowerCase().includes(s) || 
      r.address?.toLowerCase().includes(s) || 
      r.city?.toLowerCase().includes(s) ||
      r.error_message?.toLowerCase().includes(s)
    );
  }, [data, searchTerm]);

  const stats = useMemo(() => ({
    total: data.length,
    success: data.filter(r => r.status === 'success').length,
    error: data.filter(r => ['error', 'invalid_location'].includes(r.status)).length,
    processing: data.filter(r => ['geocoding', 'routing'].includes(r.status)).length,
  }), [data]);

  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-50">
      {!hasApiKey && (
        <div className="bg-red-600 text-white px-4 py-2 text-center text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3">
          <ShieldAlert size={14} /> 
          Clé API OpenRouteService Manquante dans process.env.API_KEY
        </div>
      )}

      <header className="bg-slate-900 text-white p-4 shadow-xl sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 p-2.5 rounded-xl shadow-inner">
              <Truck size={24} className="text-slate-900" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter">CALCULATEUR PL FR</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Origine: <span className="text-amber-400">{ORIGIN.label}</span></p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => { if(confirm('Vider la liste ?')) setData([]); }}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
              title="Réinitialiser"
            >
              <Trash2 size={20} />
            </button>
            <button 
              disabled={isProcessing || data.length === 0 || !hasApiKey}
              onClick={startCalculation}
              className={`flex items-center gap-2 px-8 py-2.5 text-sm font-black rounded-lg transition-all shadow-lg uppercase tracking-wider ${
                isProcessing ? 'bg-slate-700 cursor-wait opacity-50' : 'bg-amber-500 hover:bg-amber-400 text-slate-900 active:scale-95'
              }`}
            >
              {isProcessing ? <Loader2 className="animate-spin" size={18}/> : <Play size={18}/>}
              Calculer
            </button>
            <button 
              disabled={data.length === 0}
              onClick={exportResults}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-white text-slate-900 hover:bg-slate-100 rounded-lg transition-all shadow border border-slate-200"
            >
              <Download size={18}/> Export
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1 space-y-6">
          <section className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
              <SettingsIcon size={14}/> Configuration Camion
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">PTRA (tonnes)</label>
                  <input type="number" step="0.5" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black focus:ring-2 focus:ring-amber-400 outline-none" 
                    value={params.weight} onChange={e => setParams({...params, weight: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Hauteur (m)</label>
                  <input type="number" step="0.1" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black focus:ring-2 focus:ring-amber-400 outline-none" 
                    value={params.height} onChange={e => setParams({...params, height: parseFloat(e.target.value) || 0})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Largeur (m)</label>
                  <input type="number" step="0.05" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black focus:ring-2 focus:ring-amber-400 outline-none" 
                    value={params.width} onChange={e => setParams({...params, width: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Longueur (m)</label>
                  <input type="number" step="0.1" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black focus:ring-2 focus:ring-amber-400 outline-none" 
                    value={params.length} onChange={e => setParams({...params, length: parseFloat(e.target.value) || 0})} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Charge Essieu (t)</label>
                <input type="number" step="0.5" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black focus:ring-2 focus:ring-amber-400 outline-none" 
                  value={params.axleLoad} onChange={e => setParams({...params, axleLoad: parseFloat(e.target.value) || 0})} />
              </div>
              <label className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100 cursor-pointer hover:bg-amber-100 transition-colors">
                <input type="checkbox" className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500" 
                  checked={params.hazmat} onChange={e => setParams({...params, hazmat: e.target.checked})} />
                <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider">Matières Dangereuses</span>
              </label>
            </div>
          </section>

          <section className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-5 flex items-center gap-2">
              <Upload size={14}/> Alimentation des données
            </h2>
            <div className="space-y-4">
              <div className="relative border-2 border-dashed border-slate-200 rounded-2xl p-6 hover:border-amber-400 transition-colors cursor-pointer text-center group bg-slate-50">
                <input type="file" accept=".csv" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                <Upload size={28} className="mx-auto mb-2 text-slate-300 group-hover:text-amber-500 transition-colors" />
                <p className="text-[11px] font-black text-slate-600 uppercase tracking-tight">Importer CSV</p>
                <p className="text-[9px] text-slate-400 mt-1 uppercase font-bold">Format : ID, Adresse, Ville...</p>
              </div>
              <div className="relative">
                <textarea 
                  onPaste={handlePaste}
                  placeholder="Coller un tableau Excel ici..."
                  className="w-full h-28 p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-400 outline-none resize-none font-medium leading-relaxed"
                />
                <FileText className="absolute bottom-3 right-3 text-slate-200 pointer-events-none" size={16} />
              </div>
            </div>
          </section>
        </aside>

        <section className="lg:col-span-3 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Destinations</p>
              <p className="text-2xl font-black text-slate-800 tracking-tighter">{stats.total}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <p className="text-[9px] font-black text-green-500 uppercase tracking-widest mb-1">Calculés</p>
              <p className="text-2xl font-black text-green-600 tracking-tighter">{stats.success}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1">Échecs</p>
              <p className="text-2xl font-black text-red-600 tracking-tighter">{stats.error}</p>
            </div>
             <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">En cours</p>
              <p className="text-2xl font-black text-slate-400 tracking-tighter">{stats.processing}</p>
            </div>
          </div>

          {isProcessing && (
            <div className="bg-white p-6 rounded-2xl shadow-lg border-l-8 border-amber-500 transition-all">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-100 p-2 rounded-lg">
                    <Loader2 className="animate-spin text-amber-600" size={20}/>
                  </div>
                  <span className="text-sm font-black text-slate-800 uppercase tracking-tighter">Traitement des lots : {progress} / {stats.total}</span>
                </div>
                <span className="text-lg font-black text-amber-500 tracking-tighter">{Math.round((progress / stats.total) * 100)}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden shadow-inner border border-slate-200">
                <div className="bg-amber-500 h-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(245,158,11,0.5)]" style={{ width: `${(progress / stats.total) * 100}%` }} />
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[600px]">
            <div className="p-4 bg-slate-50/80 border-b flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-2.5 ml-2">
                <TableIcon size={18} className="text-slate-400" />
                <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Registre des destinations</span>
              </div>
              <div className="relative w-full md:w-80">
                <input 
                  type="text" 
                  placeholder="Rechercher par adresse ou ID..." 
                  className="pl-10 pr-5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs w-full focus:ring-2 focus:ring-amber-400 outline-none shadow-sm transition-all"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              {data.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[500px] text-slate-300 p-12">
                  <div className="bg-slate-50 p-8 rounded-full mb-6">
                    <TableIcon size={64} className="opacity-10" />
                  </div>
                  <p className="text-sm font-black uppercase tracking-widest text-slate-400">Aucune donnée importée</p>
                  <p className="text-xs text-slate-400 mt-2 text-center max-w-xs leading-relaxed">
                    Utilisez le module d'importation à gauche pour charger vos destinations (CSV ou copier-coller).
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse table-fixed">
                  <thead className="sticky top-0 bg-white shadow-sm z-10">
                    <tr className="border-b bg-slate-50/50">
                      <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-24">Réf</th>
                      <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Lieu de destination</th>
                      <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-32">Distance</th>
                      <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-24">Temps</th>
                      <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-36 text-center">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((row, i) => (
                      <tr key={`${row.id}-${i}`} className="border-b hover:bg-slate-50/80 transition-all group">
                        <td className="px-5 py-4 text-[10px] font-bold text-slate-400 truncate">{row.id}</td>
                        <td className="px-5 py-4">
                          <p className="text-xs font-black text-slate-800 truncate mb-0.5">
                            {row.address || row.city || "Destination sans nom"}
                          </p>
                          <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-bold uppercase truncate">
                            <MapPin size={8} />
                            {row.geocoded_address ? row.geocoded_address : `${row.postcode || ''} ${row.city || ''}`.trim() || 'Coordonnées directes'}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm font-black text-slate-900 tabular-nums">
                          {row.distance_km !== undefined ? (
                            <span className="flex items-baseline gap-0.5">
                              {row.distance_km.toLocaleString('fr-FR')} <span className="text-[10px] text-slate-400">km</span>
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-4 text-[11px] font-bold text-slate-600 tabular-nums">
                          {row.duration_min !== undefined ? `${row.duration_min} min` : '—'}
                        </td>
                        <td className="px-5 py-4 flex justify-center">
                          <StatusBadge status={row.status} message={row.error_message} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            <div className="p-4 bg-slate-50 border-t flex justify-between items-center text-[9px] font-black text-slate-400 uppercase tracking-widest">
               <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                 Validation France Active
               </div>
               <div className="flex gap-6">
                 <span>Taux Concurrence: {CONCURRENCY_LIMIT} RPS</span>
                 <span>Cache Géo local: Actif</span>
               </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-slate-100 p-8 border-t border-slate-200">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
          <div className="flex items-center gap-4">
            <Truck size={16} />
            <p>© 2024 HGV Route Calculator FR - Logistique & Transport</p>
          </div>
          <div className="flex gap-8">
            <a href="https://openrouteservice.org/dev/#/api-docs" target="_blank" className="hover:text-amber-600 transition-colors">Documentation ORS</a>
            <span className="hover:text-amber-600 cursor-help transition-colors">Aide Support</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
