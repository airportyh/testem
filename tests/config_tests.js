'use strict';

const Config = require('../lib/config.js');
const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const browserLauncher = require('../lib/browser_launcher');
const path = require('path');
const os = require('os');

const sinon = require('sinon');

describe('Config', function() {
  let config, appMode, progOptions, sandbox;
  beforeEach(function() {
    sandbox = sinon.createSandbox();
    appMode = 'ci';
    progOptions = {
      file: __dirname + '/testem.yml',
      timeout: 2,
      port: undefined,
      reporter: 'tap'
    };
    config = new Config(appMode, progOptions);
  });
  afterEach(function() {
    sandbox.restore();
  });

  it('can create', function() {
    expect(config.progOptions).to.equal(progOptions);
  });

  it('gives progOptions properties when got', function() {
    expect(config.get('file')).to.equal(progOptions.file);
  });

  it('ignores undefined progOptions', function() {
    expect(config.get('port')).not.to.be.undefined();
  });

  it('gives defaultOptions properties when got', function() {
    let defaultOptions = {
      host: '0.0.0.0',
      port: 7337,
      config_dir: process.cwd(),
      test_page: 'http://my/test/page',
      file: 'defaultFile'
    };
    config.setDefaultOptions(defaultOptions);
    expect(config.get('host')).to.equal('0.0.0.0');
    expect(config.get('port')).to.equal(7337);
    expect(config.get('config_dir')).to.equal(process.cwd());
    // returns file from progOptions and not defaultOptions because progOptions has higher priority
    expect(config.get('file')).to.equal(progOptions.file);
  });

  describe('accepts empty config file', function() {
    let config;
    beforeEach(function(done) {
      let progOptions = {framework: 'mocha', src_files: 'impl.js,tests.js', cwd: __dirname + '/empty'};
      config = new Config('dev', progOptions);
      config.read(done);
    });
    it('gets properties from config file', function() {
      expect(config.get('framework')).to.equal('mocha');
      expect(String(config.get('src_files'))).to.equal('impl.js,tests.js');
    });
  });

  describe('read yaml config file', function() {
    beforeEach(function(done) {
      config.read(done);
    });
    it('gets properties from config file', function() {
      expect(config.get('framework')).to.equal('jasmine');
      expect(String(config.get('src_files'))).to.equal('implementation.js,tests.js');
    });
    it('falls back to config file value when progOptions is null', function() {
      expect(config.get('timeout')).to.equal(2);
    });
    it('allows to overwrite a property from the config file', function() {
      expect(config.get('reporter')).to.equal('tap');
    });
  });

  it('calculates url for you', function() {
    let config = new Config();
    assert.equal(config.get('url'), 'http://0.0.0.0:7357/');
  });

  it('allows to overwrite config values', function() {
    let config = new Config('dev', { port: 8000 });
    assert.equal(config.get('port'), 8000);
    config.set('port', 8080);
    assert.equal(config.get('port'), 8080);
  });

  it('returns undefined for undefined keys', function() {
    let config = new Config();
    expect(config.get('undefined')).to.be.undefined();
  });

  describe('read json config file', function() {
    let config;
    beforeEach(function(done) {
      let progOptions = {
        file: __dirname + '/testem.json'
      };
      config = new Config('dev', progOptions);
      config.read(done);
    });
    it('gets properties from config file', function() {
      expect(config.get('framework')).to.equal('mocha');
      expect(String(config.get('src_files'))).to.equal('impl.js,tests.js');
    });
  });

  describe('read js config file', function() {
    let config;
    beforeEach(function(done) {
      let progOptions = {
        file: __dirname + '/testem.js'
      };
      config = new Config('dev', progOptions);
      config.read(done);
    });
    it('gets properties from config file', function() {
      expect(config.get('framework')).to.equal('mocha');
      expect(String(config.get('src_files'))).to.equal('impl.js,tests.js');
    });
  });

  describe('read js config file from custom path', function() {
    let config;
    beforeEach(function(done) {
      let progOptions = {
        config_dir: __dirname + '/custom_configs'
      };
      config = new Config('dev', progOptions);
      config.read(done);
    });
    it('gets properties from config file', function() {
      expect(config.get('framework')).to.equal('mocha');
      expect(String(config.get('src_files'))).to.equal('impl.js,tests.js');
    });
  });

  describe('resolve promise from js config', function() {
    let config;
    beforeEach(function(done) {
      let progOptions = {
        file: __dirname + '/custom_configs/testem-promise.js'
      };
      config = new Config('dev', progOptions);
      config.read(done);
    });
    it('gets properties from config file', function() {
      expect(config.get('framework')).to.equal('qunit');
    });
  });

  describe('getters system', function() {
    it('gives precendence to getters', function(done) {
      let config = new Config('dev', {cwd: 'tests'});
      config.getters.cwd = 'cwdGetter';
      config.cwdGetter = function() { return 'setByGetter'; };
      config.read(function() {
        expect(config.get('cwd')).to.equal('setByGetter');
        done();
      });
    });
  });

  describe('get test_page', function() {
    it('defaults to config test_page', function(done) {
      let config = new Config('dev', {test_page: 'default' });
      config.read(function() {
        expect(config.get('test_page')[0]).to.equal('default');
        done();
      });
    });

    it('adds query params if present', function(done) {
      let config = new Config('dev', {
        test_page: 'http://my-url/path/',
        query_params: {
          library: 'testem',
          language: 'javascript',
          flag: ''
        }
      });
      config.read(function() {
        expect(config.get('test_page')[0]).to.equal('http://my-url/path/?library=testem&language=javascript&flag');
        done();
      });
    });

    it('will merge with existing params, with config params taking precedence', function(done) {
      let config = new Config('dev', {
        test_page: 'http://my-url/path/?language=python&os=mac',
        query_params: {
          library: 'british',
          language: 'english'
        }
      });
      config.read(function() {
        expect(config.get('test_page')[0]).to.equal('http://my-url/path/?language=english&os=mac&library=british');
        done();
      });
    });

    it('handles string query param argument', function(done) {
      let config = new Config('dev', {
        test_page: 'http://my-url/path/?language=python&os=mac',
        query_params: '?language=english&speak&library=british&flag'
      });
      config.read(function() {
        expect(config.get('test_page')[0]).to.equal('http://my-url/path/?language=english&os=mac&speak&library=british&flag');
        done();
      });
    });
  });

  it('give precendence to json config file', function(done) {
    let config = new Config('dev', {cwd: 'tests'});
    config.read(function() {
      expect(config.get('framework')).to.equal('mocha');
      done();
    });
  });

  it('returns whether isCwdMode (read js files from current dir)', function() {
    sandbox.stub(config, 'get').callsFake(function() {
      return null;
    });
    expect(config.isCwdMode()).to.be.ok();
  });

  it('returns whether isCwdMode (read js files from current dir)', function() {
    sandbox.stub(config, 'get').callsFake(function(key) {
      if (key === 'src_files') {
        return ['implementation.js'];
      }
      return null;
    });
    expect(config.isCwdMode()).to.not.be.ok();
  });

  it('returns whether isCwdMode (read js files from current dir)', function() {
    sandbox.stub(config, 'get').callsFake(function(key) {
      if (key === 'test_page') {
        return 'tests.html';
      }
      return null;
    });
    expect(config.isCwdMode()).to.not.be.ok();
  });

  it('has fallbacks for host and port', function() {
    let config = new Config();
    assert.equal(config.get('host'), '0.0.0.0');
    assert.equal(config.get('port'), 7357);
  });

  it('should getLaunchers should call getAvailable browsers', function(done) {
    sandbox.stub(config, 'getWantedLaunchers').callsFake(function(n, cb) {return cb(null, n);});

    sandbox.stub(browserLauncher, 'getAvailableBrowsers').callsFake(function(config, browsers, cb) {
      cb(null, [
        {name: 'Chrome', exe: 'chrome.exe'},
        {name: 'Firefox'}
      ]);
    });

    config.getLaunchers(function(err, launchers) {
      expect(err).to.be.null();
      expect(launchers.chrome.name).to.equal('Chrome');
      expect(launchers.chrome.settings.exe).to.equal('chrome.exe');
      expect(launchers.firefox.name).to.equal('Firefox');
      done();
    });
  });

  it('should customize user_data_dir when provided', function() {
    let config = new Config();
    expect(config.getUserDataDir()).to.eq(os.tmpdir());
    config.set('user_data_dir', 'node_modules/customDirectory');
    expect(config.getUserDataDir()).to.eq(path.resolve(config.cwd(), 'node_modules/customDirectory'));
  });

  it('should install custom launchers', function(done) {
    sandbox.stub(config, 'getWantedLaunchers').callsFake(function(n, cb) {return cb(null, n);});
    config.config = {
      launchers: {
        Node: {
          command: 'node tests.js'
        }
      }
    };

    sandbox.stub(browserLauncher, 'getAvailableBrowsers').callsFake(function(config, browsers, cb) {
      cb(null, []);
    });

    config.getLaunchers(function(err, launchers) {
      expect(err).to.be.null();
      expect(launchers.node.name).to.equal('Node');
      expect(launchers.node.settings.command).to.equal('node tests.js');
      done();
    });
  });

  it('getWantedLaunchers uses getWantedLauncherNames', function(done) {
    sandbox.stub(config, 'getWantedLauncherNames').returns(['Chrome', 'Firefox']);
    config.getWantedLaunchers({
      chrome: { name: 'Chrome' },
      firefox: { name: 'Firefox' }
    }, function(err, results) {
      expect(results).to.deep.equal([{ name: 'Chrome' }, { name: 'Firefox' }]);
      done();
    });
  });

  describe('getWantedLauncherNames', function() {
    it('adds "launch" param', function() {
      config.progOptions.launch = 'Chrome,Firefox';
      expect(config.getWantedLauncherNames()).to.deep.equal(['chrome', 'firefox']);
      config.progOptions.launch = 'IE';
      expect(config.getWantedLauncherNames()).to.deep.equal(['ie']);
    });
    it('adds "launch_in_dev" config', function() {
      config.appMode = 'dev';
      config.config = {launch_in_dev: ['Chrome', 'Firefox']};
      expect(config.getWantedLauncherNames()).to.deep.equal(['Chrome', 'Firefox']);
    });
    it('adds "launch_in_ci" config', function() {
      config.config = {launch_in_ci: ['Chrome', 'Firefox']};
      expect(config.getWantedLauncherNames()).to.deep.equal(['Chrome', 'Firefox']);
    });
    it('removes skip param', function() {
      config.progOptions.launch = 'Chrome,Firefox';
      config.progOptions.skip = 'Chrome';
      expect(config.getWantedLauncherNames()).to.deep.equal(['firefox']);
    });
  });

  function fileEntry(filename, attrs) {
    return { src: filename, attrs: attrs || [] };
  }

  describe('getSrcFiles', function() {

    beforeEach(function() {
      config.set('cwd', 'tests');
    });

    it('by defaults list all .js files', function(done) {
      config.getSrcFiles(function(err, files) {
        expect(files.length).be.above(5); // because this dir should have a bunch of .js files
        done();
      });
    });
    it('gets src files', function(done) {
      config.set('src_files', ['config_tests.js']);
      config.getSrcFiles(function(err, files) {
        expect(files).to.deep.equal([fileEntry('config_tests.js')]);
        done();
      });
    });
    it('does not return duplicates when file matches multiple globs', function(done) {
      config.set('src_files', ['config_tests.js', 'config_tests.js']);
      config.getSrcFiles(function(err, files) {
        expect(files).to.deep.equal([fileEntry('config_tests.js')]);
        done();
      });
    });
    it('excludes using src_files_ignore', function(done) {
      config.set('src_files', ['ci/*']);
      config.set('src_files_ignore', ['**/report*.js']);
      config.getSrcFiles(function(err, files) {
        expect(files).to.deep.equal([
          fileEntry(path.join('ci', 'ci_tests.js')),
          fileEntry(path.join('ci', 'dev_tests.js'))
        ]);
        done();
      });
    });
    it('excludes using src_files', function(done) {
      config.set('src_files', ['ci/*', '!**/report*.js']);
      config.getSrcFiles(function(err, files) {
        expect(files).to.deep.equal([
          fileEntry(path.join('ci', 'ci_tests.js')),
          fileEntry(path.join('ci', 'dev_tests.js'))
        ]);
        done();
      });
    });
    it('can read files from directories with spaces', function(done) {
      config.set('cwd', 'tests/space test/');
      config.set('src_files', 'test.js');
      config.getSrcFiles(function(err, files) {
        expect(files).to.deep.equal([fileEntry('test.js')]);
        done();
      });
    });
    it('can open a file with a space in the filename', function(done) {
      config.set('src_files', 'space test.js');
      config.getSrcFiles(function(err, files) {
        expect(files).to.deep.equal([fileEntry('space test.js')]);
        done();
      });
    });
    it('respects order', function(done) {
      config.set('src_files', [
        'ui/fake_screen.js',
        'ci/ci_tests.js'
      ]);
      config.getSrcFiles(function(err, files) {
        expect(files).to.deep.equal([
          fileEntry(path.join('ui', 'fake_screen.js')),
          fileEntry(path.join('ci', 'ci_tests.js'))
        ]);
        done();
      });
    });
    it('populates attributes', function(done) {
      config.set('src_files', [{src: 'config_tests.js', attrs: ['data-foo="true"', 'data-bar']}]);
      config.getSrcFiles(function(err, files) {
        expect(files).to.deep.equal([
          fileEntry('config_tests.js', ['data-foo="true"', 'data-bar'])
        ]);
        done();
      });
    });
    it('populates attributes for only the desired globs', function(done) {
      config.set('src_files', [
        {src: 'config_tests.js', attrs: ['data-foo="true"', 'data-bar']},
        'ci/*'
      ]);
      config.getSrcFiles(function(err, files) {
        expect(files).to.deep.equal([
          fileEntry('config_tests.js', ['data-foo="true"', 'data-bar']),
          fileEntry(path.join('ci', 'ci_tests.js')),
          fileEntry(path.join('ci', 'dev_tests.js')),
          fileEntry(path.join('ci', 'report_file_tests.js')),
          fileEntry(path.join('ci', 'reporter_tests.js'))
        ]);
        done();
      });
    });
    it('populates attributes for only the desired globs and excludes using src_files_ignore', function(done) {
      config.set('src_files', [
        fileEntry('config_tests.js', ['data-foo="true"', 'data-bar']),
        'ci/*'
      ]);
      config.set('src_files_ignore', '**/report*.js');
      config.getSrcFiles(function(err, files) {
        expect(files).to.deep.equal([
          fileEntry('config_tests.js', ['data-foo="true"', 'data-bar']),
          fileEntry(path.join('ci', 'ci_tests.js')),
          fileEntry(path.join('ci', 'dev_tests.js'))
        ]);
        done();
      });
    });
    it('allows URLs', function(done) {
      config.set('src_files', [
        'file://ci/*', 'http://codeorigin.jquery.com/jquery-2.0.3.min.js'
      ]);
      config.getSrcFiles(function(err, files) {
        expect(files).to.deep.equal([
          fileEntry(path.join('ci', 'ci_tests.js')),
          fileEntry(path.join('ci', 'dev_tests.js')),
          fileEntry(path.join('ci', 'report_file_tests.js')),
          fileEntry(path.join('ci', 'reporter_tests.js')),
          fileEntry('http://codeorigin.jquery.com/jquery-2.0.3.min.js')
        ]);
        done();
      });
    });
    it('expands nested globs correctly', function(done) {
      config.set('src_files', ['fixtures/nested_src_files/**/*.js']);
      config.getSrcFiles(function(err, files) {
        expect(files).to.deep.equal([
          fileEntry(path.join('fixtures', 'nested_src_files', 'with', 'nested', 'file.js'))
        ]);
        done();
      });
    });
  });

  describe('getServeFiles', function() {
    it('just delegates to getFileSet', function(done) {
      let egg = [];
      config.set('src_files', 'integration/*');
      config.set('src_files_ignore', '**/*.sh');
      config.getFileSet = function(want, dontWant, cb) {
        expect(want).to.equal('integration/*');
        expect(dontWant).to.equal('**/*.sh');
        process.nextTick(function() { cb(null, egg); });
      };
      config.getServeFiles(function(err, files) {
        expect(files).to.equal(egg);
        done();
      });
    });
    it('does not return duplicates when file matches multiple globs', function(done) {
      let egg = [ {
        'attrs': [],
        'src': 'testem.yml'
      }];
      config.set('src_files', ['t*.yml', 'testem.yml']);
      config.getServeFiles(function(err, files) {
        expect(files).to.deep.equal(egg);
        done();
      });
    });
  });

  describe('getCSSFiles', function() {
    it('loads css_files correctly', function(done) {
      config.set('cwd', 'tests');
      config.set('src_files', 'fixtures/styles/*.css');
      config.getSrcFiles(function(err, files) {
        expect(files).to.deep.equal([
          fileEntry(path.join('fixtures', 'styles', 'print.css')),
          fileEntry(path.join('fixtures', 'styles', 'screen.css'))
        ]);
        done();
      });
    });

    it('does not return duplicates when file matches multiple globs', function(done) {
      config.set('cwd', 'tests');
      config.set('src_files', ['fixtures/styles/*.css', 'fixtures/styles/*.css']);
      config.getSrcFiles(function(err, files) {
        expect(files).to.deep.equal([
          fileEntry(path.join('fixtures', 'styles', 'print.css')),
          fileEntry(path.join('fixtures', 'styles', 'screen.css'))
        ]);
        done();
      });
    });
  });

  describe('browser_disconnect_timeout', function() {
    it('defaults to 10 seconds', function() {
      expect(config.get('browser_disconnect_timeout')).to.eq(10);
    });
  });

  describe('browser_start_timeout', function() {
    it('defaults to 30 seconds', function() {
      expect(config.get('browser_start_timeout')).to.eq(30);
    });
  });

  describe('socket_heartbeat_timeout', function() {
    it('defaults to 5 seconds when browser_disconnect_timeout is not provided', function() {
      expect(config.get('socket_heartbeat_timeout')).to.eq(5);
    });

    it('defaults to browser_disconnect_timeout when value is not provided', function() {
      config.set('browser_disconnect_timeout', 45);
      expect(config.get('socket_heartbeat_timeout')).to.eq(45);
    });

    it('uses the provided value', function() {
      config.set('socket_heartbeat_timeout', 45);
      config.set('browser_disconnect_timeout', 60);
      expect(config.get('socket_heartbeat_timeout')).to.eq(45);
    });
  });

  describe('client_decycle_depth', function() {
    it('defaults to 5', function() {
      expect(config.get('client_decycle_depth')).to.eq(5);
    });
  });

  describe('client', function() {
    it('returns config options used within the client', function() {
      expect(config.client()).to.have.all.keys(['decycle_depth']);
    });
  });

  describe('debug', function() {
    describe('when unset', function() {
      it('is not defined', function() {
        let config = new Config('dev', {});
        expect(config.get('debug')).not.to.exist();
      });
    });

    describe('when set', function() {
      it('defaults to testem.log', function() {
        let config = new Config('dev', {
          debug: true
        });
        expect(config.get('debug')).to.eq('testem.log');
      });
    });

    describe('when set and file name specified', function() {
      it('uses the provided file name', function() {
        let config = new Config('dev', {
          debug: 'debug.log'
        });
        expect(config.get('debug')).to.eq('debug.log');
      });
    });
  });
});

function mockTopLevelProgOptions() {
  let options = [
    { name: function() { return 'timeout'; } }
  ];
  let commands = [
    { name: function() { return 'ci'; } },
    { name: function() { return 'launchers'; } }
  ];
  let parentOptions = {
    port: 8081,
    options: [
      {name: function() { return 'port'; }},
      {name: function() { return 'launcher'; }}
    ],
    cwd: 'tests'
  };
  let progOptions = {
    timeout: 2,
    parent: parentOptions,
    __proto__: parentOptions,
    options: options,
    commands: commands,
    _events: []
  };
  return progOptions;
}

describe('getTemplateData', function() {
  it('should give templateData', function(done) {
    let fileConfig = {
      src_files: [
        'web/*.js'
      ]
    };
    let progOptions = mockTopLevelProgOptions();
    let config = new Config('dev', progOptions, fileConfig);
    config.getTemplateData(function(err, data) {
      expect(data.serve_files).to.deep.have.members([
        { src: 'web/hello.js', attrs: [] },
        { src: 'web/hello_tst.js', attrs: [] }
      ]);
      expect(data.css_files).to.deep.have.members([
        { src: '', attrs: [] }
      ]);
      done();
    });
  });

});
