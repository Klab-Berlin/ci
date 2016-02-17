var https = require('http');

var Webhook = require('./webhook');
var config = require('./config');

var webhook = new Webhook(config);
webhook.init()
	.then(function() {
		https.createServer(webhook.handler.bind(webhook))
			.listen(8445, '0.0.0.0', function() {
				console.log('listening on 8445');
			});
	})
	.catch(function(e) {
		console.error('Startup failed', e);
		console.error(e.stack);
		process.exit(1);
	});