var child_process = require('child_process');
var q = require('q');

var run = function(cwd, command, callback) {
	console.log('# Running [at '+ cwd +']', command);
	if(!callback) {
		callback = function() {};
	}

	return child_process.exec(command, {cwd: cwd}, callback);
};

var spawn = function(cwd, command, args, callback) {
	console.log('# Spawning [at '+ cwd +']', command, args);
	if(!callback) {
		callback = function() {};
	}

	return child_process.spawn(command, args, {cwd: cwd}, callback);
};

var promisify = function(cwd, command) {
	var a = q.defer();
 	run(cwd, command, function(error, out, err) {
 		if(error) {
 			a.reject(error);
 		} else {
 			a.resolve(out);
 		}
 	});
	return a.promise;
};

module.exports = {
	promisify: promisify,
	run: run,
	spawn: spawn
};