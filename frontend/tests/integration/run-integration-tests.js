const { spawnSync } = require('child_process');
const path = require('path');

const testFiles = [
  'checklist-static-project.test.js',
  'checklist-room-flow.test.js',
  'checklist-reconnect-moderation.test.js',
  'checklist-disconnect-admin.test.js',
  'checklist-gameplay-flow.test.js'
];

for (const testFile of testFiles) {
  const result = spawnSync(process.execPath, ['--test', path.join(__dirname, testFile)], {
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
