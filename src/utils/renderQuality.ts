export type RenderQuality = 'smooth' | 'standard' | 'beautiful';
export const RENDER_QUALITY = {
  smooth: { label: '流畅', hint: '减少装饰与待机动画，关闭雨效和模糊', rain: false, blur: false, idleAnimation: false, particles: 0 },
  standard: { label: '标准', hint: '保留人物动画与天气，适量装饰', rain: true, blur: true, idleAnimation: true, particles: 6 },
  beautiful: { label: '精美', hint: '显示完整装饰、天气与人物动画', rain: true, blur: true, idleAnimation: true, particles: 24 },
} as const;
export function renderQuality(value: unknown) {
  return RENDER_QUALITY[value === 'smooth' || value === 'beautiful' ? value : 'standard'];
}
