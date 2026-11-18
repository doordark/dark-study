const { spawnSync } = require('node:child_process');
const path = require('node:path');
const checks = ['check-storage-coordination', 'check-pet-chat-lifecycle', 'check-foreground-sharing', 'check-chat-message-list',
  'check-app-performance', 'check-app-backup', 'check-farm-rendering', 'check-farm-chat',
  'check-life-chat-client', 'check-vendor-chat', 'check-farm-residents', 'check-farm-errands',
  'check-animation-atlases', 'check-farm-runtime-assets', 'check-farm-map', 'check-course-editing', 'check-course-tasks', 'check-grade-projection', 'check-schedule-import', 'check-import-page-retry', 'check-whale-memory'];
for (const check of checks) {
  const result = spawnSync(process.execPath, [path.join(__dirname, `${check}.cjs`)], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  if (result.error) { console.error(result.error); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`PASS: ${checks.length} optimization and regression checks`);
