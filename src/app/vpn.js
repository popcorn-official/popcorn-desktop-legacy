(function(App) {
	'use strict';

	var request = require('request'),
		Q = require('q'),
		tar = require('tar'),
		temp = require('temp'),
		zlib = require('zlib'),
		mv = require('mv'),
		fs = require('fs'),
		path = require('path');

	temp.track();

	function VPN() {
		if (!(this instanceof VPN)) {
			return new VPN();
		}
		this.running = false;
		this.ip = false;
	}

	VPN.prototype.isInstalled = function() {
		// just to make sure we have a config value
		var installed = AdvSettings.get('vpn');
		if (installed) {
			return true;
		} else {
			return false;
		}
	};

	VPN.prototype.isRunning = function() {
		var defer = Q.defer();
		var self = this;

		if (this.isInstalled()) {
			if (process.platform === 'win32') {
				var task = require('ms-task');
				task.pidOf( 'openvpnserv.exe', function(err, data){
					if (data.length > 0 && err == null) {
						// set our current ip
						self.getIp();

						self.running = true;
						defer.resolve(true);
					} else {
						self.running = false;
						defer.resolve(false);
					}
				});
			} else {

				getPid()
					.then(function(pid) {
						self.getIp();
						if (pid) {
							self.running = true;
							defer.resolve(true);
						} else {
							self.running = false;
							defer.resolve(false);
						}
					});

			}
		}

		return defer.promise;
	};

	VPN.prototype.getIp = function (callback) {
		var defer = Q.defer();
		var self = this;

		request('http://curlmyip.com/', function (error, response, body) {
		  	if (!error && response.statusCode === 200) {
		    	self.ip = body.trim();
				defer.resolve(self.ip);
			} else {
				defer.reject(error);
			}
		});

		return defer.promise;
	};

	VPN.prototype.install = function() {
		var self = this;

			if (process.platform === 'darwin') {

				return this.installRunAs()
					.then(self.installMac)
					.then(self.downloadConfig)
					.then(function() {
						// we told pt we have vpn enabled..
						AdvSettings.set('vpn', true);
					});

			} else if (process.platform === 'linux') {

				return this.installRunAs()
					.then(self.installLinux)
					.then(self.downloadConfig)
					.then(function() {
						// ok we are almost done !

						// we told pt we have vpn enabled..
						AdvSettings.set('vpn', true);
					});

			} else if (process.platform === 'win32') {

				return this.installRunAs()
					.then(self.downloadConfig)
					.then(self.installWin)
					.then(function() {
						// ok we are almost done !

						// we told pt we have vpn enabled..
						AdvSettings.set('vpn', true);
					});
			}

			//

	};

	VPN.prototype.installRunAs = function() {

		// we get our arch & platform
		var arch = process.arch === 'ia32' ? 'x86' : process.arch;
		var platform = process.platform === 'darwin' ? 'mac' : process.platform;
		var self = this;

		// force x86 as we only have nw 32bit
		// for mac & windows
		if (platform === 'mac' || platform === 'win32')
			arch = 'x86';

		var tarball = 'https://github.com/VPNht/node-builder/releases/download/runas/runas-' + platform + '-' + arch + '.tar.gz';

		return downloadTarballAndExtract(tarball)
			.then(function(temp) {
				// we install the runas module
				console.log('runas imported');
				return copyToLocation(
					path.resolve(process.cwd(), 'node_modules', 'runas'),
					temp
				);
			});
	}

	VPN.prototype.downloadConfig = function() {
		// make sure path exist
		try {
			if (!fs.existsSync(path.resolve(process.cwd(), 'openvpn'))) {
				fs.mkdirSync(path.resolve(process.cwd(), 'openvpn'));
			}
		} catch(e) {
			console.log(e);
		}

		var configFile = 'https://raw.githubusercontent.com/VPNht/node-builder/master/openvpn.conf';
		return downloadFileToLocation(configFile, 'config.ovpn')
			.then(function(temp) {
				console.log('Config temp ', temp);
				return copyToLocation(
					path.resolve(process.cwd(), 'openvpn', 'openvpn.conf'),
					temp
				);
			});
	}

	VPN.prototype.installMac = function() {

		var tarball = 'https://github.com/VPNht/node-builder/releases/download/openvpn/openvpn-mac.tar.gz';

		return downloadTarballAndExtract(tarball)
			.then(function(temp) {
				// we install openvpn
				return copyToLocation(
					path.resolve(process.cwd(), 'openvpn'),
					temp
				);
			});

	}

	VPN.prototype.installWin = function() {

		var arch = process.arch === 'ia32' ? 'x86' : process.arch;
		var installFile = 'https://github.com/VPNht/node-builder/releases/download/openvpn/openvpn-windows-' + arch + '.exe';
		return downloadFileToLocation(installFile , 'setup.exe')
			.then(function(temp) {

				console.log(temp);

				// we launch the setup with admin privilege silently
				// and we install openvpn in openvpn/
				try {
					var runas = require('runas');
					var pathToInstall = path.resolve(process.cwd(), 'openvpn');
					return runas(temp, ['/S', 'SELECT_SERVICE=1', '/SELECT_SHORTCUTS=0', '/SELECT_OPENVPNGUI=0', '/D=' + pathToInstall], {
						admin: true
					});
				} catch(e) {
					console.log(e);
					return false;
				}

			});
	}

	VPN.prototype.installLinux = function() {
		// we get our arch & platform
		var arch = process.arch === 'ia32' ? 'x86' : process.arch;
		var tarball = 'https://github.com/VPNht/node-builder/releases/download/openvpn/openvpn-linux-' + arch + '.tar.gz';

		return downloadTarballAndExtract(tarball)
			.then(function(temp) {
				// we install openvpn
				return copyToLocation(
					path.resolve(process.cwd(), 'openvpn'),
					temp
				);
			});
	}

	VPN.prototype.disconnect = function() {
		var defer = Q.defer();
		var self = this;

		// need to run first..
		if (!this.running) {
			defer.resolve();
		}

		if (process.platform === 'win32') {

			// if something is wrong with runas we catch it
			try {
				var runas = require('runas');
			} catch(e) {
				defer.reject(e);
			}

			var root = process.cwd().split(path.sep)[0];
			if (root.length === 0) {
				root = 'C:';
			}
			root = path.join(root, 'Windows', 'System32', 'net.exe');
			console.log(root);

			// we need to stop the service
			if (runas(root, ['stop','OpenVPNService'], {
					admin: true
				}) != 0) {
				console.log('something wrong');
				defer.reject('unable_to_stop');
			} else {
				self.getIp();
				self.running = false;
				console.log('openvpn stoped');
				defer.resolve();

			}

			defer.resolve();
		} else {
			getPid()
				.then(function(pid) {

					if (pid) {

						// if something is wrong with runas we catch it
						try {
							var runas = require('runas');
						} catch(e) {
							defer.reject(e);
						}

						if (runas('kill', ['-9', pid], {
								admin: true
							}) != 0) {
								console.log('something wrong');
						} else {
							// we'll delete our pid file
							try {
								fs.unlinkSync(path.join(process.cwd(), 'openvpn', 'vpnht.pid'));
							} catch(e) {
								console.log(e);
							}

							self.getIp();
							self.running = false;
							console.log('openvpn stoped');
						};

						defer.resolve();

					} else {
						console.log('no pid found');
						self.running = false;
						defer.reject('no_pid_found');
					}
				});
		}

		return defer.promise;
	}

	VPN.prototype.connect = function() {
		var defer = Q.defer();
		var self = this;
		// we are writing a temp auth file
		fs = require('fs');
		var tempPath = temp.mkdirSync('popcorntime-vpnht');
		tempPath = path.join(tempPath, 'o1');
		fs.writeFile(tempPath, Settings.vpnUsername + '\n' + Settings.vpnPassword, function(err) {
			if (err) {

				defer.reject(err);

			} else {

				// ok we have our auth file
				// now we need to make sure we have our openvpn.conf
				var vpnConfig = path.resolve(process.cwd(), 'openvpn', 'openvpn.conf');
				if (fs.existsSync(vpnConfig)) {

					try {

						// runas should be installed so we can require it
						var runas = require('runas');
						var openvpn = path.resolve(process.cwd(), 'openvpn', 'openvpn');

						var args = ['--daemon', '--writepid', path.join(process.cwd(), 'openvpn', 'vpnht.pid'), '--config', vpnConfig, '--auth-user-pass', tempPath];

						var password = false;

						if (process.platform === 'linux') {
							// if linux we run with sudo and prompt a password
							args = ['--daemon', '--writepid', path.join(process.cwd(), 'openvpn', 'vpnht.pid'), '--dev', 'tun0', '--config', vpnConfig, '--auth-user-pass', tempPath];
							openvpn = 'sudo ' + path.resolve(process.cwd(), 'openvpn', 'openvpn');
							password = prompt("ATTENTION! We need admin acccess to start VPN.\nYour password is not saved\n\nEnter sudo password : ", "");
						}

						// execption for windows openvpn path
						if (process.platform === 'win32') {

							// we copy our openvpn.conf for the windows service
							var newConfig = path.resolve(process.cwd(), 'openvpn', 'config', 'openvpn.ovpn');
							console.log(newConfig);

							copy(vpnConfig, newConfig, function(err) {

								if (err) {
									console.log(err);
								}

								fs.appendFile(newConfig, '\r\nauth-user-pass ' + tempPath.replace(/\\/g, "\\\\"), function (err) {
									openvpn = path.resolve(process.cwd(), 'openvpn', 'bin', 'openvpnserv.exe');
									args = ['-start'];

									if (fs.existsSync(openvpn)) {
										// if all works we'll launch our openvpn as admin
										if (runas(openvpn, args, {
												admin: true
											}) != 0) {
											console.log('something wrong');
											defer.reject('unable_to_launch');
										} else {

											self.running = true;
											console.log('openvpn launched');
											// set our current ip
											self.getIp();
											defer.resolve();

										}
									} else {
										defer.reject('openvpn_command_not_found');
									}
								});

							});

						} else {
							if (fs.existsSync(openvpn)) {
								// if all works we'll launch our openvpn as admin

								if (process.platform === 'linux') {

									var exec = require('child_process').exec;
									var child = exec(openvpn + " " + args.join(" "),
									  function (error, stdout, stderr) {
									    console.log('stdout: ' + stdout);
									    console.log('stderr: ' + stderr);
									    if (error !== null) {
									      console.log('exec error: ' + error);
									    }
									});

									console.log('password', password);
									child.stdin.write(password);

								} else {

									if (runas(openvpn, args, {
											admin: true
										}, password) != 0) {

										// we didnt got success but process run anyways..
										console.log('something wrong');
										self.running = true;
										self.getIp();
										defer.resolve();

									} else {

										self.running = true;
										console.log('openvpn launched');
										// set our current ip
										self.getIp();
										defer.resolve();

									}
								}

							} else {
								defer.reject('openvpn_command_not_found');
							}
						}



					} catch (e) {
						defer.reject('error_runas');
					}

				} else {
					defer.reject('openvpn_config_not_found');
				}
			}

		});

		return defer.promise;
	}

	var downloadTarballAndExtract = function(url) {
		var defer = Q.defer();
		var tempPath = temp.mkdirSync('popcorntime-openvpn-');
		var stream = tar.Extract({
			path: tempPath
		});

		stream.on('end', function() {
			defer.resolve(tempPath);
		});
		stream.on('error', function() {
			defer.resolve(false);
		});
		createReadStream({
			url: url
		}, function(requestStream) {
			requestStream.pipe(zlib.createGunzip()).pipe(stream);
		});

		return defer.promise;
	};

	var downloadFileToLocation = function(url, name) {
		var defer = Q.defer();
		var tempPath = temp.mkdirSync('popcorntime-openvpn-');
		tempPath = path.join(tempPath, name);
		var stream = fs.createWriteStream(tempPath);
		stream.on('finish', function() {
			defer.resolve(tempPath);
		});
		stream.on('error', function() {
			defer.resolve(false);
		});
		createReadStream({
			url: url
		}, function(requestStream) {
			requestStream.pipe(stream);
		});
		return defer.promise;
	};

	var createReadStream = function(requestOptions, callback) {
		return callback(request.get(requestOptions));
	}

	// move file
	var copyToLocation = function(targetFilename, fromDirectory) {
		var defer = Q.defer();

		mv(fromDirectory, targetFilename, function(err) {
			defer.resolve(err);
		})

		return defer.promise;

	};

	// copy instead of mv (so we keep original)
	var copy = function(source, target, cb) {

		var cbCalled = false;

		var rd = fs.createReadStream(source);
		rd.on("error", function(err) {
			done(err);
		});

		var wr = fs.createWriteStream(target);
		wr.on("error", function(err) {
		  	done(err);
	 	});
		wr.on("close", function(ex) {
			done();
		});
		rd.pipe(wr);

		function done(err) {
			if (!cbCalled) {
		      	cb(err);
		    	cbCalled = true;
			}
		}
	}

	var getPid = function() {
		var defer = Q.defer();
		var exec = require('child_process').exec;

		fs.readFile(path.join(process.cwd(), 'openvpn', 'vpnht.pid'), 'utf8', function (err,data) {

			if (err) {
				defer.resolve(false)
			} else {
				defer.resolve(data.trim());
			}

		});

		return defer.promise;
	}

	// initialize VPN instance globally
	App.VPN = new VPN();

	// we look if VPN is running
	App.VPN.isRunning();

})(window.App);
