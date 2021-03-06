// Copyright & License details are available under JXCORE_LICENSE file


var assert = require('assert');

/*
 * The goal of this test is to make sure that:
 *
 * - Even if --abort-on-uncaught-exception is passed on the command line,
 * setting up a top-level domain error handler and throwing an error
 * within this domain does *not* make the process abort. The process exits
 * gracefully.
 *
 * - When passing --abort-on-uncaught-exception on the command line and
 * setting up a top-level domain error handler, an error thrown
 * within this domain's error handler *does* make the process abort.
 *
 * - When *not* passing --abort-on-uncaught-exception on the command line and
 * setting up a top-level domain error handler, an error thrown within this
 * domain's error handler does *not* make the process abort, but makes it exit
 * with the proper failure exit code.
 *
 * - When throwing an error within the top-level domain's error handler
 * within a try/catch block, the process should exit gracefully, whether or
 * not --abort-on-uncaught-exception is passed on the command line.
 */

var domainErrHandlerExMessage = 'exception from domain error handler';

if (process.argv[2] === 'child') {
  var domain = require('domain');
  var d = domain.create();
  var triggeredProcessUncaughtException = false;

  process.on('uncaughtException', function onUncaughtException() {
    // The process' uncaughtException event must not be emitted when
    // an error handler is setup on the top-level domain.
    // Exiting with exit code of 42 here so that it would assert when
    // the parent checks the child exit code.
    process.exit(42);
  });

  d.on('error', function() {
    // Swallowing the error on purpose if 'throwInDomainErrHandler' is not
    // set
    if (process.argv.indexOf('throwInDomainErrHandler') !== -1) {
      if (process.argv.indexOf('useTryCatch') !== -1) {
        try {
          throw new Error(domainErrHandlerExMessage);
        } catch (e) {
        }
      } else {
        throw new Error(domainErrHandlerExMessage);
      }
    }
  });

  d.run(function doStuff() {
    // Throwing from within different types of callbacks as each of them
    // handles domains differently
    process.nextTick(function () {
      throw new Error("Error from nextTick callback");
    });

    var fs = require('fs');
    fs.exists('/non/existing/file', function onExists(exists) {
      throw new Error("Error from fs.exists callback");
    });

    setImmediate(function onSetImmediate() {
      throw new Error("Error from setImmediate callback");
    });

    throw new Error("Error from domain.run callback");
  });
} else {
  var exec = require('child_process').exec;

  function testDomainExceptionHandling(cmdLineOption, options) {
    if (typeof cmdLineOption === 'object') {
      options = cmdLineOption;
      cmdLineOption = undefined;
    }

    var throwInDomainErrHandlerOpt;
    if (options.throwInDomainErrHandler)
      throwInDomainErrHandlerOpt = 'throwInDomainErrHandler';

    var cmdToExec = '';
    if (process.platform !== 'win32') {
      // Do not create core files, as it can take a lot of disk space on
      // continuous testing and developers' machines
      cmdToExec += 'ulimit -c 0 && ';
    }

    var useTryCatchOpt;
    if (options.useTryCatch)
      useTryCatchOpt = 'useTryCatch';

    cmdToExec +=  process.argv[0] + ' ';
    cmdToExec += (cmdLineOption ? cmdLineOption : '') + ' ';
    cmdToExec += process.argv[1] + ' ';
    cmdToExec += ['child', throwInDomainErrHandlerOpt, useTryCatchOpt].join(' ');

    var child = exec(cmdToExec);

    if (child) {
      var childTriggeredOnUncaughtExceptionHandler = false;
      child.on('message', function onChildMsg(msg) {
        if (msg === 'triggeredProcessUncaughtEx') {
          childTriggeredOnUncaughtExceptionHandler = true;
        }
      });

      child.on('exit', function onChildExited(exitCode, signal) {
        // If the top-level domain's error handler does not throw,
        // the process must exit gracefully, whether or not
        // --abort-on-uncaught-exception was passed on the command line
        var expectedExitCode = 0;
        // On some platforms with KSH being the default shell (like SmartOS),
        // when a process aborts, KSH exits with an exit code that is greater
        // than 256, and thus the exit code emitted with the 'exit' event is
        // null and the signal is set to SIGABRT. For these platforms only,
        // and when the test is expected to abort, check the actual signal
        // with the expected signal instead of the exit code.
        var expectedSignal;

        // When throwing errors from the top-level domain error handler
        // outside of a try/catch block, the process should not exit gracefully
        if (!options.useTryCatch && options.throwInDomainErrHandler) {
          expectedExitCode = 7;
          if (cmdLineOption === '--abort-on-uncaught-exception') {
            // If the top-level domain's error handler throws, and only if
            // --abort-on-uncaught-exception is passed on the command line,
            // the process must abort.
            expectedExitCode = 134;

            // On linux, v8 raises SIGTRAP when aborting because
            // the "debug break" flag is on by default
            if (process.platform === 'linux')
              expectedExitCode = 133;

            if (process.platform === 'sunos') {
              expectedExitCode = null;
              expectedSignal = 'SIGABRT';
            }

            // On Windows, v8's OS::Abort also triggers a debug breakpoint
            // which makes the process exit with code -2147483645
            if (process.platform === 'win32') {
              expectedExitCode = -2147483645;
            }
          }
        }

        if (expectedSignal)
          assert.equal(signal, expectedSignal)

        assert.equal(exitCode, expectedExitCode);
      });
    }
  }

  testDomainExceptionHandling('--abort-on-uncaught-exception', {
                              throwInDomainErrHandler: false,
                              useTryCatch: false
                            });

  testDomainExceptionHandling('--abort-on-uncaught-exception', {
                              throwInDomainErrHandler: false,
                              useTryCatch: true
                            });

  testDomainExceptionHandling('--abort-on-uncaught-exception', {
                              throwInDomainErrHandler: true,
                              useTryCatch: false
                            });

  testDomainExceptionHandling('--abort-on-uncaught-exception', {
                              throwInDomainErrHandler: true,
                              useTryCatch: true
                            });

  testDomainExceptionHandling({
    throwInDomainErrHandler: false
  });

  testDomainExceptionHandling({
    throwInDomainErrHandler: false,
    useTryCatch: false
  });

  testDomainExceptionHandling({
    throwInDomainErrHandler: true,
    useTryCatch: true
  });
}
