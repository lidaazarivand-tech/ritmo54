// Test fixtures only. This is not a production entry point or an alternative app.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import PlaylistDetail from '../src/components/PlaylistDetail';
import PlayerSkinMenus, { LyricsTrackContext } from '../src/components/PlayerSkinMenus';

const tracks = Array.from({ length: 40 }, (_, index) => ({
  id: `audio-${index + 1}`, title: `آهنگ ${index + 1}`, titleEn: '', artist:'خواننده آزمایشی',
  artistEn:'', album:'', albumEn:'', duration:180, audioSrc:'', coverArt:'',
  genre:'', genreEn:'', year:0, quality:'', lyrics:[],
}));
function Fixture() {
  const [ids,setIds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ritmo_fixture_order') || 'null');
      return Array.isArray(saved) && saved.length === tracks.length ? saved as string[] : tracks.map(t => t.id);
    } catch { return tracks.map(t => t.id); }
  });
  const [clicks,setClicks] = useState(0);
  const [song,setSong] = useState(1);
  const [showLyrics,setShowLyrics] = useState(false);
  const [showPlaylist,setShowPlaylist] = useState(true);
  const reorder = (from:number,to:number) => setIds(old => {
    const next=[...old];
    next.splice(to,0,...next.splice(from,1));
    localStorage.setItem('ritmo_fixture_order',JSON.stringify(next));
    return next;
  });
  const controls = {
    play:()=>{},prev:()=>{},next:()=>{},seek:()=>{},favorite:()=>{},queue:()=>{},cycleMode:()=>{},
    isFavorite:false,mode:'normal',modeLabel:'عادی',
  };
  return <>
    <output id="state" style={{display:'none'}}>{JSON.stringify({ids,clicks,song})}</output>
    <button id="lyrics-fixture" onClick={()=>setShowLyrics(true)}>Lyrics fixture</button>
    {showLyrics && <button id="playlist-fixture" onClick={()=>{setShowLyrics(false);setShowPlaylist(true);}}>Back to playlist</button>}
    {showLyrics ? <LyricsTrackContext.Provider value={{id:`song-${song}`}}>
      <button id="change-song" onClick={()=>setSong(old=>old+1)}>Change song</button>
      <PlayerSkinMenus key={song} slot="bottom" controls={controls} title={`آهنگ ${song}`} artist="خواننده" />
    </LyricsTrackContext.Provider> : showPlaylist ? <section className="ritmo-playlist-detail">
      <PlaylistDetail id="fixture" name="لیست آزمایشی" tracks={ids.map(id=>tracks.find(t=>t.id===id)!)}
        visibleTracks={ids.map(id=>tracks.find(t=>t.id===id)!)} visibleTrackIndexes={ids.map((_,index)=>index)} manual={true} currentId="audio-2" playing={false}
        artwork={(_track,className)=><span className={className} style={{display:'block',background:'#334155'}} />}
        back={()=>{}} add={()=>{}} chooseCover={()=>{}} playAll={()=>{}} manualMode={true} toggleManualMode={()=>{}}
        playbackMode="sequence" cyclePlaybackMode={()=>{}}
        playTrack={()=>setClicks(old=>old+1)} moreTrack={()=>{}} removeTrack={()=>{}} deletePlaylist={()=>{}}
        reorderTrack={reorder} saving={false}
      />
      <button id="leave-playlist" onClick={()=>setShowPlaylist(false)}>Leave playlist</button>
    </section> : <button id="return-playlist" onClick={()=>setShowPlaylist(true)}>Return to playlist</button>}
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
