// Subject: three user-supplied Ritmo player references, added without replacing existing skins.
// Plan: inherited Persian face + plain Latin metadata; leather #141517, scarlet #b73732,
// midnight #050b14, cobalt #205bea, steel #969daa. Cassette hardware, planetary
// full-bleed artwork, and asymmetrical architectural sleeve each keep their own silhouette.
// Signature: physical cassette reels move only with the real transport; all controls
// delegate to the existing player; one unmistakable play target.
import React, { useEffect, useState } from 'react';
import { MoreHorizontal, Heart, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1 } from 'lucide-react';
import type { NocturneControls } from './NocturnePlayerSkin';
import type { LyricLine } from '../types';
import { audioAnalysisSnapshot, subscribeAudioAnalysis } from '../utils/audioAnalysis';
import PlayerSeekBar from './PlayerSeekBar';
import PlayerSkinMenus from './PlayerSkinMenus';
import cassette from './reference-skins/cassette-shell.webp';
import hub from './reference-skins/cassette-hub.webp';
import './ReferencePlayerSkins.css';

export const REFERENCE_SKIN_IDS = ['studio-cassette', 'midnight-orbit', 'silent-architecture'] as const;
export type ReferenceSkin = typeof REFERENCE_SKIN_IDS[number];
export function isReferenceSkin(skin: string): skin is ReferenceSkin {
  return (REFERENCE_SKIN_IDS as readonly string[]).includes(skin);
}
export type ReferenceControls = NocturneControls & {
  volume: number; volumeChange: (value: number) => void;
  speed: number; speedChange: (value: number) => void;
  setShuffle: () => void; setRepeat: () => void;
};
const time = (value: number) => {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
function DeckSkip({ forward = false }: { forward?: boolean }) {
  return <svg viewBox="0 0 32 24" aria-hidden="true" style={{ transform:forward ? 'rotate(180deg)' : undefined }}>
    <path d="M15 3 2 12l13 9V3Zm14 0-13 9 13 9V3Z" fill="currentColor" stroke="none" />
  </svg>;
}

/** A visual skin, never a second audio player. Previews have no nested buttons. */
export default function ReferencePlayerSkin({ skin, title = 'RITMO', artist = 'ریتمو', artwork, playing,
  position = 0, duration = 0, genre, year, lyrics = [], controls }: {
  skin: ReferenceSkin; title?: string; artist?: string; artwork: React.ReactNode; playing: boolean;
  position?: number; duration?: number; genre?: string; year?: number;
  lyrics?: LyricLine[]; controls?: ReferenceControls;
}) {
  const mechanical = skin === 'studio-cassette';
  const architectural = skin === 'silent-architecture';
  const [bands, setBands] = useState<number[]>(() => audioAnalysisSnapshot().frame.bands);
  useEffect(() => {
    if (skin !== 'midnight-orbit' || !controls) return;
    return subscribeAudioAnalysis((frame, active) => setBands(active ? frame.bands : Array(24).fill(0)));
  }, [skin, !!controls]);
  const button = (label: string, icon: React.ReactNode, action?: () => void, className = '', pressed?: boolean) =>
    controls ? <button type="button" aria-label={label} title={label} aria-pressed={pressed}
      className={className} onClick={action}>{icon}</button>
      : <span className={className} aria-hidden="true">{icon}</span>;
  const details = <div className="ref-details" dir="auto">
    <h1>{title}</h1>
  </div>;
  const shuffle = controls?.mode === 'shuffle';
  const repeated = controls?.mode === 'song' || controls?.mode === 'queue';
  const transport = <>
    {button('قبلی', mechanical ? <DeckSkip /> : <SkipBack />, controls?.prev, 'ref-skip')}
    {button(playing ? 'توقف موقت' : 'پخش', playing ? <Pause /> : <Play />, controls?.play, 'ref-play')}
    {button('بعدی', mechanical ? <DeckSkip forward /> : <SkipForward />, controls?.next, 'ref-skip')}
  </>;
  const favorite = button('مورد علاقه', <Heart fill={controls?.isFavorite ? 'currentColor' : 'none'} />,
    controls?.favorite, 'ref-heart', controls?.isFavorite);
  return <section className={`ritmo-reference ref-${skin} ${playing ? 'ref-playing' : ''} ${controls ? 'ref-live' : 'ref-preview'}`}
    aria-label={mechanical ? 'کاست استودیویی' : architectural ? 'مدار خاموش' : 'مدار نیمه‌شب'}>
    <PlayerSkinMenus slot="top" controls={controls} title={title} artist={artist} />
    <div className="ref-main">
      {mechanical ? <div className="ref-cassette-panel">
        <i className="ref-screw ref-screw-tl" /><i className="ref-screw ref-screw-tr" />
        <div className="ref-cassette">
          <img src={cassette} alt="" draggable={false} />
          <img className="ref-hub ref-hub-left" src={hub} alt="" draggable={false} />
          <img className="ref-hub ref-hub-right" src={hub} alt="" draggable={false} />
        </div>
        <i className="ref-screw ref-screw-bl" /><i className="ref-screw ref-screw-br" />
      </div> : architectural ? <div className="ref-architectural-stage">
        <div className="ref-live-cover">{artwork}</div>
      </div> : <div className="ref-planet-stage ref-orbit-stage">
        <div className="ref-moon-vinyl" aria-label="وینیل ماه"><div className="ref-moon-record">
          <div className="ref-moon-label">{artwork}</div><i className="ref-moon-spindle" />
        </div></div>
      </div>}
      {!architectural && <div className="ref-heading-row">{favorite}{details}
        {!mechanical && button('عملیات آهنگ', <MoreHorizontal />, controls?.more, 'ref-more')}</div>}
      <div className="ref-timeline" dir="ltr">
        {controls ? <PlayerSeekBar position={position} duration={duration} progress={duration > 0 ? Math.max(0, Math.min(100, position / duration * 100)) : 0} seek={controls.seek} />
          : <div className="ref-static-seek"><i /></div>}
        <div className="ref-times"><span>{time(position)}</span><span>{time(duration)}</span></div>
      </div>
      <div className="ref-console">
        <div className="ref-transport" dir="ltr">
          {!mechanical && button('پخش تصادفی', <Shuffle />, controls?.setShuffle, `ref-mode ${shuffle ? 'ref-active' : ''}`, shuffle)}
          {transport}
          {!mechanical && button('تکرار', controls?.mode === 'song' ? <Repeat1 /> : <Repeat />,
            controls?.setRepeat, `ref-mode ${repeated ? 'ref-active' : ''}`, repeated)}
        </div>
      </div>
      {skin === 'midnight-orbit' && <div className="ref-spectrum" aria-hidden="true">
        {Array.from({ length:48 }, (_, index) => <i key={index} style={{ height:`${3 + Math.max(0, Math.min(1, bands[Math.floor(index / 2)] ?? 0)) * 22}px` }} />)}
      </div>}
    </div>
    <PlayerSkinMenus slot="bottom" controls={controls} lyrics={lyrics} position={position} title={title} artist={artist} />
  </section>;
}
