const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('documentation, gitignore, and deployment config cover the checklist items that can be statically verified', () => {
  const readme = read('README.md');
  const gitignore = read('.gitignore');
  const frontendApp = read('frontend/app.js');
  const frontendGame = read('frontend/public/game.js');
  const frontendClientView = read('frontend/views/client.ejs');
  const backendServer = read('backend/server.py');
  const backendProcfile = read('backend/Procfile');
  const frontendProcfile = read('frontend/Procfile');
  const appYaml = read('frontend/app.yaml');
  const rootNvmrc = read('.nvmrc').trim();
  const frontendNvmrc = read('frontend/.nvmrc').trim();

  assert.match(readme, /Architecture/i);
  assert.match(readme, /Running Locally/i);
  assert.match(readme, /Deployment/i);
  assert.match(readme, /Known Limitations/i);
  assert.match(readme, /room and game state are held in server memory per process/i);

  assert.match(gitignore, /node_modules\//);
  assert.match(gitignore, /logs\//);
  assert.match(gitignore, /backend\/local_db\.json/);
  assert.match(gitignore, /frontend\/playwright-report\//);
  assert.match(gitignore, /frontend\/test-results\//);

  assert.match(frontendApp, /BACKEND must be set to the deployed backend URL in production/i);
  assert.match(frontendApp, /const BACKEND_ENDPOINT = process\.env\.BACKEND \|\| 'http:\/\/localhost:8181';/);
  assert.match(frontendApp, /Preparing prompts and answers\. This can take a moment if the backend is cold\./);
  assert.match(frontendApp, /Login service is unavailable\. Start the backend on port 8181 and try again\./);
  assert.match(frontendApp, /Registration service is unavailable\. Start the backend on port 8181 and try again\./);
  assert.match(frontendGame, /Signing in and waking the backend if needed/i);
  assert.match(frontendGame, /Creating your account and waking the backend if needed/i);
  assert.match(frontendClientView, /phaseLoading\.active/);
  assert.match(backendServer, /port = int\(os\.environ\.get\('PORT', 8181\)\)/);
  assert.match(backendServer, /app\.run\(host='0\.0\.0\.0', port=port/);

  assert.match(backendProcfile, /^web: python server\.py/m);
  assert.match(frontendProcfile, /^web: npm start/m);
  assert.match(appYaml, /runtime: nodejs/i);

  assert.equal(rootNvmrc, '20');
  assert.equal(frontendNvmrc, '20');
});
