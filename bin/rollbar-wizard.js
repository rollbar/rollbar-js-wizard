#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');

// Try to require from dist first, fallback to source if needed
let runNextjsWizard, isNextjsProject, isNuxtjsProject, isSvelteProject;

try {
  // Try compiled version first
  ({ runNextjsWizard } = require('../dist/nextjs/wizard'));
  ({ isNextjsProject, isNuxtjsProject, isSvelteProject } = require('../dist/utils/project'));
} catch (error) {
  console.error(chalk.red('❌ Error: The wizard needs to be built first.'));
  console.log(chalk.yellow('Please run: npm run build'));
  process.exit(1);
}

program
  .name('rollbar-wizard')
  .description('Automated setup wizard for Rollbar integrations')
  .version('1.0.0');

program
  .command('nextjs')
  .description('Setup Rollbar for Next.js project')
  .option('--access-token <token>', 'Rollbar access token')
  .option('--environment <env>', 'Environment name', 'production')
  .option('--skip-install', 'Skip package installation')
  .option('--typescript', 'Use TypeScript configuration')
  .option('--yes', 'Skip prompts and use defaults')
  .action(async (options) => {
    try {
      console.log(chalk.blue.bold('🎯 Rollbar Next.js Setup Wizard\n'));
      
      // Check if this is a Next.js project
      if (!isNextjsProject()) {
        console.error(chalk.red('❌ This doesn\'t appear to be a Next.js project.'));
        console.log('Please run this command in a Next.js project directory.');
        process.exit(1);
      }

      await runNextjsWizard(options);
    } catch (error) {
      console.error(chalk.red('❌ Wizard failed:'), error.message);
      console.log(chalk.gray('Error details:'), error);
      process.exit(1);
    }
  });

program
  .command('nuxtjs')
  .description('Setup Rollbar for Nuxt.js project')
  .action(async () => {
    console.error(chalk.red('❌ Nuxt.js wizard is not yet implemented.'));
    console.log(chalk.yellow('Coming soon! For now, please use the Next.js wizard.'));
    process.exit(1);
  });

program
  .command('svelte')
  .description('Setup Rollbar for Svelte or SvelteKit project')
  .action(async () => {
    console.error(chalk.red('❌ Svelte wizard is not yet implemented.'));
    console.log(chalk.yellow('Coming soon! For now, please use the Next.js wizard.'));
    process.exit(1);
  });

// Auto-detect project type if no specific command is given
program
  .action(async () => {
    try {
      console.log(chalk.blue.bold('🎯 Rollbar Setup Wizard\n'));
      
      if (isNextjsProject()) {
        console.log(chalk.green('✅ Next.js project detected'));
        console.log('Running Next.js setup wizard...\n');
        await runNextjsWizard({});
      } else if (isNuxtjsProject()) {
        console.log(chalk.yellow('⚠️  Nuxt.js project detected, but wizard is not yet implemented.'));
        console.log('Coming soon!');
        process.exit(1);
      } else if (isSvelteProject()) {
        console.log(chalk.yellow('⚠️  Svelte/SvelteKit project detected, but wizard is not yet implemented.'));
        console.log('Coming soon!');
        process.exit(1);
      } else {
        console.log(chalk.yellow('⚠️  Project type not detected or not supported yet.'));
        console.log('Currently supported frameworks:');
        console.log('  • Next.js');
        console.log('  • Nuxt.js');
        console.log('  • Svelte');
        console.log('\nPlease run the wizard in a supported project directory.');
      }
    } catch (error) {
      console.error(chalk.red('❌ Wizard failed:'), error.message);
      console.log(chalk.gray('Error details:'), error);
      process.exit(1);
    }
  });

program.parse(); 