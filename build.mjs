import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const common = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  logLevel: 'info',
  define: { __VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0') },
};

if (watch) {
  const ctx = await esbuild.context({ ...common, outfile: 'dist/page-agent.js', sourcemap: 'inline' });
  await ctx.watch();
  console.log('watching…');
} else {
  await esbuild.build({ ...common, outfile: 'dist/page-agent.js' });
  await esbuild.build({ ...common, outfile: 'dist/page-agent.min.js', minify: true });
}
