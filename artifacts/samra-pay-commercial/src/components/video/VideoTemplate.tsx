// Samra Pay Product Commercial
// "One financial home — here and home in Ethiopia"
// Aspect ratio: 16:9 | Total: ~51s | 6 scenes

import { useVideoPlayer } from '@/lib/video';
import { AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { ComponentType } from 'react';

import { Scene1Pour } from './video_scenes/Scene1Pour';
import { Scene2Here } from './video_scenes/Scene2Here';
import { Scene3Home } from './video_scenes/Scene3Home';
import { Scene4Bridge } from './video_scenes/Scene4Bridge';
import { Scene5Product } from './video_scenes/Scene5Product';
import { Scene6Close } from './video_scenes/Scene6Close';
import { PersistentLayer } from './video_scenes/PersistentLayer';

// 16:9 authoritative aspect ratio
// Total: 5 + 8 + 8 + 10 + 12 + 8 = 51s
export const SCENE_DURATIONS = {
  scene1: 5000,
  scene2: 8000,
  scene3: 8000,
  scene4: 10000,
  scene5: 12000,
  scene6: 8000,
};

const SCENE_COMPONENTS: Record<string, ComponentType> = {
  scene1: Scene1Pour,
  scene2: Scene2Here,
  scene3: Scene3Home,
  scene4: Scene4Bridge,
  scene5: Scene5Product,
  scene6: Scene6Close,
};

const SCENE_START_SEC: Record<string, number> = (() => {
  const offsets: Record<string, number> = {};
  let elapsedMs = 0;
  for (const [key, duration] of Object.entries(SCENE_DURATIONS)) {
    offsets[key] = elapsedMs / 1000;
    elapsedMs += duration;
  }
  return offsets;
})();

const AUDIO_SEEK_EPSILON_SEC = 0.18;

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({
    durations,
    loop,
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = 0.42;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [baseSceneKey, currentSceneKey, muted]);

  return (
    <div
      className="w-full h-screen overflow-hidden relative"
      style={{ background: '#120D06', aspectRatio: '16/9', maxHeight: '100vh', maxWidth: '177.78vh', margin: '0 auto' }}
    >
      {/* Persistent layer — outside AnimatePresence */}
      <PersistentLayer currentScene={sceneIndex} />

      {/* Scene stack */}
      <AnimatePresence mode="popLayout">
        {SceneComponent ? <SceneComponent key={currentSceneKey} /> : null}
      </AnimatePresence>
      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </div>
  );
}
