import { useState, useRef, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import { encodeAudioToMp3 } from './utils/audioEncoder';

export default function App() {
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [duration, setDuration] = useState<number>(0);
  
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);
  
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0); // system time when play started
  const startOffsetRef = useRef<number>(0); // audio time when play started
  const animationRef = useRef<number>(0);

  // Initialize AudioContext
  useEffect(() => {
    audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return () => {
      audioCtxRef.current?.close();
    };
  }, []);

  // Update current time during playback
  const updateTime = () => {
    if (!isPlaying || !audioCtxRef.current) return;
    const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
    let newTime = startOffsetRef.current + elapsed;
    
    if (newTime >= endTime) {
      newTime = endTime;
      stopAudio();
    }
    
    setCurrentTime(newTime);
    animationRef.current = requestAnimationFrame(updateTime);
  };

  useEffect(() => {
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(updateTime);
    } else {
      cancelAnimationFrame(animationRef.current);
    }
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, endTime]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    stopAudio();
    
    const arrayBuffer = await file.arrayBuffer();
    if (!audioCtxRef.current) return;
    
    try {
      const decodedData = await audioCtxRef.current.decodeAudioData(arrayBuffer);
      setAudioBuffer(decodedData);
      setDuration(decodedData.duration);
      setStartTime(0);
      setEndTime(decodedData.duration);
      setCurrentTime(0);
    } catch (err) {
      alert('音声ファイルの読み込みに失敗しました');
    }
  };

  const playAudio = () => {
    if (!audioCtxRef.current || !audioBuffer) return;
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    
    // Stop current source if any
    sourceNodeRef.current?.stop();
    sourceNodeRef.current?.disconnect();

    let playStart = currentTime;
    if (playStart >= endTime || playStart < startTime) {
      playStart = startTime;
    }

    const source = audioCtxRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtxRef.current.destination);
    
    source.start(0, playStart, endTime - playStart);
    source.onended = () => {
      // Handled by updateTime mostly, but as a fallback
    };
    
    sourceNodeRef.current = source;
    startTimeRef.current = audioCtxRef.current.currentTime;
    startOffsetRef.current = playStart;
    
    setIsPlaying(true);
  };

  const stopAudio = () => {
    sourceNodeRef.current?.stop();
    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;
    setIsPlaying(false);
  };

  const handleSeek = (e: ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (isPlaying) {
      stopAudio();
      // Wait for React to batch state, then we could auto-play, but simple is better
    }
  };

  const handleExport = async () => {
    if (!audioBuffer) return;
    setIsExporting(true);
    try {
      const mp3Blob = await encodeAudioToMp3(audioBuffer, startTime, endTime);
      const url = URL.createObjectURL(mp3Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edited_${fileName.replace(/\.[^/.]+$/, "")}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`書き出しに失敗しました: ${err?.message || err}`);
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  return (
    <div className="card">
      <h1>MusicCut Web</h1>
      
      {!audioBuffer ? (
        <div className="file-input-wrapper">
          <label className="file-input-btn">
            🎵 音声ファイルを選択
            <input type="file" accept="audio/*" onChange={handleFileChange} />
          </label>
        </div>
      ) : (
        <>
          <div className="file-input-wrapper" style={{marginBottom: '1rem'}}>
            <label className="file-input-btn" style={{padding: '0.5rem', fontSize: '0.9rem', borderColor: 'rgba(255,255,255,0.1)'}}>
              🔄 別のファイルを開く
              <input type="file" accept="audio/*" onChange={handleFileChange} />
            </label>
            <div className="info-text" style={{marginTop: '0.5rem'}}>{fileName}</div>
          </div>

          <div className="timer-display">
            {formatTime(currentTime)}
          </div>

          <div className="slider-group">
            <div className="slider-header">
              <span>再生位置</span>
            </div>
            <input 
              type="range" 
              min={startTime} 
              max={endTime} 
              step="0.1" 
              value={currentTime} 
              onChange={handleSeek}
            />
          </div>

          <div className="slider-group" style={{marginTop: '1rem'}}>
            <div className="slider-header">
              <span>切り出し開始: {formatTime(startTime)}</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max={duration} 
              step="0.1" 
              value={startTime} 
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setStartTime(val);
                if (val >= endTime) setEndTime(val + 0.1);
                if (currentTime < val) setCurrentTime(val);
              }}
            />
          </div>

          <div className="slider-group">
            <div className="slider-header">
              <span>切り出し終了: {formatTime(endTime)}</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max={duration} 
              step="0.1" 
              value={endTime} 
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setEndTime(val);
                if (val <= startTime) setStartTime(Math.max(0, val - 0.1));
                if (currentTime > val) setCurrentTime(val);
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '1.5rem' }}>
            <button onClick={isPlaying ? stopAudio : playAudio}>
              {isPlaying ? '⏸ 一時停止' : '▶ 再生'}
            </button>
          </div>

          <button 
            className="success" 
            style={{ marginTop: '0.5rem' }} 
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? '⏳ 保存中...' : '💾 mp3で保存'}
          </button>
        </>
      )}
    </div>
  );
}
