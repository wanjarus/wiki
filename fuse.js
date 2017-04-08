'use strict'

/**
 * FUSEBOX
 *
 * Client & Server compiler / bundler / watcher
 */

const _ = require('lodash')
const Promise = require('bluebird')
const colors = require('colors/safe')
const fs = Promise.promisifyAll(require('fs-extra'))
const fsbx = require('fuse-box')
const nodemon = require('nodemon')
const path = require('path')
const uglify = require('uglify-js')

// ======================================================
// Parse cmd arguments
// ======================================================

const args = require('yargs')
  .option('d', {
    alias: 'dev',
    describe: 'Start in Developer mode',
    type: 'boolean'
  })
  .option('c', {
    alias: 'dev-configure',
    describe: 'Start in Configure Developer mode',
    type: 'boolean'
  })
  .help('h')
  .alias('h', 'help')
  .argv

let mode = 'build'
if (args.d) {
  console.info(colors.bgWhite.black(' Starting Fuse in DEVELOPER mode... '))
  mode = 'dev'
} else if (args.c) {
  console.info(colors.bgWhite.black(' Starting Fuse in CONFIGURE DEVELOPER mode... '))
  mode = 'dev-configure'
} else {
  console.info(colors.bgWhite.black(' Starting Fuse in BUILD mode... '))
}

// ======================================================
// Define aliases / shims
// ======================================================

const ALIASES = {
  'brace-ext-modelist': 'brace/ext/modelist.js',
  'simplemde': 'simplemde/dist/simplemde.min.js',
  'socket.io-client': 'socket.io-client/dist/socket.io.min.js',
  'vue': 'vue/dist/vue.min.js'
}
const SHIMS = {
  jquery: {
    source: 'node_modules/jquery/dist/jquery.js',
    exports: '$'
  }
}

// ======================================================
// Global Tasks
// ======================================================

console.info(colors.white('└── ') + colors.green('Running global tasks...'))

let globalTasks = Promise.mapSeries([
  () => {
    return fs.accessAsync('./assets/js/ace').then(() => {
      console.info(colors.white('  └── ') + colors.magenta('ACE modes directory already exists. Task aborted.'))
      return true
    }).catch(err => {
      if (err.code === 'ENOENT') {
        console.info(colors.white('  └── ') + colors.green('Copy + Minify ACE modes to assets...'))
        return fs.ensureDirAsync('./assets/js/ace').then(() => {
          return fs.readdirAsync('./node_modules/brace/mode').then(modeList => {
            return Promise.map(modeList, mdFile => {
              console.info(colors.white('      mode-' + mdFile))
              let result = uglify.minify(path.join('./node_modules/brace/mode', mdFile), { output: { 'max_line_len': 1000000 } })
              return fs.writeFileAsync(path.join('./assets/js/ace', 'mode-' + mdFile), result.code)
            })
          })
        })
      } else {
        throw err
      }
    })
  }
], f => { return f() })

// ======================================================
// Fuse Tasks
// ======================================================

let fuse

globalTasks.then(() => {
  switch (mode) {
    // =============================================
    // DEVELOPER MODE
    // =============================================
    case 'dev':
      // Client

      fuse = fsbx.FuseBox.init({
        homeDir: './client',
        outFile: './assets/js/bundle.min.js',
        alias: ALIASES,
        shim: SHIMS,
        plugins: [
          [ fsbx.SassPlugin({ includePaths: ['../core'] }), fsbx.CSSPlugin() ],
          fsbx.BabelPlugin({ comments: false, presets: ['es2015'] }),
          fsbx.JSONPlugin()
        ],
        debug: false,
        log: true
      })

      fuse.devServer('>index.js', {
        port: 4444,
        httpServer: false,
        hmr: false
      })

      // Server

      _.delay(() => {
        nodemon({
          script: './server.js',
          args: [],
          ignore: ['assets/', 'client/', 'data/', 'repo/', 'tests/'],
          ext: 'js json',
          watch: [
            'controllers',
            'libs',
            'locales',
            'middlewares',
            'models',
            'agent.js',
            'server.js'
          ],
          env: { 'NODE_ENV': 'development' }
        })
      }, 1000)
      break
    // =============================================
    // CONFIGURE - DEVELOPER MODE
    // =============================================
    case 'dev-configure':
      // Client

      fuse = fsbx.FuseBox.init({
        homeDir: './client',
        outFile: './assets/js/configure.min.js',
        alias: ALIASES,
        shim: SHIMS,
        plugins: [
          [ fsbx.SassPlugin({ includePaths: ['../core'] }), fsbx.CSSPlugin() ],
          fsbx.BabelPlugin({ comments: false, presets: ['es2015'] }),
          fsbx.JSONPlugin()
        ],
        debug: false,
        log: true
      })

      fuse.devServer('>configure.js', {
        port: 4444,
        httpServer: false
      })

      // Server

      _.delay(() => {
        nodemon({
          exec: 'node wiki configure',
          ignore: ['assets/', 'client/', 'data/', 'repo/', 'tests/'],
          ext: 'js json',
          watch: [
            'configure.js'
          ],
          env: { 'NODE_ENV': 'development' }
        })
      }, 1000)
      break
    // =============================================
    // BUILD ONLY MODE
    // =============================================
    case 'build':
      fuse = fsbx.FuseBox.init({
        homeDir: './client',
        alias: ALIASES,
        shim: SHIMS,
        plugins: [
          fsbx.EnvPlugin({ NODE_ENV: 'production' }),
          [ fsbx.SassPlugin({ outputStyle: 'compressed', includePaths: ['./node_modules/requarks-core'] }), fsbx.CSSPlugin() ],
          fsbx.BabelPlugin({
            config: {
              comments: false,
              presets: ['es2015']
            }
          }),
          fsbx.JSONPlugin(),
          fsbx.UglifyJSPlugin({
            compress: { unused: false },
            output: { 'max_line_len': 1000000 }
          })
        ],
        debug: false,
        log: true
      })

      fuse.bundle({
        './assets/js/bundle.min.js': '>index.js',
        './assets/js/configure.min.js': '>configure.js'
      }).then(() => {
        console.info(colors.green.bold('\nAssets compilation + bundling completed.'))
      }).catch(err => {
        console.error(colors.red(' X Bundle compilation failed! ' + err.message))
        process.exit(1)
      })
      break
  }
})
