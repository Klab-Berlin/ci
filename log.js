var config = require('./config');
var redis = require('redis').createClient(
	config.redis.port,
	config.redis.host
);
if(config.redis.db) {
	redis.select(config.redis.db);
}

var name = process.argv[2];

var prefix = ['webhook', 'logging', name].join(':');

var logExisting = function(cursor) {
	redis.scan(
		cursor,
		'MATCH', prefix + '*',
		'COUNT', 10,
		function(error, result) {
			if( error ) {
				console.error(error);
				return;
			}

			var next = result[0];
			var keys = result[1];

			keys.forEach(function(key) {
				redis.get(
					key,
					function(error, message) {
						if(!error) {
							console.log(message);
						}
					}
				);
			});

			if(next !== '0') {
				logExisting(next);
			} else {
				subscribe();
			}
		}
	);
};
logExisting('0');


var subscribe = function() {
	redis.on('message', function(channel, message) {
		console.log(message);
	});
	redis.subscribe(prefix);
};