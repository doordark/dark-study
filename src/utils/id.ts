/** 模块级 ID / 时间戳工具（组件渲染作用域内不应直接调用 Date.now） */
let seq = 0;

export function uid(): string {
  seq += 1;
  return `${Date.now().toString(36)}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function nowTs(): number {
  return Date.now();
}
