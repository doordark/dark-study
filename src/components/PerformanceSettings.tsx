import { useState, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import { GlassContainer } from './GlassContainer';
import { useSettings } from '@/store/useSettings';
import { RENDER_QUALITY, type RenderQuality } from '@/utils/renderQuality';
import { aiRequests } from '@/utils/requestCoordinator';
import { storageHealth } from '@/utils/coordinatedStorage';
import { flushPendingWrites } from '@/utils/coalescedWriter';

export function PerformanceSettings() {
  const quality = useSettings(s => s.renderQuality);
  const setQuality = useSettings(s => s.setRenderQuality);
  const requests = useSyncExternalStore(aiRequests.subscribe, aiRequests.getSnapshot, aiRequests.getSnapshot);
  const [details, setDetails] = useState(false);
  const failedSaves = useSyncExternalStore(storageHealth.subscribe, storageHealth.getSnapshot, storageHealth.getSnapshot);
  const [retrying, setRetrying] = useState(false);
  return <View style={{ gap: 16 }}>
    <GlassContainer><View style={{ padding: 18, gap: 12 }}>
      <Text className="text-lg font-bold text-slate-800 dark:text-white">画面表现</Text>
      {(Object.keys(RENDER_QUALITY) as RenderQuality[]).map(key => <Pressable key={key}
        accessibilityRole="radio" accessibilityState={{ checked: key === quality }} onPress={() => setQuality(key)}
        className={key === quality ? 'rounded-xl bg-sky-400/25 p-3' : 'rounded-xl bg-slate-400/10 p-3'}>
        <Text className="font-bold text-slate-800 dark:text-white">{RENDER_QUALITY[key].label}{key === quality ? ' ✓' : ''}</Text>
        <Text className="mt-1 text-xs text-slate-600 dark:text-slate-300">{RENDER_QUALITY[key].hint}</Text>
      </Pressable>)}
      <Text className="text-xs text-slate-500 dark:text-slate-400">立即生效。人物走动、对话和游戏进度不受画质选择影响；系统的减少动态效果设置继续优先生效。</Text>
    </View></GlassContainer>
    <GlassContainer><View style={{ padding: 18, gap: 10 }}>
      <Text className="font-bold text-slate-800 dark:text-white">本地保存状态</Text>
      <Text className="text-sm text-slate-600 dark:text-slate-300">{failedSaves.length ? `${failedSaves.length} 项数据尚未保存成功，当前修改仍保留在内存中。` : '本次启动暂未发现保存错误。'}</Text>
      {failedSaves.length ? <Pressable disabled={retrying} accessibilityRole="button" onPress={() => {
        setRetrying(true); void flushPendingWrites().catch(() => {}).finally(() => setRetrying(false));
      }}><Text className="text-sky-600 dark:text-sky-300">{retrying ? '正在重试…' : '重试保存'}</Text></Pressable> : null}
    </View></GlassContainer>
    <GlassContainer><View style={{ padding: 18, gap: 10 }}>
      <Text className="font-bold text-slate-800 dark:text-white">AI 请求状态</Text>
      <Text className="text-sm text-slate-600 dark:text-slate-300">正在处理 {requests.active} · 等待 {requests.queued}</Text>
      <Text className="text-xs text-slate-500 dark:text-slate-400">主动操作优先，后台闲聊最多同时处理一项。各功能仍使用原有额度。</Text>
      <Pressable accessibilityRole="button" onPress={() => setDetails(value => !value)}><Text className="text-sky-600 dark:text-sky-300">{details ? '收起耗时记录' : '查看最近请求耗时'}</Text></Pressable>
      {details ? requests.recent.slice(0, 8).map((record, index) => <Text key={index} className="text-xs text-slate-600 dark:text-slate-300">
        {record.label} · {record.outcome === 'success' ? '完成' : record.outcome === 'cancelled' ? '取消' : '未完成'} · 等待 {(record.waitMs / 1000).toFixed(1)} 秒 · 处理 {(record.durationMs / 1000).toFixed(1)} 秒
      </Text>) : null}
      {details && !requests.recent.length ? <Text className="text-xs text-slate-500">本次启动还没有请求记录。</Text> : null}
    </View></GlassContainer>
  </View>;
}
