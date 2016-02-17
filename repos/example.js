module.exports = {
	cwd: '/var/www/myrepository/',
	name: 'myrepository',
	branch: 'mrp_dev',
	secret: 'mygithubwebhooksecret',
	deploy: function(webhook) {
		// Custom deploy functionality
	}
};