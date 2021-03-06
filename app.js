function runNpm(command) {
	console.log('Running `npm ' + command + '`...');
	var child_process = require('child_process');
	var npm = child_process.spawn('npm', [command]);
	npm.stdout.on('data', function(data) {
		process.stdout.write(data);
	});
	npm.stderr.on('data', function(data) {
		process.stderr.write(data);
	});
	npm.on('close', function(code) {
		if (!code) {
			child_process.fork('app.js').disconnect();
		}
	});
}

try {
	require('sugar');
} catch (e) {
	return runNpm('install');
}
if (!Object.select) {
	return runNpm('update');
}

fs = require('fs');
if (!fs.existsSync) {
	var path = require('path');
	fs.existsSync = function(loc) { return path.existsSync(loc) };
}

LoginServer = require('./loginserver.js');

// Synchronously copy config-example.js over to config.js if it doesn't exist
if (!fs.existsSync('./config/config.js')) {
	console.log("config.js doesn't exist - creating one with default settings...");
	var BUF_LENGTH, buff, bytesRead, fdr, fdw, pos;
	BUF_LENGTH = 64 * 1024;
	buff = new Buffer(BUF_LENGTH);
	fdr = fs.openSync('./config/config-example.js', 'r');
	fdw = fs.openSync('./config/config.js', 'w');
	bytesRead = 1;
	pos = 0;
	while (bytesRead > 0) {
		bytesRead = fs.readSync(fdr, buff, 0, BUF_LENGTH, pos);
		fs.writeSync(fdw, buff, 0, bytesRead);
		pos += bytesRead;
	}
	fs.closeSync(fdr);
}

config = require('./config/config.js');

if (config.watchconfig) {
	fs.watchFile('./config/config.js', function(curr, prev) {
		if (curr.mtime <= prev.mtime) return;
		try {
			delete require.cache[require.resolve('./config/config.js')];
			config = require('./config/config.js');
			console.log('Reloaded config/config.js');
		} catch (e) {}
	});
}

if (process.argv[2] && parseInt(process.argv[2])) {
	config.port = parseInt(process.argv[2]);
}
if (process.argv[3]) {
	config.setuid = process.argv[3];
}

var app = require('http').createServer();
try {
	(function() {
		var nodestatic = require('node-static');
		var cssserver = new nodestatic.Server('./config');
		var avatarserver = new nodestatic.Server('./config/avatars');
		var staticserver = new nodestatic.Server('./static');
		app.on('request', function(request, response) {
			request.resume();
			request.addListener('end', function() {
				if (config.customhttpresponse &&
						config.customhttpresponse(request, response)) {
					return;
				}
				var server;
				if (request.url === '/custom.css') {
					server = cssserver;
				} else if (request.url.substr(0, 9) === '/avatars/') {
					request.url = request.url.substr(8);
					server = avatarserver;
				} else {
					if (/^\/(teambuilder|ladder|lobby|battle)\/?$/.test(request.url) ||
							/^\/(lobby|battle)-([A-Za-z0-9-]*)$/.test(request.url)) {
						request.url = '/';
					}
					server = staticserver;
				}
				server.serve(request, response, function(e, res) {
					if (e && (e.status === 404)) {
						staticserver.serveFile('404.html', 404, {}, request, response);
					}
				});
			});
		});
	})();
} catch (e) {
	console.log('Could not start node-static - try `npm install` if you want to use it');
}
var server = require('sockjs').createServer({
	sockjs_url: "http://cdn.sockjs.org/sockjs-0.3.min.js",
	log: function(severity, message) {
		if (severity === 'error') console.log('ERROR: '+message);
	},
	prefix: '/showdown'
});

// Make `app` and `server` available to the console.
App = app;
Server = server;

/**
 * Converts anything to an ID. An ID must have only lowercase alphanumeric
 * characters.
 * If a string is passed, it will be converted to lowercase and
 * non-alphanumeric characters will be stripped.
 * If an object with an ID is passed, its ID will be returned.
 * Otherwise, an empty string will be returned.
 */
toId = function(text) {
	if (text && text.id) text = text.id;
	else if (text && text.userid) text = text.userid;

	return string(text).toLowerCase().replace(/[^a-z0-9]+/g, '');
};
toUserid = toId;

/**
 * Validates a username or Pokemon nickname
 */
var bannedNameStartChars = {'~':1, '&':1, '@':1, '%':1, '+':1, '-':1, '!':1, '?':1, '#':1};
toName = function(name) {
	name = string(name).trim();
	name = name.replace(/(\||\n|\[|\]|\,)/g, '');
	while (bannedNameStartChars[name.substr(0,1)]) {
		name = name.substr(1);
	}
	if (name.length > 18) name = name.substr(0,18);
	return name;
};

/**
 * Escapes a string for HTML
 * If strEscape is true, escapes it for JavaScript, too
 */
sanitize = function(str, strEscape) {
	str = (''+(str||''));
	str = str.escapeHTML();
	if (strEscape) str = str.replace(/'/g, '\\\'');
	return str;
};

/**
 * Safely ensures the passed variable is a string
 * Simply doing ''+str can crash if str.toString crashes or isn't a function
 * If we're expecting a string and being given anything that isn't a string
 * or a number, it's safe to assume it's an error, and return ''
 */
string = function(str) {
	if (typeof str === 'string' || typeof str === 'number') return ''+str;
	return '';
}

/**
 * Converts any variable to an integer (numbers get floored, non-numbers
 * become 0). Then clamps it between min and (optionally) max.
 */
clampIntRange = function(num, min, max) {
	if (typeof num !== 'number') num = 0;
	num = Math.floor(num);
	if (num < min) num = min;
	if (typeof max !== 'undefined' && num > max) num = max;
	return num;
};

try {
	if (config.setuid) {
		process.setuid(config.setuid);
		console.log("setuid succeeded, we are now running as "+config.setuid);
	}
}
catch (err) {
	console.log("ERROR: setuid failed: [%s] Call: [%s]", err.message, err.syscall);
	process.exit(1);
}

Data = {};

Users = require('./users.js');

Rooms = require('./rooms.js');

delete process.send; // in case we're a child process
Verifier = require('./verifier.js');

parseCommand = require('./chat-commands.js').parseCommand;

Simulator = require('./simulator.js');

lockdown = false;

mutedIps = {};
bannedIps = {};
nameLockedIps = {};

function resolveUser(you, socket) {
	if (!you) {
		emit(socket, 'connectionError', 'There has been a connection error. Please refresh the page.');
		return false;
	}
	return you.user;
}

emit = function(socket, type, data) {
	if (typeof data === 'object') data.type = type;
	else data = {type: type, message: data};
	socket.write(JSON.stringify(data));
};

sendData = function(socket, data) {
	socket.write(data);
};

if (config.crashguard) {
	// graceful crash - allow current battles to finish before restarting
	process.on('uncaughtException', function (err) {
		if (require('./crashlogger.js')(err, 'The main process')) {
			return;
		}
		var stack = (""+err.stack).split("\n").slice(0,2).join("<br />");
		Rooms.lobby.addRaw('<div class="message-server-crash"><b>THE SERVER HAS CRASHED:</b> '+stack+'<br />Please restart the server.</div>');
		Rooms.lobby.addRaw('<div class="message-server-crash">You will not be able to talk in the lobby or start new battles until the server restarts.</div>');
		config.modchat = 'crash';
		lockdown = true;
	});
}

// event functions
var events = {
	join: function(data, socket, you) {
		if (!data || typeof data.room !== 'string') return;
		if (!you) {
			you = Users.connectUser(socket, data.room);
			return you;
		} else {
			var youUser = resolveUser(you, socket);
			if (!youUser) return;
			youUser.joinRoom(data.room, socket);
		}
	},
	chat: function(message, socket, you) {
		if (!message || typeof message.room !== 'string' || typeof message.message !== 'string') return;
		var youUser = resolveUser(you, socket);
		if (!youUser) return;
		var room = Rooms.get(message.room, 'lobby');
		message.message.split('\n').forEach(function(text){
			youUser.chat(text, room, socket);
		});
	},
	leave: function(data, socket, you) {
		if (!data || typeof data.room !== 'string') return;
		var youUser = resolveUser(you, socket);
		if (!youUser) return;
		youUser.leaveRoom(Rooms.get(data.room, 'lobby'), socket);
	}
};

var socketCounter = 0;
server.on('connection', function (socket) {
	if (!socket) { // WTF
		return;
	}
	socket.id = (++socketCounter);

	if (config.proxyip && (config.proxyip === true || config.proxyip.indexOf(socket.remoteAddress) >= 0)) socket.remoteAddress = (socket.headers["x-forwarded-for"]||"").split(",").shift() || socket.remoteAddress; // for proxies

	if (bannedIps[socket.remoteAddress]) {
		console.log('CONNECT BLOCKED - IP BANNED: '+socket.remoteAddress);
		return;
	}
	console.log('CONNECT: '+socket.remoteAddress+' ['+socket.id+']');
	var interval;
	if (config.herokuhack) {
		// see https://github.com/sockjs/sockjs-node/issues/57#issuecomment-5242187
		interval = setInterval(function() {
			try {
				socket._session.recv.didClose();
			} catch (e) {}
		}, 15000);
	}

	var you;

	socket.on('data', function(message) {
		var data = null;
		if (message.substr(0,1) === '{') {
			try {
				data = JSON.parse(message);
			} catch (e) {}
		} else {
			var pipeIndex = message.indexOf('|');
			if (pipeIndex >= 0) data = {
				type: 'chat',
				room: message.substr(0, pipeIndex),
				message: message.substr(pipeIndex+1)
			};
		}
		if (!data) return;
		if (events[data.type]) you = events[data.type](data, socket, you) || you;
	});

	socket.on('close', function() {
		if (interval) {
			clearInterval(interval);
		}
		var youUser = resolveUser(you, socket);
		if (!youUser) return;
		youUser.disconnect(socket);
	});

	you = Users.connectUser(socket);
});
server.installHandlers(app, {});
app.listen(config.port);

console.log('Server started on port ' + config.port);

console.log('Test your server at http://localhost:' + config.port);

// This slow operation is done *after* we start listening for connections
// to the server. Anybody who connects while this require() is running will
// have to wait a couple seconds before they are able to join the server, but
// at least they probably won't receive a connection error message.
Tools = require('./tools.js');

// After loading tools, generate and cache the format list.
Rooms.global.formatListText = Rooms.global.getFormatListText();
