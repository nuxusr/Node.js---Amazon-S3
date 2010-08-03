#!/usr/local/bin/node

require.paths.push(__dirname);
//require.paths.push(__dirname + '/deps');
//require.paths.push(__dirname + '/lib');
var testrunner = require('caolan-nodeunit/lib/nodeunit').testrunner;

process.chdir(__dirname);
testrunner.run(['test']);
