import React, { useEffect, useRef } from 'react';
import { VisualizerMode, ThemeType } from '../types';
import { audioEngine } from '../utils/audioEngine';

interface VisualizerProps {
  mode: VisualizerMode;
  theme: ThemeType;
  isPlaying: boolean;
}

export const Visualizer: React.FC<VisualizerProps> = ({ mode, theme, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const peaksRef = useRef<number[]>([]);

  // Theme palettes for visualizer
  const themeColors = {
    obsidian: {
      primary: '#d4af37', // Gold
      secondary: '#fef08a', // Pale gold
      accent: 'rgba(212, 175, 55, 0.25)',
      glow: '#eab308',
      background: 'transparent'
    },
    cyber: {
      primary: '#00f0ff', // Cyber cyan
      secondary: '#b026ff', // Neon purple
      accent: 'rgba(0, 240, 255, 0.25)',
      glow: '#00f0ff',
      background: 'transparent'
    },
    emerald: {
      primary: '#10b981', // Emerald
      secondary: '#6ee7b7', // Mint
      accent: 'rgba(16, 185, 129, 0.25)',
      glow: '#059669',
      background: 'transparent'
    },
    velvet: {
      primary: '#f43f5e', // Rose
      secondary: '#fb923c', // Amber
      accent: 'rgba(244, 63, 94, 0.25)',
      glow: '#e11d48',
      background: 'transparent'
    },
    platinum: {
      primary: '#e2e8f0', // Crisp silver
      secondary: '#94a3b8', // Titanium
      accent: 'rgba(226, 232, 240, 0.25)',
      glow: '#cbd5e1',
      background: 'transparent'
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dataArray = new Uint8Array(128);
    const waveArray = new Uint8Array(128);
    let phase = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // Fetch real frequency / waveform data
      if (audioEngine.analyser && isPlaying) {
        audioEngine.getFrequencyData(dataArray);
        audioEngine.getTimeDomainData(waveArray);
      } else {
        // Fallback gentle idle wave if paused
        for (let i = 0; i < dataArray.length; i++) {
          const synthVal = isPlaying
            ? Math.sin(phase + i * 0.15) * 50 + 60
            : Math.sin(phase * 0.5 + i * 0.1) * 12 + 16;
          dataArray[i] = Math.max(0, Math.min(255, synthVal));
          waveArray[i] = 128 + Math.sin(phase + i * 0.2) * (isPlaying ? 28 : 6);
        }
      }

      phase += 0.04;
      const colors = themeColors[theme] || themeColors.obsidian;

      if (mode === 'radial') {
        // RADIAL AURA MODE
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(centerX, centerY) * 0.65;
        const barsCount = 64;

        ctx.save();
        ctx.translate(centerX, centerY);

        // Ambient inner glow ring
        const gradient = ctx.createRadialGradient(0, 0, radius * 0.6, 0, 0, radius * 1.3);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(0.7, colors.accent);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2);
        ctx.fill();

        for (let i = 0; i < barsCount; i++) {
          const angle = (i / barsCount) * Math.PI * 2;
          const val = dataArray[i % dataArray.length] || 0;
          const barHeight = (val / 255) * (radius * 0.65) + 4;

          const x1 = Math.cos(angle) * (radius * 0.95);
          const y1 = Math.sin(angle) * (radius * 0.95);
          const x2 = Math.cos(angle) * (radius * 0.95 + barHeight);
          const y2 = Math.sin(angle) * (radius * 0.95 + barHeight);

          ctx.strokeStyle = i % 2 === 0 ? colors.primary : colors.secondary;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.shadowBlur = 10;
          ctx.shadowColor = colors.glow;

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        ctx.restore();

      } else if (mode === 'bars') {
        // NEON SPECTRUM BARS MODE
        const barWidth = 6;
        const gap = 4;
        const totalBarSpace = barWidth + gap;
        const barsCount = Math.floor(width / totalBarSpace);
        const startX = (width - barsCount * totalBarSpace) / 2;

        if (peaksRef.current.length !== barsCount) {
          peaksRef.current = new Array(barsCount).fill(0);
        }

        for (let i = 0; i < barsCount; i++) {
          const dataIndex = Math.floor((i / barsCount) * (dataArray.length * 0.75));
          const val = dataArray[dataIndex] || 0;
          const barHeight = Math.max(4, (val / 255) * (height * 0.75));

          const x = startX + i * totalBarSpace;
          const y = height * 0.85 - barHeight;

          // Peak cap tracking
          if (barHeight > peaksRef.current[i]) {
            peaksRef.current[i] = barHeight;
          } else {
            peaksRef.current[i] = Math.max(0, peaksRef.current[i] - 1.2);
          }

          // Main vertical bar gradient
          const barGrad = ctx.createLinearGradient(0, y, 0, height * 0.85);
          barGrad.addColorStop(0, colors.secondary);
          barGrad.addColorStop(0.6, colors.primary);
          barGrad.addColorStop(1, colors.accent);

          ctx.fillStyle = barGrad;
          ctx.shadowBlur = isPlaying ? 8 : 2;
          ctx.shadowColor = colors.glow;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
          ctx.fill();

          // Peak dot
          const peakY = height * 0.85 - peaksRef.current[i] - 4;
          ctx.fillStyle = '#ffffff';
          ctx.shadowBlur = 6;
          ctx.shadowColor = colors.glow;
          ctx.fillRect(x, Math.max(2, peakY), barWidth, 2);

          // Floor subtle reflection
          const refHeight = barHeight * 0.28;
          const refGrad = ctx.createLinearGradient(0, height * 0.85, 0, height * 0.85 + refHeight);
          refGrad.addColorStop(0, colors.accent);
          refGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = refGrad;
          ctx.fillRect(x, height * 0.85 + 2, barWidth, refHeight);
        }

      } else {
        // FLUID WAVE OSCILLOSCOPE MODE
        const midY = height * 0.5;

        // Wave Layer 1 (Subtle glow background wave)
        ctx.beginPath();
        for (let i = 0; i < waveArray.length; i++) {
          const x = (i / (waveArray.length - 1)) * width;
          const v = waveArray[i] / 128.0;
          const y = (v * height * 0.35) + (midY - height * 0.175) + Math.sin(phase + i * 0.08) * 8;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = colors.secondary;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = colors.glow;
        ctx.stroke();

        // Wave Layer 2 (Primary crisp luminous wave)
        ctx.beginPath();
        for (let i = 0; i < waveArray.length; i++) {
          const x = (i / (waveArray.length - 1)) * width;
          const v = (waveArray[i] - 128) * 0.7 + 128;
          const y = ((v / 128.0) * height * 0.3) + (midY - height * 0.15) - Math.cos(phase * 0.8 + i * 0.05) * 6;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = colors.primary;
        ctx.lineWidth = 2.5;
        ctx.shadowBlur = 8;
        ctx.shadowColor = colors.primary;
        ctx.stroke();

        // Baseline accent line
        ctx.beginPath();
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1;
        ctx.moveTo(0, midY);
        ctx.lineTo(width, midY);
        ctx.stroke();
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [mode, theme, isPlaying]);

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden pointer-events-none select-none">
      <canvas
        ref={canvasRef}
        width={720}
        height={320}
        className="w-full h-full object-contain max-h-[360px]"
      />
    </div>
  );
};
