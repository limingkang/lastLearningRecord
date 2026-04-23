#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = __dirname;
const distDir = path.join(rootDir, 'docs', '.vuepress', 'dist');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || rootDir,
    stdio: options.stdio || 'inherit',
    encoding: 'utf8',
    shell: options.shell || false,
  });

  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    if (options.stdio === 'pipe') {
      if (result.stdout) {
        process.stdout.write(result.stdout);
      }
      if (result.stderr) {
        process.stderr.write(result.stderr);
      }
    }
    process.exit(result.status || 1);
  }

  return result.stdout ? result.stdout.trim() : '';
}

function getRepoUrl() {
  const remoteUrl = run('git', ['remote', 'get-url', 'origin'], {
    cwd: rootDir,
    stdio: 'pipe',
  });

  if (!remoteUrl) {
    console.error('Git remote "origin" not found.');
    process.exit(1);
  }

  return remoteUrl;
}

const repoUrl = getRepoUrl();

console.log('Building site...');
run(npmCommand, ['run', 'build'], {
  shell: process.platform === 'win32',
});

if (!fs.existsSync(distDir)) {
  console.error(`Build output not found: ${distDir}`);
  process.exit(1);
}

console.log('Preparing deployment branch...');
run('git', ['init'], { cwd: distDir });
run('git', ['add', '-A'], { cwd: distDir });

const status = run('git', ['status', '--porcelain'], {
  cwd: distDir,
  stdio: 'pipe',
});

if (!status) {
  console.log('No changes to deploy.');
  process.exit(0);
}

run('git', ['commit', '-m', 'deploy'], { cwd: distDir });
console.log('Pushing to remote branch gh-pages...');
run('git', ['push', '-f', repoUrl, 'HEAD:gh-pages'], {
  cwd: distDir,
});

console.log('Deploy finished. Published branch: gh-pages');
