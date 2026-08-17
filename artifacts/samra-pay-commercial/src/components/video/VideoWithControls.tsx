import { ChevronDown, ChevronUp, Repeat2, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';

const PROGRESS_TICK_MS = 60;

function ProgressSegments({
  sceneKeys,
  activeIndex,
  activeDuration,
  tick,
  onJumpTo,
}: {
  sceneKeys: string[];
  activeIndex: number;
  activeDuration: number;
  tick: number;
  onJumpTo: (index: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      setElapsed(performance.now() - startedAt);
    }, PROGRESS_TICK_MS);
    return () => window.clearInterval(timer);
  }, [tick]);

  const progress = activeDuration > 0 ? Math.min(1, elapsed / activeDuration) : 0;

  return (
    <div className="flex flex-1 items-center gap-1.5">
      {sceneKeys.map((key, index) => {
        const active = index === activeIndex;
        const width = active ? progress * 100 : 0;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onJumpTo(index)}
            className="relative h-3 min-h-3 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/20 transition-all hover:h-4 hover:bg-white/30"
            aria-label={`Jump to scene ${index + 1}`}
            aria-current={active ? 'true' : undefined}
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-[#C99A2E] transition-[width] duration-100"
              style={{ width: `${width}%` }}
            />
          </button>
        );
      })}
    </div>
  );
}

export default function VideoWithControls() {
  const isIframed = typeof window !== 'undefined' && window.self !== window.top;
  const sensorRef = useRef<HTMLDivElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tapPinned, setTapPinned] = useState(false);
  const {
    sceneKeys,
    activeIndex,
    locked,
    mountKey,
    tick,
    durations,
    activeDuration,
    onSceneChange,
    jumpTo,
    toggleLock,
  } = useSceneControls(SCENE_DURATIONS);

  const handlePointerEnter = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') setHovering(true);
  }, []);

  const handlePointerLeave = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') setHovering(false);
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' && collapsed) setTapPinned(true);
  }, [collapsed]);

  const handleToggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      if (!value) {
        setHovering(false);
        setTapPinned(false);
      }
      return !value;
    });
  }, []);

  useEffect(() => {
    if (!(collapsed && tapPinned)) return;
    const handleDocumentPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      if (sensorRef.current && !sensorRef.current.contains(event.target as Node)) {
        setTapPinned(false);
      }
    };
    document.addEventListener('pointerdown', handleDocumentPointerDown);
    return () => document.removeEventListener('pointerdown', handleDocumentPointerDown);
  }, [collapsed, tapPinned]);

  if (!isIframed) return <VideoTemplate />;

  const barVisible = !collapsed || hovering || tapPinned;

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <VideoTemplate
        key={mountKey}
        durations={durations}
        loop
        muted={muted}
        onSceneChange={onSceneChange}
      />
      <div
        ref={sensorRef}
        className="absolute bottom-0 left-0 right-0 z-50 flex h-1/4 flex-col justify-end"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
      >
        <div className="w-full flex-1" aria-hidden="true" />
        <div
          className={`flex items-center gap-3 border-t border-white/10 bg-[#120D06]/82 px-5 py-4 text-white backdrop-blur-md transition-all duration-200 ease-out ${
            barVisible
              ? 'translate-y-0 opacity-100 pointer-events-auto'
              : 'pointer-events-none translate-y-full opacity-0'
          }`}
          aria-hidden={!barVisible}
        >
          <button
            type="button"
            onClick={toggleLock}
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg transition-colors ${
              locked ? 'bg-[#C99A2E] text-[#120D06]' : 'text-white/65 hover:bg-white/10 hover:text-white'
            }`}
            title={locked ? 'Loop current scene: on' : 'Loop current scene: off'}
            aria-label={locked ? 'Loop current scene: on' : 'Loop current scene: off'}
            aria-pressed={locked}
          >
            <Repeat2 className="h-7 w-7" />
          </button>
          <button
            type="button"
            onClick={() => setMuted((value) => !value)}
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg transition-colors ${
              muted ? 'text-white/65 hover:bg-white/10 hover:text-white' : 'bg-white/15 text-white'
            }`}
            title={muted ? 'Enable audio' : 'Mute audio'}
            aria-label={muted ? 'Enable audio' : 'Mute audio'}
            aria-pressed={!muted}
          >
            {muted ? <VolumeX className="h-7 w-7" /> : <Volume2 className="h-7 w-7" />}
          </button>
          <div className="h-10 w-px bg-white/15" aria-hidden="true" />
          <ProgressSegments
            sceneKeys={sceneKeys}
            activeIndex={activeIndex}
            activeDuration={activeDuration}
            tick={tick}
            onJumpTo={jumpTo}
          />
          <span className="shrink-0 font-mono text-lg text-white/65">
            {activeIndex + 1}/{sceneKeys.length}
          </span>
          <button
            type="button"
            onClick={handleToggleCollapsed}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-white/65 transition-colors hover:bg-white/10 hover:text-white"
            title={collapsed ? 'Show controls' : 'Hide controls'}
            aria-label={collapsed ? 'Show controls' : 'Hide controls'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronUp className="h-8 w-8" /> : <ChevronDown className="h-8 w-8" />}
          </button>
        </div>
      </div>
    </div>
  );
}