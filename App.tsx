
import React, { useState, useRef, useMemo } from 'react';
import { 
  Download, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Activity,
  Layers,
  Combine,
  FileStack,
  LayoutGrid,
  Monitor,
  Check,
  Zap,
  Cpu,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Instagram
} from 'lucide-react';
import { DownloadStatus, PlaylistInfo, ProgressState, ExportFormat, Variant } from './types';
import { parseM3U8, downloadSegment, fetchMediaPlaylist } from './services/m3u8Service';
import muxjs from 'mux.js';

const App: React.FC = () => {
  const [rawUrls, setRawUrls] = useState('');
  const [baseName, setBaseName] = useState('video');
  const [shouldMerge, setShouldMerge] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('ts');
  const [showSegmentGrid, setShowSegmentGrid] = useState(false);
  
  const [status, setStatus] = useState<DownloadStatus>(DownloadStatus.IDLE);
  const [playlists, setPlaylists] = useState<PlaylistInfo[]>([]);
  const [progress, setProgress] = useState<ProgressState>({ 
    total: 0, 
    downloaded: 0, 
    percentage: 0, 
    errors: 0,
    failedIndices: [],
    currentJobIndex: 0,
    totalJobs: 0
  });
  const [errorMessage, setErrorMessage] = useState('');

  const chunksRef = useRef<Map<string, (ArrayBuffer | undefined)[]>>(new Map());
  const isPausedRef = useRef<boolean>(false);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    const urls = rawUrls.split('\n').map(u => u.trim()).filter(u => u.length > 0);
    if (urls.length === 0) return;

    setStatus(DownloadStatus.ANALYZING);
    setErrorMessage('');
    setPlaylists([]);
    chunksRef.current.clear();
    isPausedRef.current = false;

    try {
      const results: PlaylistInfo[] = [];
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        try {
          const info = await parseM3U8(url);
          const id = `job-${i}-${Date.now()}`;
          const playlistEntry = { 
            ...info, 
            id,
            selectedVariantUrl: info.type === 'master' ? info.variants?.[0]?.url : undefined
          };
          results.push(playlistEntry as PlaylistInfo);
        } catch (err: any) {
          throw new Error(`Failed to parse link #${i + 1}: ${err.message}`);
        }
      }
      setPlaylists(results);
      setStatus(DownloadStatus.READY);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to analyze URLs.');
      setStatus(DownloadStatus.ERROR);
    }
  };

  const updateSelectedVariant = (id: string, url: string) => {
    setPlaylists(prev => prev.map(p => p.id === id ? { ...p, selectedVariantUrl: url } : p));
  };

  const transmuxToMp4 = async (chunks: (ArrayBuffer | undefined)[]): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      try {
        const transmuxer = new (muxjs as any).mp4.Transmuxer();
        const remuxedChunks: Uint8Array[] = [];

        transmuxer.on('data', (event: any) => {
          if (event.type === 'video') {
            remuxedChunks.push(new Uint8Array(event.data));
          }
        });

        transmuxer.on('done', () => {
          const blob = new Blob(remuxedChunks, { type: 'video/mp4' });
          resolve(blob);
        });

        for (const chunk of chunks) {
          if (chunk) {
            transmuxer.push(new Uint8Array(chunk));
          }
        }
        transmuxer.flush();
      } catch (err) {
        reject(err);
      }
    });
  };

  const triggerDownload = async (chunks: (ArrayBuffer | undefined)[], filename: string) => {
    let finalBlob: Blob;
    let finalExtension = exportFormat;

    const validChunks = chunks.filter((c): c is ArrayBuffer => !!c);

    if (exportFormat === 'mp4') {
      try {
        finalBlob = await transmuxToMp4(validChunks);
      } catch (e) {
        console.error("Transmux failed, falling back to .ts", e);
        finalBlob = new Blob(validChunks, { type: 'video/mp2t' });
        finalExtension = 'ts';
      }
    } else {
      finalBlob = new Blob(validChunks, { type: 'video/mp2t' });
    }

    const downloadUrl = URL.createObjectURL(finalBlob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${filename}.${finalExtension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  };

  const runDownloadJob = async (playlist: PlaylistInfo) => {
    const jobChunks = chunksRef.current.get(playlist.id)!;
    const concurrency = 8;
    let activeWorkers = 0;
    
    const segmentsToDownload = (playlist.segments || []).map((s, i) => ({ s, i })).filter(({ i }) => !jobChunks[i]);

    if (segmentsToDownload.length === 0) return;

    return new Promise<void>((resolve) => {
      let segmentIdx = 0;
      const spawnWorker = async () => {
        while (segmentIdx < segmentsToDownload.length && !isPausedRef.current) {
          const { s: segment, i: realIdx } = segmentsToDownload[segmentIdx++];

          try {
            jobChunks[realIdx] = await downloadSegment(segment.url);
          } catch (err) {
            // Error logged but process continues
          } finally {
            setProgress(prev => {
              let totalD = 0;
              const failedIds: number[] = [];
              chunksRef.current.forEach((val) => {
                val.forEach((chunk, i) => {
                  if (chunk) totalD++;
                  else failedIds.push(i);
                });
              });

              return {
                ...prev,
                downloaded: totalD,
                errors: failedIds.length,
                failedIndices: failedIds,
                percentage: Math.round((totalD / (prev.total || 1)) * 100)
              };
            });
          }
        }
        activeWorkers--;
        if (activeWorkers === 0) resolve();
      };

      const workerCount = Math.min(concurrency, segmentsToDownload.length);
      for (let i = 0; i < workerCount; i++) {
        activeWorkers++;
        spawnWorker();
      }
    });
  };

  const startBatchDownload = async (resume = false) => {
    if (playlists.length === 0) return;

    setStatus(DownloadStatus.DOWNLOADING);
    setErrorMessage('');
    isPausedRef.current = false;

    try {
      const finalizedPlaylists = [...playlists];
      
      // Initialize segments if needed
      for (let i = 0; i < finalizedPlaylists.length; i++) {
        const p = finalizedPlaylists[i];
        if (p.type === 'master' && p.selectedVariantUrl && !p.segments) {
          const media = await fetchMediaPlaylist(p.selectedVariantUrl);
          finalizedPlaylists[i] = { ...p, ...media };
          chunksRef.current.set(p.id, new Array(media.segments.length).fill(undefined));
        } else if (p.type === 'media' && !chunksRef.current.has(p.id)) {
           chunksRef.current.set(p.id, new Array(p.segments?.length || 0).fill(undefined));
        }
      }
      setPlaylists(finalizedPlaylists);

      const allSegmentsCount = finalizedPlaylists.reduce((acc, p) => acc + (p.segments?.length || 0), 0);
      
      if (!resume) {
        setProgress(prev => ({ 
          ...prev,
          total: allSegmentsCount, 
          downloaded: 0, 
          percentage: 0, 
          errors: 0,
          failedIndices: [],
          totalJobs: finalizedPlaylists.length,
          currentJobIndex: 0
        }));
      }

      // Loop through remaining jobs
      for (let i = progress.currentJobIndex; i < finalizedPlaylists.length; i++) {
        if (isPausedRef.current) break;

        const playlist = finalizedPlaylists[i];
        setProgress(prev => ({ ...prev, currentJobIndex: i }));
        await runDownloadJob(playlist);

        if (isPausedRef.current) break;

        if (!shouldMerge) {
          const chunks = chunksRef.current.get(playlist.id)!;
          if (chunks.every(Boolean)) {
             await triggerDownload(chunks, `${baseName}_${i + 1}`);
          }
        }
      }

      if (isPausedRef.current) {
        setStatus(DownloadStatus.PAUSED);
        return;
      }

      const allDownloaded = Array.from(chunksRef.current.values()).flat().every(Boolean);
      
      if (allDownloaded) {
        if (shouldMerge) {
          const allChunks = Array.from(chunksRef.current.values()).flat() as (ArrayBuffer | undefined)[];
          await triggerDownload(allChunks, `${baseName}_merged`);
        }
        setStatus(DownloadStatus.COMPLETED);
      } else {
        setStatus(DownloadStatus.IDLE);
        if (progress.errors > 0) {
          setErrorMessage(`${progress.errors} segments failed. Try resuming or check your connection.`);
        }
      }

    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during download.');
      setStatus(DownloadStatus.ERROR);
    }
  };

  const togglePause = () => {
    if (status === DownloadStatus.DOWNLOADING) {
      isPausedRef.current = true;
      setStatus(DownloadStatus.PAUSED);
    } else if (status === DownloadStatus.PAUSED) {
      isPausedRef.current = false;
      startBatchDownload(true);
    }
  };

  const reset = () => {
    setRawUrls('');
    setPlaylists([]);
    setStatus(DownloadStatus.IDLE);
    setErrorMessage('');
    chunksRef.current.clear();
    isPausedRef.current = false;
    setProgress({
      total: 0,
      downloaded: 0,
      percentage: 0,
      errors: 0,
      failedIndices: [],
      currentJobIndex: 0,
      totalJobs: 0
    });
  };

  const getQualityTier = (variant: Variant) => {
    if (!variant.resolution) return null;
    const height = parseInt(variant.resolution.split('x')[1]);
    if (height >= 2160) return { label: '4K', color: 'bg-red-500/20 text-red-400 border-red-500/30' };
    if (height >= 1080) return { label: '1080p', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' };
    if (height >= 720) return { label: '720p', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
    return { label: 'SD', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' };
  };

  const segmentGridData = useMemo(() => {
    return Array.from(chunksRef.current.values()).flat() as (ArrayBuffer | undefined)[];
  }, [progress.downloaded, progress.errors, playlists, status]);

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 flex flex-col items-center p-4 md:p-8">
      <header className="w-full max-w-4xl flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            StreamFetch Pro
          </h1>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-400 font-medium">
          <div className="hidden sm:flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700/50">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span>Stateful Engine v3.3</span>
          </div>
        </div>
      </header>

      <main className="w-full max-w-3xl space-y-6">
        <div className="bg-slate-800/40 backdrop-blur-md border border-slate-700/50 p-6 rounded-3xl shadow-2xl relative overflow-hidden">
          <form onSubmit={handleAnalyze} className="space-y-6 relative z-10">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-400 mb-2">
                <Search className="w-4 h-4" /> Enter Playlist URLs
              </label>
              <textarea 
                placeholder="Paste .m3u8 links here..."
                className="w-full bg-slate-900/80 border border-slate-700 rounded-2xl py-3 px-4 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm outline-none min-h-[120px] font-mono resize-none"
                value={rawUrls}
                onChange={(e) => setRawUrls(e.target.value)}
                disabled={status !== DownloadStatus.IDLE && status !== DownloadStatus.ERROR}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Base Filename</label>
                <input 
                  type="text"
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-xl py-2 px-4 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  value={baseName}
                  onChange={(e) => setBaseName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Format</label>
                <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-700 h-[38px]">
                  {(['ts', 'mp4'] as ExportFormat[]).map(f => (
                    <button 
                      key={f}
                      type="button"
                      onClick={() => setExportFormat(f)}
                      className={`flex-1 rounded-lg text-xs font-bold transition-all ${exportFormat === f ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500'}`}
                    >
                      .{f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-end">
                <button 
                  type="button"
                  onClick={() => setShouldMerge(!shouldMerge)}
                  className={`flex-grow flex items-center justify-center gap-2 h-[38px] rounded-xl border transition-all ${
                    shouldMerge ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-900/50 border-slate-700 text-slate-400'
                  }`}
                >
                  <Combine className="w-4 h-4" />
                  <span className="text-xs font-bold">{shouldMerge ? 'Merging All' : 'Individual'}</span>
                </button>
              </div>
            </div>

            <button 
              type="submit"
              disabled={!rawUrls || (status !== DownloadStatus.IDLE && status !== DownloadStatus.ERROR)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold py-3.5 px-6 rounded-2xl transition-all shadow-xl flex items-center justify-center gap-3"
            >
              {status === DownloadStatus.ANALYZING ? <Activity className="w-5 h-5 animate-spin" /> : <Layers className="w-5 h-5" />}
              {status === DownloadStatus.ANALYZING ? 'Parsing...' : 'Analyze Batch'}
            </button>
          </form>
        </div>

        {errorMessage && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            {progress.errors > 0 && (
              <button onClick={() => startBatchDownload(true)} className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shrink-0">Retry</button>
            )}
          </div>
        )}

        {playlists.length > 0 && status !== DownloadStatus.COMPLETED && (
          <div className="bg-slate-800/40 backdrop-blur-md border border-slate-700/50 p-6 rounded-3xl shadow-xl space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <FileStack className="w-5 h-5 text-indigo-400" /> Queue Manager
              </h3>
              <button onClick={() => setShowSegmentGrid(!showSegmentGrid)} className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                <LayoutGrid className="w-3.5 h-3.5" /> {showSegmentGrid ? 'Hide' : 'Show'} Map
              </button>
            </div>

            {status === DownloadStatus.READY && (
              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin">
                {playlists.map((p, i) => (
                  <div key={p.id} className="bg-slate-900/60 border border-slate-700/50 p-4 rounded-2xl">
                    <div className="flex items-center justify-between mb-3">
                       <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter ${p.type === 'master' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                         {p.type === 'master' ? 'Master' : 'Stream'}
                       </span>
                       <span className="text-[10px] font-bold text-indigo-400">Order: {i + 1}</span>
                    </div>

                    {p.type === 'master' && p.variants && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {p.variants.map((v, idx) => {
                          const tier = getQualityTier(v);
                          return (
                            <button 
                              key={idx}
                              onClick={() => updateSelectedVariant(p.id, v.url)}
                              className={`p-2.5 rounded-xl text-left transition-all border flex items-center justify-between ${
                                p.selectedVariantUrl === v.url 
                                  ? 'bg-indigo-600/10 border-indigo-500/50 ring-1 ring-indigo-500/50' 
                                  : 'bg-slate-900 border-slate-800 text-slate-400'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${p.selectedVariantUrl === v.url ? 'border-indigo-400 bg-indigo-500' : 'border-slate-700'}`}>
                                  {p.selectedVariantUrl === v.url && <Check className="w-2.5 h-2.5 text-white" />}
                                </div>
                                <div>
                                  <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
                                    {v.resolution || 'Auto'}
                                    {tier && <span className={`px-1 py-0.5 rounded text-[8px] font-black border ${tier.color}`}>{tier.label}</span>}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {showSegmentGrid && (
              <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-700/30">
                <div className="flex flex-wrap gap-1 justify-center max-h-[140px] overflow-y-auto scrollbar-none">
                  {segmentGridData.map((chunk, idx) => (
                    <div key={idx} className={`segment-dot ${chunk ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.3)]' : 'bg-slate-800'}`} />
                  ))}
                </div>
              </div>
            )}

            {(status === DownloadStatus.DOWNLOADING || status === DownloadStatus.PAUSED || status === DownloadStatus.MERGING) ? (
              <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-700/30 space-y-5">
                 <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
                        {status === DownloadStatus.MERGING ? 'Saving...' : `Stream ${progress.currentJobIndex + 1}/${progress.totalJobs}`}
                      </p>
                      <h4 className="text-xl font-bold text-white flex items-center gap-2">
                        {status === DownloadStatus.PAUSED && <Pause className="w-5 h-5 text-amber-400" />}
                        {status === DownloadStatus.PAUSED ? 'Download Paused' : `Processing: ${baseName}_${progress.currentJobIndex + 1}`}
                      </h4>
                    </div>
                    <div className="text-3xl font-black text-indigo-400">{progress.percentage}%</div>
                 </div>

                 <div className="w-full bg-slate-800 rounded-full h-4 border border-slate-700 overflow-hidden p-0.5">
                    <div 
                      className="bg-gradient-to-r from-indigo-600 via-indigo-400 to-emerald-400 h-full rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(79,70,229,0.5)]"
                      style={{ width: `${progress.percentage}%` }}
                    />
                 </div>

                 <div className="flex items-center justify-between">
                    <div className="flex gap-4 text-xs font-bold">
                      <span className="text-emerald-400">{progress.downloaded} OK</span>
                      <span className="text-slate-500">{progress.total} Total</span>
                    </div>
                    <div className="flex gap-2">
                       {status === DownloadStatus.MERGING ? (
                         <Activity className="animate-spin text-indigo-400" />
                       ) : (
                        <button 
                          onClick={togglePause}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${
                            status === DownloadStatus.PAUSED 
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                            : 'bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-600/50'
                          }`}
                        >
                          {status === DownloadStatus.PAUSED ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                          {status === DownloadStatus.PAUSED ? 'Resume' : 'Pause'}
                        </button>
                       )}
                    </div>
                 </div>
              </div>
            ) : (
              <button 
                onClick={() => startBatchDownload()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition-all shadow-xl flex items-center justify-center gap-3 group"
              >
                <Download className="w-6 h-6 group-hover:translate-y-0.5 transition-transform" /> 
                Start Sequence
              </button>
            )}
          </div>
        )}

        {status === DownloadStatus.COMPLETED && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 p-12 rounded-[40px] text-center space-y-6 animate-in zoom-in-95">
            <div className="mx-auto bg-emerald-500 w-20 h-20 rounded-full flex items-center justify-center shadow-2xl shadow-emerald-500/40 border-4 border-emerald-400/20">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-white">Batch Success!</h2>
              <p className="text-sm text-slate-400 max-w-xs mx-auto">Videos saved sequentially. Process preserved through pause/resume events.</p>
            </div>
            <button onClick={reset} className="px-10 py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl text-sm font-bold border border-slate-700 transition-all flex items-center gap-2 mx-auto">
              <RotateCcw className="w-4 h-4" /> Start New Batch
            </button>
          </div>
        )}
      </main>

      <footer className="mt-auto pt-10 pb-6 w-full max-w-3xl">
        <div className="flex flex-col gap-6 text-[10px] text-slate-600 font-bold uppercase tracking-[0.2em] text-center">
          <div className="flex justify-center flex-wrap gap-4 sm:gap-6">
            <span className="flex items-center gap-1.5"><Zap className="w-3 h-3 text-amber-500" /> Sequential</span>
            <span className="flex items-center gap-1.5"><Pause className="w-3 h-3 text-emerald-500" /> Pause/Resume</span>
            <span className="flex items-center gap-1.5"><ShieldAlert className="w-3 h-3" /> Client-Only</span>
          </div>
          
          <div className="space-y-3">
            <p>© 2024 StreamFetch Pro • Stateful M3U8 Toolset</p>
            <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-700/30 inline-block mx-auto transition-all hover:border-indigo-500/50">
              <p className="mb-2">Developed By</p>
              <a 
                href="https://www.instagram.com/myaseenmc" 
                target="_blank" 
                rel="noopener noreferrer"
                className="group flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <div className="bg-indigo-600/20 p-1.5 rounded-lg group-hover:bg-indigo-600/30 transition-all">
                  <Instagram className="w-4 h-4" />
                </div>
                <span className="text-sm tracking-widest">MYASEENMC</span>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
