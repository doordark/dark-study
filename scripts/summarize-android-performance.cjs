const fs = require('node:fs'), path = require('node:path');
function summarize(gfx, before, after, startup = '') {
  const number = (text, pattern) => { const match = text.match(pattern); return match ? Number(match[1]) : null; };
  return {
    frames: number(gfx, /Total frames rendered:\s*(\d+)/),
    jankyFrames: number(gfx, /Janky frames:\s*(\d+)/),
    jankyPercent: number(gfx, /Janky frames:\s*\d+\s*\(([\d.]+)%\)/),
    p50ms: number(gfx, /50th percentile:\s*([\d.]+)/), p90ms: number(gfx, /90th percentile:\s*([\d.]+)/),
    p95ms: number(gfx, /95th percentile:\s*([\d.]+)/), p99ms: number(gfx, /99th percentile:\s*([\d.]+)/),
    pssBeforeKiB: number(before, /TOTAL PSS:\s*(\d+)/) ?? number(before, /^\s*TOTAL\s+(\d+)/m),
    pssAfterKiB: number(after, /TOTAL PSS:\s*(\d+)/) ?? number(after, /^\s*TOTAL\s+(\d+)/m),
    startupTotalMs: number(startup, /TotalTime:\s*(\d+)/),
  };
}
module.exports = summarize;
if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) throw new Error('请提供采集目录');
  const read = name => fs.existsSync(path.join(dir, name)) ? fs.readFileSync(path.join(dir, name), 'utf8') : '';
  const result = summarize(read('gfxinfo.txt'), read('meminfo-before.txt'), read('meminfo-after.txt'), read('startup.txt'));
  if (result.frames === null || result.frames === 0) throw new Error('没有有效帧统计；请确认应用处于正常交互页面，保留原始记录重新采集。');
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
