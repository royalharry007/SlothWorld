import { useEffect, useState } from 'react';
import { SAMPLE_WORLD } from '../shared/sampleWorld';
import { useStore } from './store';
import { WorldScene } from './three/WorldScene';
import { Hud } from './ui/Hud';
import { Journal } from './ui/Journal';
import { Landing } from './ui/Landing';
import { Logo } from './ui/Logo';
import { Panels } from './ui/Panels';
import { UploadDialog } from './ui/UploadDialog';

function LoadingScreen() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.body.dataset.sceneLoading === 'done') {
        setGone(true);
        clearInterval(id);
      }
    }, 150);
    return () => clearInterval(id);
  }, []);
  return (
    <div className={`loading-screen${gone ? ' gone' : ''}`} aria-hidden={gone}>
      <div className="inner">
        <Logo size={88} />
        <p>Growing islands…</p>
      </div>
    </div>
  );
}

export default function App() {
  const screen = useStore((s) => s.screen);
  const world = useStore((s) => s.world);
  const journalOpen = useStore((s) => s.journalOpen);
  const [uploading, setUploading] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const [glLost, setGlLost] = useState(false);

  // If the browser drops the 3D context (low graphics memory) and doesn't restore it, offer a one-click reload.
  // Progress lives in the store and local storage, so nothing is lost.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const lost = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setGlLost(true), 2000);
    };
    const restored = () => {
      clearTimeout(timer);
      setGlLost(false);
    };
    window.addEventListener('slothworld:gl-lost', lost);
    window.addEventListener('slothworld:gl-restored', restored);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('slothworld:gl-lost', lost);
      window.removeEventListener('slothworld:gl-restored', restored);
    };
  }, []);
  const playing = screen === 'world' && world;

  return (
    <div className="app">
      <div className="canvas-wrap">
        <WorldScene key={canvasKey} world={playing ? world : SAMPLE_WORLD} mode={playing ? 'play' : 'preview'} />
      </div>
      <div className="overlay">
        {playing ? (
          <>
            <Hud />
            {journalOpen && <Journal />}
            <Panels />
          </>
        ) : (
          <Landing onUpload={() => setUploading(true)} />
        )}
        {uploading && <UploadDialog onClose={() => setUploading(false)} />}
        {glLost && (
          <div className="scrim" role="alertdialog" aria-labelledby="gl-lost-title">
            <div className="dialog" style={{ width: 'min(440px, 100%)' }}>
              <h2 id="gl-lost-title">The 3D view took a nap</h2>
              <p className="sub">Your computer ran low on graphics memory and the browser paused the world. Your progress is safe.</p>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setGlLost(false);
                  setCanvasKey((k) => k + 1);
                }}
              >
                Wake the world up
              </button>
            </div>
          </div>
        )}
      </div>
      <LoadingScreen />
    </div>
  );
}
