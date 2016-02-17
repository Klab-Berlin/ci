var config = require('./config');
var child_process = require('child_process');
var redis = require('redis').createClient(
	config.redis.port,
	config.redis.host
);
if(config.redis.db) {
	redis.select(config.redis.db);
}

var name = process.argv[2];
var cwd = process.argv[3];
var command = process.argv[4];

var prefix = ['webhook', 'logging', name].join(':');

var args = command.split(' ').filter(function(e) {
	return e !== 'node';
});

var node = child_process.spawn(
	'node',
	args,
	{
		cwd: cwd,
		stdio: ['ignore', 'pipe', 'pipe']
	}
);

var logToRedis = function(data) {
	var key = prefix + ':' + (new Date().getTime());
	data = data.toString().slice(0, -1);
	redis.set(key, data);
	redis.send_command('EXPIRE', [key, 1*60*60]);
	return redis.publish(prefix, data);
};

node.stdout.on('data', logToRedis);
node.stderr.on('data', logToRedis);

process.on('exit', function() {
	node.kill();
});