import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView, type VideoPlayer, type VideoSource } from 'expo-video';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { assetUrl } from '@/lib/api';
import { USE_FIXTURES } from '@/lib/env';
import { formatDuration } from '@/lib/format';
import { usePalette } from '@/lib/settings';
import { onMedia, radius, space } from '@/theme';

import { Icon } from './icon';
import { T } from './ui';

export function toSource(path: string): VideoSource {
  const uri = assetUrl(path);
  return { uri, contentType: /\.m3u8(\?|$)/.test(uri) ? 'hls' : 'progressive' };
}

/** Bottom scrim so overlay text keeps ≥4.5:1 contrast on any frame. */
export function Scrim({ height = '55%' }: { height?: `${number}%` | number }) {
  return (
    <LinearGradient
      colors={onMedia.scrim}
      style={[styles.scrim, { height }]}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/**
 * Typographic poster: used for stories without video (PosterCard) and as the fallback frame
 * under every video until its first frame renders (fixture media mostly doesn't exist).
 */
export function Poster({
  title,
  eyebrow,
  tone = 'dark',
  titleSize = 'large',
  thumbnail,
  style,
  showTitle = true,
  markAt = 'center',
}: {
  title: string;
  eyebrow?: string;
  tone?: 'dark' | 'surface';
  titleSize?: 'large' | 'medium' | 'small';
  thumbnail?: string;
  style?: StyleProp<ViewStyle>;
  showTitle?: boolean;
  /** Where the lens mark sits in an imageless frame; 'top' keeps it clear of overlaid hero text. */
  markAt?: 'center' | 'top';
}) {
  const p = usePalette();
  const dark = tone === 'dark';
  const bg = dark ? '#141414' : p.surface;
  const fg = dark ? '#FFFFFF' : p.text;
  const sub = dark ? 'rgba(255,255,255,0.7)' : p.textFaint;
  const size = { large: { fontSize: 26, lineHeight: 30 }, medium: { fontSize: 19, lineHeight: 23 }, small: { fontSize: 16, lineHeight: 20 } }[titleSize];
  return (
    <View style={[styles.poster, { backgroundColor: bg }, style]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {thumbnail ? <Image source={{ uri: assetUrl(thumbnail) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
      {!thumbnail && showTitle ? (
        <>
          {/* OpenLens lens mark, kept subtle in the corner */}
          <View style={[styles.lens, { borderColor: dark ? 'rgba(255,255,255,0.14)' : p.border }]}>
            <View style={[styles.lensInner, { borderColor: dark ? 'rgba(107,139,255,0.5)' : p.accentSoft }]} />
          </View>
          <View style={styles.posterText}>
            {eyebrow ? (
              <Text style={[styles.posterEyebrow, { color: sub }]} numberOfLines={1}>
                {eyebrow}
              </Text>
            ) : null}
            <Text style={[styles.posterTitle, size, { color: fg }]} numberOfLines={titleSize === 'small' ? 5 : 7}>
              {title}
            </Text>
          </View>
        </>
      ) : null}
      {!thumbnail && !showTitle ? (
        // Media frame without imagery: centred lens mark + market name, so empty frames still read as OpenLens.
        <View style={[styles.centerMark, markAt === 'top' && { justifyContent: 'flex-start', paddingTop: '22%' }]}>
          <View style={[styles.lensMid, { borderColor: dark ? 'rgba(255,255,255,0.16)' : p.border }]}>
            <View style={[styles.lensMidInner, { borderColor: dark ? 'rgba(107,139,255,0.65)' : p.accent }]} />
          </View>
          {eyebrow ? (
            <Text style={[styles.centerLabel, { color: dark ? 'rgba(255,255,255,0.55)' : p.textFaint }]} numberOfLines={2}>
              {eyebrow}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Muted, looping preview with a poster underneath that is only hidden once the first frame
 * renders. If media is unreachable the poster simply stays — no error UI on cards.
 */
export function VideoPreview({
  path,
  active,
  poster,
  style,
  onPlayer,
  loop = true,
  muted = true,
}: {
  path: string;
  active: boolean;
  poster: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPlayer?: (p: VideoPlayer | null) => void;
  loop?: boolean;
  muted?: boolean;
}) {
  const [rendered, setRendered] = useState(false);
  const player = useVideoPlayer(toSource(path), (pl) => {
    pl.muted = muted;
    pl.loop = loop;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);
  useEffect(() => {
    if (active && status !== 'error') player.play();
    else player.pause();
  }, [active, player, status]);
  useEffect(() => {
    onPlayer?.(player);
    return () => onPlayer?.(null);
  }, [player, onPlayer]);
  const showVideo = rendered && status !== 'error';
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: '#141414' }, style]} importantForAccessibility="no-hide-descendants">
      {status !== 'error' ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          nativeControls={false}
          contentFit="cover"
          surfaceType="textureView"
          onFirstFrameRender={() => setRendered(true)}
        />
      ) : null}
      {!showVideo ? <View style={StyleSheet.absoluteFill}>{poster}</View> : null}
    </View>
  );
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
  return (
    <View style={[styles.placeholder, { backgroundColor: '#141414' }, style]} accessible accessibilityLabel={`${title}. ${body ?? ''}`}>
      <View style={[styles.lensBig, { borderColor: 'rgba(255,255,255,0.18)' }]}>
        <View style={[styles.lensBigInner, { borderColor: '#6B8BFF' }]} />
      </View>
      <Text style={styles.phTitle}>{title}</Text>
      {body ? <Text style={styles.phBody}>{body}</Text> : null}
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry loading media" style={styles.retry}>
          <Text style={{ color: '#0A0A0A', fontWeight: '700' }}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Full player with native controls. Tries HLS first (adaptive bitrate), then MP4.
 * On failure shows a poster with a retry (expected in fixture mode with no asset server).
 */
export function StoryVideo({
  hlsUrl,
  mp4Url,
  aspect,
  autoPlay,
  title,
  eyebrow,
  style,
}: {
  hlsUrl?: string;
  mp4Url?: string;
  aspect: '9:16' | '16:9';
  autoPlay?: boolean;
  title: string;
  eyebrow?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const candidates = [hlsUrl, mp4Url].filter((u): u is string => !!u);
  const [attempt, setAttempt] = useState(0);
  const [nonce, setNonce] = useState(0);
  const ratio = aspect === '9:16' ? 9 / 16 : 16 / 9;
  const frame: StyleProp<ViewStyle> = [{ aspectRatio: ratio, maxHeight: aspect === '9:16' ? 560 : undefined, alignSelf: 'center', width: '100%' }, style];

  if (attempt >= candidates.length) {
    return (
      <View style={[frame, { borderRadius: radius.lg, overflow: 'hidden' }]}>
        <Poster title={title} eyebrow={eyebrow} showTitle={false} style={StyleSheet.absoluteFill} />
        <Scrim height="40%" />
        <View style={styles.unavailable}>
          <Text style={styles.unavailableText}>
            {USE_FIXTURES ? 'Offline demo: the rendered video lives on the media server.' : "We couldn't load this video right now."}
          </Text>
          <Pressable
            onPress={() => {
              setAttempt(0);
              setNonce((n) => n + 1);
            }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading video"
            style={styles.retry}>
            <Text style={{ color: '#0A0A0A', fontWeight: '700' }}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  return (
    <PlayerSurface
      key={`${candidates[attempt]}-${nonce}`}
      source={toSource(candidates[attempt])}
      autoPlay={autoPlay}
      style={frame}
      title={title}
      eyebrow={eyebrow}
      onError={() => setAttempt((a) => a + 1)}
    />
  );
}

function PlayerSurface({
  source,
  autoPlay,
  style,
  title,
  eyebrow,
  onError,
}: {
  source: VideoSource;
  autoPlay?: boolean;
  style: StyleProp<ViewStyle>;
  title: string;
  eyebrow?: string;
  onError: () => void;
}) {
  const [rendered, setRendered] = useState(false);
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
      {!rendered ? (
        <View style={StyleSheet.absoluteFill}>
          <Poster title={title} eyebrow={eyebrow} showTitle={false} style={StyleSheet.absoluteFill} />
          <Text style={styles.loadingText}>Loading video…</Text>
        </View>
      ) : null}
      <VideoView
        player={player}
        style={[StyleSheet.absoluteFill, { opacity: rendered ? 1 : 0 }]}
        nativeControls
        contentFit="contain"
        allowsPictureInPicture
        accessibilityLabel={`Video: ${title}`}
        onFirstFrameRender={() => setRendered(true)}
      />
      <View style={styles.aiTag} pointerEvents="none">
        <Text style={styles.aiTagText}>AI presenter</Text>
      </View>
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
    <View style={[styles.audio, { backgroundColor: p.surface, borderColor: p.border }]}>
      <Pressable
        disabled={failed}
        onPress={() => (isPlaying ? player.pause() : player.play())}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? `Pause audio briefing: ${title}` : `Play audio briefing: ${title}`}
        style={[styles.audioBtn, { backgroundColor: failed ? p.border : p.ink }]}>
        <Icon name={isPlaying ? 'pause' : 'play'} size={22} color={p.inkText} />
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
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  poster: { overflow: 'hidden', justifyContent: 'flex-end' },
  posterText: { padding: space.md, gap: space.xs },
  posterEyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  posterTitle: { fontWeight: '800', letterSpacing: -0.3 },
  lens: { position: 'absolute', top: space.md, right: space.md, width: 34, height: 34, borderRadius: 17, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  lensInner: { width: 14, height: 14, borderRadius: 7, borderWidth: 3 },
  centerMark: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: space.sm, padding: space.md, paddingBottom: 40 },
  lensMid: { width: 52, height: 52, borderRadius: 26, borderWidth: 5, alignItems: 'center', justifyContent: 'center' },
  lensMidInner: { width: 22, height: 22, borderRadius: 11, borderWidth: 4 },
  centerLabel: { fontSize: 13, lineHeight: 17, fontWeight: '700', textAlign: 'center' },
  placeholder: { borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm, overflow: 'hidden' },
  lensBig: { width: 64, height: 64, borderRadius: 32, borderWidth: 6, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  lensBigInner: { width: 28, height: 28, borderRadius: 14, borderWidth: 4 },
  phTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  phBody: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  retry: { marginTop: space.sm, backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  loadingText: { position: 'absolute', bottom: space.lg, left: space.lg, color: onMedia.textMuted, fontSize: 13 },
  unavailable: { position: 'absolute', left: space.lg, right: space.lg, bottom: space.lg, gap: space.xs },
  unavailableText: { color: onMedia.textMuted, fontSize: 13, lineHeight: 18 },
  aiTag: { position: 'absolute', top: space.sm, left: space.sm, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: onMedia.pill },
  aiTagText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  audio: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  audioBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});
