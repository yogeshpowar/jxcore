// Copyright & License details are available under JXCORE_LICENSE file


var common = require('../common.js');
var assert = require('assert');
var zlib = require('zlib');

var closed = false;

zlib.gzip('hello', function(err, out) {
  var unzip = zlib.createGunzip();
  unzip.close(function() {
    closed = true;
  });
  assert.throws(function() {
    unzip.write(out);
  });
});

process.on('exit', function() {
  assert(closed);
});
