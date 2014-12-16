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

	VPN.prototype.install = function() {
		var self = this;

			if (process.platform === 'darwin') {

				return this.installRunAs()
					.then(self.installMac)
					.then(function() {
						// we told pt we have vpn enabled..
						AdvSettings.set('vpn', true);
					});

			} else if (process.platform === 'linux') {

				return this.installRunAs()
					.then(self.installLinux)
					.then(function() {
						// ok we are almost done !

						// we told pt we have vpn enabled..
						AdvSettings.set('vpn', true);
					});

			} else if (process.platform === 'win32') {

				return this.installRunAs()
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
		console.log(installFile);
		return downloadFileToLocation(installFile)
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

	VPN.prototype.connect = function() {
		var defer = Q.defer();
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
						var args = ['--daemon', '--config', vpnConfig, '--auth-user-pass', tempPath];
						// execption for windows openvpn path
						if (process.platform === 'win32') {

							// we copy our openvpn.conf for the windows service
							var newConfig = path.resolve(process.cwd(), 'openvpn', 'config', 'openvpn.ovpn');
							console.log(newConfig);

							mv(vpnConfig, newConfig, function(err) {

								if (err) {
									console.log(err);
								}

								fs.appendFile(newConfig, 'user-pass-auth ' + tempPath, function (err) {
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

											// ok openvpn is launched...
											console.log('openvpn launched');
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
								if (runas(openvpn, args, {
										admin: true
									}) != 0) {
									console.log('something wrong');
									defer.reject('unable_to_launch');
								} else {

									// ok openvpn is launched...
									console.log('openvpn launched');
									defer.resolve();

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

	var downloadFileToLocation = function(url) {
		var defer = Q.defer();
		var tempPath = temp.mkdirSync('popcorntime-openvpn-');
		tempPath = path.join(tempPath, 'setup.exe');
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

	var copyToLocation = function(targetFilename, fromDirectory) {
		var defer = Q.defer();

		mv(fromDirectory, targetFilename, function(err) {
			defer.resolve(err);
		})

		return defer.promise;

	};

	App.VPN = new VPN();

})(window.App);
