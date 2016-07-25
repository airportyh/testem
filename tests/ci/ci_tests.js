'use strict';

var fs = require('fs');
var App = require('../../lib/app');
var TestReporter = require('../../lib/reporters/tap_reporter');
var Config = require('../../lib/config');
var sinon = require('sinon');
var assert = require('chai').assert;
var expect = require('chai').expect;
var Process = require('did_it_work');
var path = require('path');
var http = require('http');
var childProcess = require('child_process');
var Bluebird = require('bluebird');

var FakeReporter = require('../support/fake_reporter');

var isWin = /^win/.test(process.platform);

describe('ci mode app', function() {
  this.timeout(90000);
  var sandbox;

  beforeEach(function(done) {
    sandbox = sinon.sandbox.create();
    fs.unlink('tests/fixtures/tape/public/bundle.js', function() {
      done();
    });
  });

  afterEach(function() {
    sandbox.restore();
  });

  describe('multiple launchers', function() {
    beforeEach(function(done) {
      fs.unlink('tests/fixtures/tape/public/bundle.js', function() {
        done();
      });
    });

    it('runs them tests on node, nodetap, and browser', function(done) {
      var reporter = new TestReporter(true);
      var dir = path.join('tests/fixtures/tape');
      var config = new Config('ci', {
        file: path.join(dir, 'testem.json'),
        port: 0,
        cwd: dir,
        reporter: reporter,
        launch_in_ci: ['node', 'nodeplain', 'phantomjs']
      });
      config.read(function() {
        var app = new App(config, function(code) {
          expect(code).to.eq(1);

          var helloWorld = reporter.results.filter(function(r) {
            return r.result.name.match(/hello world/);
          });
          var helloBob = reporter.results.filter(function(r) {
            return r.result.name.match(/hello bob/);
          });
          var nodePlain = reporter.results.filter(function(r) {
            return r.launcher === 'NodePlain';
          });
          assert(helloWorld.every(function(r) {
            return r.result.passed;
          }), 'hello world should pass');

          assert(helloBob.every(function(r) {
            return !r.result.passed;
          }), 'hello bob should fail');

          expect(nodePlain[0]).to.exist();
          assert(!nodePlain[0].result.passed, 'node plain should fail');

          var launchers = reporter.results.map(function(r) {
            return r.launcher;
          });

          assert.include(launchers, 'Node');
          assert.include(launchers, 'NodePlain');
          assert(launchers.some(function(n) { return n.match(/^PhantomJS \d/); }), 'Launchers should include some version of PhantomJS');

          var globalLauncher = reporter.results.filter(function(r) {
            return r.launcher === null;
          });
          expect(globalLauncher).to.be.empty();

          expect(reporter.results.length).to.eq(5);
          done();
        });
        app.start();
      });
    });

    it('returns successfully with passed and skipped tests', function(done) {
      var dir = path.join('tests/fixtures/success-skipped');
      var config = new Config('ci', {
        file: path.join(dir, 'testem.json'),
        port: 0,
        cwd: dir,
        launch_in_ci: ['phantomjs'],
        reporter: new TestReporter(true)
      });
      config.read(function() {
        var app = new App(config, function(exitCode) {
          expect(exitCode).to.eq(0);
          done();
        });
        app.start();
      });
    });

    it('returns with non zero exit code when detected a global error', function(done) {
      var dir = path.join('tests/fixtures/global-error');
      var config = new Config('ci', {
        file: path.join(dir, 'testem.json'),
        port: 0,
        cwd: dir,
        launch_in_ci: ['phantomjs'],
        reporter: new TestReporter(true)
      });
      config.read(function() {
        var app = new App(config, function(exitCode) {
          expect(exitCode).to.eq(1);
          done();
        });
        app.start();
      });
    });

    it('returns with non zero exit code when browser exits', function(done) {
      var dir = path.join('tests/fixtures/slow-pass');
      var app;
      var config = new Config('ci', {
        file: path.join(dir, 'testem.json'),
        port: 0,
        cwd: dir,
        launch_in_ci: ['phantomjs'],
        reporter: new TestReporter(true),
        on_start: function(config, data, callback) {
          var launcher = app.launchers()[0];

          launcher.on('processStarted', function(process) {
            setTimeout(function() {
              if (isWin) {
                childProcess.exec('taskkill /pid ' + process.pid + ' /T');
              } else {
                process.kill();
              }
            }, 10000); // TODO Starting PhantomJS on Windows is really slow / find a better way
          });

          callback();
        }
      });
      config.read(function() {
        app = new App(config, function(exitCode) {
          expect(exitCode).to.eq(1);
          done();
        });
        app.start();
      });
    });

    it('returns with non zero exit code when browser disconnects', function(done) {
      var dir = path.join('tests/fixtures/disconnect-test');
      var config = new Config('ci', {
        file: path.join(dir, 'testem.json'),
        port: 0,
        cwd: dir,
        launch_in_ci: ['phantomjs'],
        reporter: new TestReporter(true),
        browser_disconnect_timeout: 0.1
      });
      config.read(function() {
        var app = new App(config, function(exitCode) {
          expect(exitCode).to.eq(1);
          done();
        });
        app.start();
      });
    });
  });

  it('fails with explicitly defined missing launchers', function(done) {
    var config = new Config('ci', {
      file: 'tests/fixtures/basic_test/testem.json',
      port: 0,
      cwd: path.join('tests/fixtures/basic_test/'),
      launch_in_ci: ['opera'],
      reporter: new FakeReporter()
    });
    config.read(function() {
      var app = new App(config, function(exitCode, err) {
        expect(exitCode).to.eq(1);
        expect(err.message).to.eq('Launcher opera not found. Not installed?');
        done();
      });
      app.start();
    });
  });

  it('passes when missing launchers are ignored', function(done) {
    var config = new Config('ci', {
      file: 'tests/fixtures/basic_test/testem.json',
      port: 0,
      cwd: path.join('tests/fixtures/basic_test/'),
      launch_in_ci: ['opera'],
      ignore_missing_launchers: true,
      reporter: new FakeReporter()
    });
    config.read(function() {
      var app = new App(config, function(exitCode) {
        expect(exitCode).to.eq(0);
        done();
      });
      app.start();
    });
  });

  it('allows passing in reporter from config', function(done) {
    var fakeReporter = new FakeReporter();
    var config = new Config('ci', {
      reporter: fakeReporter
    });
    var app = new App(config, function() {
      assert.strictEqual(app.reporter, fakeReporter);
      done();
    });

    sandbox.stub(app, 'triggerRun');

    app.start();
    app.exit();
  });

  it('wrapUp reports error to reporter', function(done) {
    var reporter = new FakeReporter();
    var app = new App(new Config('ci', {
      reporter: reporter
    }), function() {
      assert.equal(reporter.total, 1);
      assert.equal(reporter.pass, 0);
      var result = reporter.results[0].result;
      assert.equal(result.name, 'Error');
      assert.equal(result.error.message, 'blarg');
      done();
    });

    sandbox.stub(app, 'triggerRun');

    app.start();
    app.wrapUp(new Error('blarg'));
  });

  it('does not shadow EADDRINUSE errors', function(done) {
    var server = http.createServer().listen(7357, function(err) {
      if (err) {
        return done(err);
      }
      var reporter = new FakeReporter();
      var config = new Config('ci', {
        cwd: path.join('tests/fixtures/basic_test'),
        launch_in_ci: ['phantomjs'],
        reporter: reporter
      });
      config.read(function() {
        var app = new App(config, function(exitCode, err) {
          expect(exitCode).to.eq(1);
          expect(err).to.match(/EADDRINUSE/);
          expect(reporter.results[0].result.error.message).to.contain('EADDRINUSE');
          server.close(done);
        });
        app.start();
      });
    });
  });

  it('stops the server if an error occurs', function(done) {
    var error = new Error('Error: foo');
    var app = new App(new Config('ci', {
      reporter: new FakeReporter()
    }), function(exitCode, err) {
      expect(exitCode).to.eq(1);
      expect(err).to.eq(error);
      assert(app.stopServer.called, 'stop server should be called');
      done();
    });
    sandbox.spy(app, 'stopServer');

    sandbox.stub(app, 'triggerRun');
    app.start();
    app.wrapUp(error);
  });

  it('kills launchers on wrapUp', function(done) {
    var app = new App(new Config('ci', {
      launch_in_ci: []
    }), function() {
      assert(app.killRunners.called, 'clean up launchers should be called');
      done();
    });

    sandbox.spy(app, 'killRunners');

    sandbox.stub(app, 'triggerRun');
    app.start(function() {
      app.exit();
    });
  });

  // Convert to disposer unit test
  xit('cleans up idling launchers', function(done) {
    var app = new App(new Config('ci'), function(exitCode, err) {
      if (err) {
        return done(err);
      }

      expect(app.runners[0].exit).to.have.been.called();
      done();
    });
    app.runners = [
      {
        stop: function(cb) {
          return Bluebird.resolve().asCallback(cb);
        }
      }
    ];

    sandbox.spy(app.runners[0], 'exit');

    app.exitRunners(function() {
      expect(app.runners[0].exit).to.have.been.called();

      app.exit();
    });
  });

  it('timeout does not wait for idling launchers', function(done) {
    var config = new Config('ci', {
      port: 0,
      cwd: path.join('tests/fixtures/fail_later'),
      timeout: 2,
      launch_in_ci: ['phantomjs'],
      reporter: new TestReporter(true)
    });
    config.read(function() {
      var app = new App(config);
      var start = Date.now();
      sandbox.stub(app, 'cleanExit', function() {
        assert.lengthOf(app.runners, 1, 'There must be one runner');
        assert(Date.now() - start < 30000, 'Timeout does not wait for test to finish if it takes too long');
        done();
      });
      app.start();
    });
  });

  describe('getExitCode', function() {

    it('returns 0 if all passed', function() {
      var app = new App(new Config('ci'));
      var reporter = { total: 1, pass: 1 };
      app.reporter = reporter;
      assert.equal(app.getExitCode(), null);
    });

    it('returns 0 if all skipped', function() {
      var app = new App(new Config('ci'));
      var reporter = { total: 1, skipped: 1 };
      app.reporter = reporter;
      assert.equal(app.getExitCode(), null);
    });

    it('returns 1 if fails', function() {
      var app = new App(new Config('ci'));
      var reporter = { total: 1, pass: 0 };
      app.reporter = reporter;
      assert.match(app.getExitCode(), /Not all tests passed/);
    });

    it('returns 0 if no tests ran', function() {
      var app = new App(new Config('ci'));
      var reporter = { total: 0, pass: 0 };
      app.reporter = reporter;
      assert.equal(app.getExitCode(), null);
    });

    it('returns 1 if no tests and fail_on_zero_tests config is on', function() {
      var app = new App(new Config('ci', {
        fail_on_zero_tests: true
      }));
      var reporter = { total: 0, pass: 0 };
      app.reporter = reporter;
      assert.match(app.getExitCode(), /No tests found\./);
    });

  });

  it('runs two browser instances in parallel with different test pages', function(done) {
    var reporter = new TestReporter(true);
    var config = new Config('ci', {
      file: 'tests/fixtures/multiple_pages/testem.json',
      port: 0,
      cwd: path.join('tests/fixtures/multiple_pages'),
      launch_in_ci: ['phantomjs'],
      reporter: reporter
    });
    config.read(function() {
      var app = new App(config, function(exitCode) {
        assert.lengthOf(app.runners, 2, 'two runners are used');

        var firstLauncher = app.runners[0].launcher;
        var secondLauncher = app.runners[1].launcher;

        assert.equal(firstLauncher.name, 'PhantomJS', 'first launcher is phantomjs');
        assert.equal(secondLauncher.name, 'PhantomJS', 'second launcher is also phantomjs');

        assert.notEqual(firstLauncher.getUrl(), secondLauncher.getUrl(), 'the launchers used different urls');

        assert.equal(exitCode, 0);
        done();
      });
      app.start();
    });
  });

});

describe('runHook', function() {

  var fakeP, sandbox;

  beforeEach(function() {
    sandbox = sinon.sandbox.create();

    fakeP = new Process('');

    sandbox.stub(fakeP, 'complete', function(callback) {
      process.nextTick(function() {
        callback(null);
      });
      return this;
    });
    sandbox.spy(fakeP, 'kill');
    sandbox.spy(fakeP, 'goodIfMatches');
  });

  afterEach(function() {
    sandbox.restore();
  });

  it('runs hook', function(done) {
    var config = new Config('ci', null, {
      on_start: 'launch nuclear-missile'
    });
    var app = new App(config);
    sandbox.stub(app, 'Process').returns(fakeP);
    app.runHook('on_start', function() {
      assert(app.Process.called, 'how come you dont call me?');
      assert.equal(app.Process.lastCall.args, 'launch nuclear-missile');
      done();
    });
  });

  it('runs hook with arguments', function(done) {
    var config = new Config('ci', null, {
      on_start: 'launch <type> nuclear-missile'
    });
    var app = new App(config);
    sandbox.stub(app, 'Process').returns(fakeP);
    app.runHook('on_start', {type: 'soviet'}, function() {
      assert(app.Process.called, 'how come you dont call me?');
      assert.equal(app.Process.lastCall.args, 'launch soviet nuclear-missile');
      done();
    });
  });

  it('runs javascript hook', function(done) {
    var config = new Config('ci', null, {
      port: 777,
      on_start: function(cfg, data, callback) {
        assert.equal(cfg.get('port'), 777);
        assert.equal(data.viva, 'la revolucion');
        callback(new Error('hookError'));
      }
    });
    var app = new App(config);
    app.runHook('on_start', {viva: 'la revolucion'}, function(error) {
      assert.equal(error.message, 'hookError');
      done();
    });
  });

  it('waits for text', function(done) {
    var config = new Config('ci', null, {
      on_start: {
        command: 'launch nuclear-missile',
        wait_for_text: 'launched.'
      }
    });
    var app = new App(config);
    sandbox.stub(app, 'Process').returns(fakeP);
    app.runHook('on_start', function() {
      assert.equal(app.Process.lastCall.args[0], 'launch nuclear-missile');
      assert.equal(fakeP.goodIfMatches.lastCall.args[0], 'launched.');
      done();
    });
  });

  it('substitutes port and host', function(done) {
    var config = new Config('ci', {
      port: 2837,
      host: 'dev.app.com'
    }, {
      on_start: {
        command: 'tunnel <host>:<port> -u <url>'
      }
    });
    var app = new App(config);
    sandbox.stub(app, 'Process').returns(fakeP);
    app.runHook('on_start', function() {
      assert.equal(app.Process.lastCall.args[0],
        'tunnel dev.app.com:2837 -u http://dev.app.com:2837/');
      done();
    });
  });

  it('launches via spawn', function(done) {
    var config = new Config('ci', null, {
      on_start: {
        exe: 'launch',
        args: ['nuclear-missile', '<port>']
      }
    });
    var app = new App(config);
    sandbox.stub(app, 'Process').returns(fakeP);
    app.runHook('on_start', function() {
      assert(app.Process.called, 'call Process');
      assert.deepEqual(app.Process.lastCall.args, ['launch', ['nuclear-missile', '7357']]);
      done();
    });
  });

  it('copies the user environment on exec', function(done) {
    var originalEnv = process.env;
    process.env.TESTEM_USER_CONFIG = 'copied';

    var config = new Config('ci', null, {
      on_start: {
        command: 'node -e "console.log(process.env.TESTEM_USER_CONFIG)"'
      }
    });
    var app = new App(config);
    app.runHook('on_start', function(err, stdout) {
      process.env = originalEnv;
      assert.equal(stdout, 'copied\n');
      done();
    });
  });

  it('copies the user environment on spawn', function(done) {
    var originalEnv = process.env;
    process.env.TESTEM_USER_CONFIG = 'copied';

    var config = new Config('ci', null, {
      on_start: {
        exe: 'node',
        args: ['-e', 'console.log(process.env.TESTEM_USER_CONFIG)']
      }
    });
    var app = new App(config);
    app.runHook('on_start', function(err, stdout) {
      process.env = originalEnv;
      assert.equal(stdout, 'copied\n');
      done();
    });
  });

  it('dies if neither command or exe specified', function() {
    var config = new Config('ci', null, {
      on_start: {}
    });
    var app = new App(config);
    app.runHook('on_start', function(err) {
      expect(err.message).to.eq('No command or exe/args specified for hook on_start');
    });
  });

  it('kills on_start process on exit', function(done) {
    this.timeout(10000);
    var config = new Config('ci', {
      file: 'tests/fixtures/tape/testem.json',
      port: 0,
      cwd: 'tests/fixtures/tape/',
      launch_in_ci: ['node'],
      reporter: new TestReporter(true)
    });
    config.read(function() {
      config.set('on_start', 'launch missile');
      config.set('before_tests', null);
      var app = new App(config, function() {
        assert.deepEqual(app.Process.lastCall.args[0], 'launch missile');
        expect(fakeP.kill).to.have.been.called();
        done();
      });
      sandbox.stub(app, 'Process').returns(fakeP);
      app.start();
    });
  });

});
