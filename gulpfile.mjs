import afr from 'afr'
import cp from 'child_process'
import del from 'del'
import gulp from 'gulp'
import gulpAutoprefixer from 'gulp-autoprefixer'
import gulpBabel from 'gulp-babel'
import gulpCleanCss from 'gulp-clean-css'
import gulpEslint from 'gulp-eslint'
import gulpSass from 'gulp-sass'
import gulpStatil from 'gulp-statil'
import gulpWatch from 'gulp-watch'
import File from 'vinyl'
import log from 'fancy-log'
import uglifyEs from 'uglify-es'
import uglifyJs from 'uglify-js'
import webpack from 'webpack'
import {Transform} from 'stream'
import statilConfig from './statil.mjs'
import webpackConfig from './webpack.config.mjs'

/**
 * Globals
 */

const srcScriptFiles = 'src/**/*.mjs'
const srcDocScriptFiles = 'docs/scripts/**/*.js'
const srcDocHtmlFiles = 'docs/html/**/*'
const srcDocStyleFiles = 'docs/styles/**/*.scss'
const srcDocStyleMain = 'docs/styles/docs.scss'

const outEsDir = 'es'
const outDistDir = 'dist'
const outDocRootDir = 'gh-pages'
const outDocStyleDir = 'gh-pages/styles'

process.env.COMMIT = cp.execSync('git rev-parse --short HEAD').toString().trim()

const GulpErr = msg => ({showStack: false, toString: () => msg})

// Simpler and better than gulp-uglify
function uglifyStream(uglify, options) {
  return new Transform({
    objectMode: true,
    transform(file, __, done) {
      if (!file.isBuffer()) {
        done()
        return
      }

      const {relative, contents} = file
      const output = uglify.minify(String(contents), options)

      if (!output) {
        done(GulpErr(`Unable to minify ${relative}`))
        return
      }

      const {error, warnings, code} = output
      if (error) {
        done(GulpErr(error))
        return
      }
      if (warnings) for (const warning of warnings) log.warn(warning)

      done(undefined, new File({
        path: relative,
        contents: Buffer.from(code),
      }))
    },
  })
}

/**
 * Tasks
 */

/* --------------------------------- Clear ---------------------------------- */

// TODO clear the contents of all output folders.
gulp.task('clear', () => (
  // Skips dotfiles like `.git` and `.gitignore`
  del(`${outDocRootDir}/*`).catch(console.error.bind(console))
))

/* ---------------------------------- Lib -----------------------------------*/

gulp.task('lib:build', () => (
  gulp.src(srcScriptFiles)
    .pipe(gulpBabel())
    // Mangles "private" properties to reduce API surface and potential confusion
    .pipe(uglifyStream(uglifyEs, {
      mangle: {keep_fnames: true, properties: {regex: /_$/}},
      compress: false,
      output: {beautify: true},
    }))
    .pipe(gulp.dest(outEsDir))
    .pipe(gulpBabel({
      plugins: [
        ['@babel/plugin-transform-modules-commonjs', {strict: true}],
      ],
    }))
    .pipe(gulp.dest(outDistDir))
    // Ensures ES5 compliance and lets us measure minified size
    .pipe(uglifyStream(uglifyJs, {
      mangle: {toplevel: true},
      compress: {warnings: false},
    }))
    .pipe(new Transform({
      objectMode: true,
      transform(file, __, done) {
        log(`Minified size: ${file.relative} — ${file._contents.length} bytes`)
        done()
      },
    }))
))

gulp.task('lib:watch', () => {
  gulpWatch(srcScriptFiles, gulp.series('lib:build'))
})

/* --------------------------------- HTML -----------------------------------*/

gulp.task('docs:html:build', () => (
  gulp.src(srcDocHtmlFiles)
    .pipe(gulpStatil(statilConfig))
    .pipe(gulp.dest(outDocRootDir))
))

gulp.task('docs:html:watch', () => {
  gulpWatch(srcDocHtmlFiles, gulp.series('docs:html:build'))
})

/* -------------------------------- Styles ----------------------------------*/

gulp.task('docs:styles:build', () => (
  gulp.src(srcDocStyleMain)
    .pipe(gulpSass())
    .pipe(gulpAutoprefixer())
    .pipe(gulpCleanCss({
      keepSpecialComments: 0,
      aggressiveMerging: false,
      advanced: false,
      compatibility: {properties: {colors: false}},
    }))
    .pipe(gulp.dest(outDocStyleDir))
))

gulp.task('docs:styles:watch', () => {
  gulpWatch(srcDocStyleFiles, gulp.series('docs:styles:build'))
})

/* -------------------------------- Scripts ---------------------------------*/

gulp.task('docs:scripts:build', done => {
  buildWithWebpack(webpackConfig, done)
})

gulp.task('docs:scripts:watch', () => {
  watchWithWebpack(webpackConfig)
})

function buildWithWebpack(config, done) {
  return webpack(config, (err, stats) => {
    if (err) {
      done(GulpErr(err))
    }
    else {
      log('[webpack]', stats.toString(config.stats))
      done(stats.hasErrors() ? GulpErr('webpack error') : null)
    }
  })
}

function watchWithWebpack(config) {
  const compiler = webpack(config)

  const watcher = compiler.watch({}, (err, stats) => {
    log('[webpack]', stats.toString(config.stats))
    if (err) log('[webpack]', err.message)
  })

  return {compiler, watcher}
}

/* --------------------------------- Lint ---------------------------------- */

gulp.task('lint', () => (
  gulp.src([srcScriptFiles, srcDocScriptFiles])
    .pipe(gulpEslint())
    .pipe(gulpEslint.format())
    .pipe(gulpEslint.failAfterError())
))

/* -------------------------------- Server ----------------------------------*/

gulp.task('docs:server', () => {
  const ds = new class extends afr.Devserver {
    onRequest(req, res) {
      req.url = req.url.replace(/^\/espo\//, '').replace(/^[/]*/, '/')
      super.onRequest(req, res)
    }
  }()
  ds.watchFiles(outDocRootDir)
  ds.serveFiles(outDocRootDir)
  ds.listen(6539)
})

/* -------------------------------- Default ---------------------------------*/

gulp.task('buildup', gulp.parallel(
  'lib:build',
  'docs:html:build',
  'docs:styles:build'
))

gulp.task('watch', gulp.parallel(
  'lib:watch',
  'docs:html:watch',
  'docs:styles:watch',
  'docs:scripts:watch',
  'docs:server'
))

gulp.task('build', gulp.series('clear', 'buildup', 'lint', 'docs:scripts:build'))

gulp.task('default', gulp.series('build', 'watch'))