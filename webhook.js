var crypto = require('crypto');
var q = require('q');

var helpers = require('./helpers');

var Webhook = function(config) {
	this.config = config;
	this.repos = {};
};

Webhook.prototype.getConfig = function() {
	return this.config;
}

Webhook.prototype.init = function() {
	var _this = this;

	// Load Repos
	this.getConfig().repos.forEach(function(name) {
		try {
			var repo = require('./repos/' + name);
			this.repos[repo.name] = repo;
			console.log('-- Added repo', name);
		} catch(e) {
			console.log('-- Did not found repo', name, 'skipping.');
		}
	}, this);

	// Get all repos current commit
	return q.all(Object.keys(this.repos).map(function(name) {
		var repo = _this.repos[name];
		return helpers.promisify(repo.cwd, 'git rev-parse HEAD')
			.then(function(c) {
				repo.commit = c;
				return _this.start(repo.name);
			})
	}));
};

Webhook.prototype.start = function(name) {
	var repo = this.repos[name];
	if(!repo) {
		return;
	}

	if(repo.command) {
		repo.process = helpers.spawn(
			process.cwd(),
			'node',
			['run.js', repo.name, repo.cwd, repo.command],
			function(err, out, eout) {
				console.log(err, out, eout);
			}
		);
	}
};

Webhook.prototype.restart = function(name) {
	var repo = this.repos[name];
	if(!repo) {
		return;
	}

	if(repo.process) {
		repo.process.kill();
	}

	this.start(repo);
};

Webhook.prototype.check = function(key, body, secret) {
	var gen = crypto.createHmac('sha1', secret);
	gen.update(body);
	var hash = 'sha1=' + gen.digest('hex');

	console.log('# Checking request', hash, key);
	if(hash !== key) {
		throw(new Error('Failed to authenticate request'));
	}
};

Webhook.prototype.check_branch = function(ref, branch) {
	console.log('# Checking ref', ref);
	if(ref.indexOf(branch) === -1) {
		return false;
	}

	return true;
};

Webhook.prototype.rollback = function(cwd) {
	console.log('# Rollback to', commit);
	return helpers.promisify(cwd, 'git checkout' + commit)
		.then(function() {
			if(npm) {
				console.log('# Run npm i');
				return helpers.promisify(cwd, 'npm i');
			}
		});
};

Webhook.prototype.deploy = function(name) {
	var repo = this.getRepository(name);
	if(!repo) {
		return;
	} else if(typeof repo.deploy === 'function') {
		repo.deploy(this);
	}

	this.restart(name);
};

Webhook.prototype.checkout = function(commit, name) {
	var repo = this.repos[name];
	if(!repo) {
		return;
	}

	console.log('# Checkout commit', commit.id);
	return helpers.promisify(repo.cwd, 'git fetch && git checkout ' + commit.id)
		.then(function() {
			var npm = [].concat(commit.added, commit.removed, commit.modified).filter(function(f){
				return f.indexOf('package.json') !== -1;
			}).length > 0;
			if(npm) {
				console.log('# Run npm i');
				return helpers.promisify(repo.cwd, 'npm i')
					.then(function() {
						return true;
					})
			} else {
				return false;
			}
		})
		.then(function(installed) {
			// run postInstall and/or return if npm installed ran
			if(typeof repo.postInstall === 'function') {
				console.log('# Run postInstall');
				return q(repo.postInstall(this))
					.then(function() {
						return installed;
					});
			}

			return installed;
		});
};

Webhook.prototype.getRepository = function(name) {
	if(name in this.repos) {
		return this.repos[name];
	}

	return null;
};

Webhook.prototype.test = function(cwd) {
	console.log('# Run Tests');
	return helpers.promisify(cwd, 'npm test');
};

Webhook.prototype.handler = function(req, res) {
	console.log('\n# Handling Request at ' + (new Date()));
	var _this = this;
	var npm = false;
	var headers = req.headers;
	var repo;
	var data = '';

	var sendError = function(error) {
		console.log('# Send Error', error.toString());
		res.writeHead(500);
		res.end(JSON.stringify({
			error: error.toString()
		}));
	};

	var sendResponse = function(result) {
		console.log('# Send Response', result);
		res.writeHead(200);
		res.end(JSON.stringify(result));
	};

	req.on('data', function(chunk) {
		data += chunk.toString();
	});

	req.on('end', function() {
		try {
			// Parse request content
			var body = JSON.parse(data);

			// Get the repository for CI/CD
			repo = _this.getRepository(body.repository.name);

			// Return if no repo found
			if(!repo) {
				return sendResponse('wrong repo.');
			}

			// Check request
			_this.check(headers['x-hub-signature'], data, repo.secret);

			if(_this.check_branch(body.ref, repo.branch)) {
				// Checkout new branch
				return _this.checkout(body.head_commit, repo)
					.then(function(installed) {
						// save if npm i has been run
						npm = installed;

						// Execute Tests
						return _this.test(repo.cwd);
					})
					.then(function() {
						// Deploy Version
						return _this.deploy(repo.name);
					})
					.then(function() {
						// Send Answer
						sendResponse('Deployed successfuly');
					})
					.then(function() {
						// Sett successful commit as current commit
						repo.commit = body.head_commit.id
					})
					.catch(function(e) {
						sendError(e);
						_this.rollback(repo.cwd);
					});
			} else {
				// Answer - wrong branch
				return sendResponse('wrong branch');
			}

		} catch(e) {
			if(repo) {
				_this.rollback(repo.cwd);
			}

			sendError(e);
		}
	});
};

module.exports = Webhook;