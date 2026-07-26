#!/usr/bin/env node

const { Command } = require('commander');
const enqueue = require('../src/commands/enqueue');
const workerStart = require('../src/commands/workerStart');
const workerStop = require('../src/commands/workerStop');
const status = require('../src/commands/status');
const list = require('../src/commands/list');
const { dlqList, dlqRetry } = require('../src/commands/dlq');
const { configGet, configSet } = require('../src/commands/config');

const program = new Command();

program
  .name('queuectl')
  .description('A robust MongoDB-backed job queue CLI')
  .version('1.0.0');

// queuectl enqueue <json>
program.command('enqueue <json>')
  .description('Enqueue a new job with a JSON payload')
  .action(enqueue);

// queuectl worker
const workerCmd = program.command('worker')
  .description('Manage worker processes');

// queuectl worker start --count <n>
workerCmd.command('start')
  .description('Start worker processes')
  .option('--count <n>', 'Number of workers to start', (val) => parseInt(val, 10), 1)
  .action(async (options) => {
    await workerStart({ count: options.count });
  });

// queuectl worker stop
workerCmd.command('stop')
  .description('Stop all running worker processes')
  .action(workerStop);

// queuectl status
program.command('status')
  .description('Show queue and worker status')
  .action(status);

// queuectl list --state <state> --json
program.command('list')
  .description('List jobs, optionally filtered by state')
  .option('--state <state>', 'Filter jobs by state')
  .option('--json', 'Output raw JSON array')
  .action(async (options) => {
    await list({ state: options.state, json: options.json });
  });

// queuectl dlq
const dlqCmd = program.command('dlq')
  .description('Manage the Dead Letter Queue (DLQ)');

// queuectl dlq list
dlqCmd.command('list')
  .description('List all dead jobs')
  .action(dlqList);

// queuectl dlq retry <id>
dlqCmd.command('retry <id>')
  .description('Re-enqueue a dead job and reset its attempts')
  .action(dlqRetry);

// queuectl config
const configCmd = program.command('config')
  .description('Manage global configuration');

// queuectl config get
configCmd.command('get')
  .description('Get the current configuration')
  .action(configGet);

// queuectl config set <key> <value>
configCmd.command('set <key> <value>')
  .description('Set a configuration value')
  .action(configSet);

program.parseAsync(process.argv).catch(err => {
  console.error(err);
  process.exitCode = 1;
});
