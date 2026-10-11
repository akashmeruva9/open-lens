import { useEvent } from 'expo';
import { useVideoPlayer, VideoView, type VideoSource } from 'expo-video';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { assetUrl } from '@/lib/api';
import { USE_FIXTURES } from '@/lib/env';
import { formatDuration } from '@/lib/format';
import { usePalette } from '@/lib/settings';
import { radius, space } from '@/theme';

import { T } from './ui';

function toSource(path: string): VideoSource {
  const uri = assetUrl(path);
  return { uri, contentType: /\.m3u8(\?|$)/.test(uri) ? 'hls' : 'progressive' };
}

/** Navy placeholder used when media can't be reached (offline fixtures, low-data mode, errors). */
export function MediaPlaceholder({
  title,
  body,
  style,
  onRetry,
}: {
  title: string;
  body?: string;
  style?: StyleProp<ViewStyle>;
  onRetry?: () => void;
}) {
  const p = usePalette();
  return (
    <View
      style={[styles.placeholder, { backgroundColor: p.scheme === 'dark' ? '#081022' : '#0B1426' }, style]}
      accessible
      accessibilityLabel={`${title}. ${body ?? ''}`}>
      <View style={[styles.ring, { borderColor: '#38BDF8' }]}>
        <View style={[styles.ringInner, { borderColor: '#BAE6FD' }]} />
      </View>
      <Text style={styles.phTitle}>{title}</Text>
      {body ? <Text style={styles.phBody}>{body}</Text> : null}
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry loading media" style={styles.retry}>
          <Text style={{ color: '#04121F', fontWeight: '700' }}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Full player with native controls. Tries HLS first (adaptive bitrate), then MP4.
 * On failure shows a graceful placeholder (expected in fixture mode with no asset server).
 */
export function StoryVideo({
  hlsUrl,
  mp4Url,
  aspect,
  autoPlay,
  title,
}: {
  hlsUrl?: string;
  mp4Url?: string;
  aspect: '9:16' | '16:9';
  autoPlay?: boolean;
  title: string;
}) {
  const candidates = [hlsUrl, mp4Url].filter((u): u is string => !!u);
  const [attempt, setAttempt] = useState(0);
  const [nonce, setNonce] = useState(0);
  const ratio = aspect === '9:16' ? 9 / 16 : 16 / 9;
  const frame = { aspectRatio: ratio, maxHeight: aspect === '9:16' ? 520 : undefined, alignSelf: 'center' as const, width: '100%' as const };

  if (attempt >= candidates.length) {
    return (
      <MediaPlaceholder
        style={frame}
        title="Video unavailable"
        body={USE_FIXTURES ? 'Offline demo: the rendered video lives on the media server.' : "We couldn't load this video right now."}
        onRetry={() => {
          setAttempt(0);
          setNonce((n) => n + 1);
        }}
      />
    );
  }
  return (
    <PlayerSurface
      key={`${candidates[attempt]}-${nonce}`}
      source={toSource(candidates[attempt])}
      autoPlay={autoPlay}
      style={frame}
      title={title}
      onError={() => setAttempt((a) => a + 1)}
    />
  );
}

function PlayerSurface({
  source,
  autoPlay,
  style,
  title,
  onError,
}: {
  source: VideoSource;
  autoPlay?: boolean;
  style: StyleProp<ViewStyle>;
  title: string;
  onError: () => void;
}) {
  const p = usePalette();
  const player = useVideoPlayer(source, (pl) => {
    pl.staysActiveInBackground = true;
    pl.showNowPlayingNotification = true;
    if (autoPlay) pl.play();
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  useEffect(() => {
    if (status === 'error') onError();
  }, [status, onError]);
  return (
    <View style={[style, { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' }]}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls
        contentFit="contain"
        allowsPictureInPicture
        accessibilityLabel={`Video: ${title}`}
      />
      <View style={[styles.aiTag, { backgroundColor: p.overlay }]} pointerEvents="none">
        <Text style={styles.aiTagText}>AI-GENERATED PRESENTER</Text>
      </View>
    </View>
  );
}

/** Muted, looping, caption-friendly preview used on feed cards (only while the card is visible). */
export function FeedVideoPreview({ path, active, style }: { path: string; active: boolean; style?: StyleProp<ViewStyle> }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <MediaPlaceholder style={style} title="OpenLens" body="Swipe the lenses · tap for evidence" />;
  return <PreviewSurface path={path} active={active} style={style} onError={() => setFailed(true)} />;
}

function PreviewSurface({ path, active, style, onError }: { path: string; active: boolean; style?: StyleProp<ViewStyle>; onError: () => void }) {
  const player = useVideoPlayer(toSource(path), (pl) => {
    pl.muted = true;
    pl.loop = true;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  useEffect(() => {
    if (status === 'error') onError();
  }, [status, onError]);
  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);
  return (
    <View style={[style, { backgroundColor: '#081022' }]} importantForAccessibility="no-hide-descendants">
      <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} contentFit="cover" />
    </View>
  );
}

/** Audio briefing player (expo-video handles audio-only streams, incl. lock-screen controls). */
export function AudioBriefing({ url, durationSeconds, title }: { url: string; durationSeconds: number; title: string }) {
  const p = usePalette();
  const player = useVideoPlayer(toSource(url), (pl) => {
    pl.staysActiveInBackground = true;
    pl.showNowPlayingNotification = true;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const failed = status === 'error';
  return (
    <View style={[styles.audio, { backgroundColor: p.surfaceAlt, borderColor: p.border }]}>
      <Pressable
        disabled={failed}
        onPress={() => (isPlaying ? player.pause() : player.play())}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? `Pause audio briefing: ${title}` : `Play audio briefing: ${title}`}
        style={[styles.audioBtn, { backgroundColor: failed ? p.border : p.accent }]}>
        <Text style={{ color: p.accentText, fontSize: 20, fontWeight: '800' }}>{isPlaying ? '❚❚' : '▶'}</Text>
      </Pressable>
      <View style={{ flex: 1 }}>
        <T variant="bodyStrong" numberOfLines={2}>
          Audio briefing
        </T>
        <T variant="caption" tone="muted">
          {failed ? (USE_FIXTURES ? 'Audio not reachable in offline demo' : 'Audio unavailable') : `${formatDuration(durationSeconds)} · AI narration`}
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm, overflow: 'hidden' },
  ring: { width: 72, height: 72, borderRadius: 36, borderWidth: 7, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  ringInner: { width: 34, height: 34, borderRadius: 17, borderWidth: 4 },
  phTitle: { color: '#EEF3FB', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  phBody: { color: '#9DB0CF', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  retry: { marginTop: space.sm, backgroundColor: '#38BDF8', borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 40, justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  aiTag: { position: 'absolute', top: space.sm, left: space.sm, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  aiTagText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  audio: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  audioBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});
