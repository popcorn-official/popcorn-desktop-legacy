(function(App) {
    'use strict';

    var request = require('request'),
        semver = require('semver'),
        fs = require('fs'), 
        Q = require('q'), 
        _ = require('underscore'),
        rm = require('rimraf'),
        path = require('path'),
        crypto = require('crypto'),
        zip = require('adm-zip'),
        spawn = require('child_process').spawn;

    var UPDATE_ENDPOINT = AdvSettings.get('updateApiEndpoint') + 'update.json',
        CHANNELS = ['stable', 'beta', 'nightly'],
        FILENAME = 'package.nw.new',
        VERIFY_PUBKEY =
            '-----BEGIN PUBLIC KEY-----\n' +
            'MIIDOzCCAi4GByqGSM44BAEwggIhAoIBAQDXQDTqHZZLSJlfCNeREvkl9jzHW1mY\n' +
            'WCyj+xNG63CWEL2uFgpO43IPfC4rAkIIpjB+SdOBQ0b3jPyjYC4yNzTzPQrO2XuY\n' +
            'faxoi0ea+tzxHMzRQyPPrruOhhX7iJ48Q8VH34R0j3QhafZOkcMlI9Q5uM3GwG5d\n' +
            'odEa3vhnFrTFQrC0TC4wzpfoAVsx6YCyhGFKzIwhfF21qmyVOMdZEFC0RNh6bXs0\n' +
            'WM0pb80u/F+fQKMyRIF7Ktce/PMHGhWw7qTI83YlBMQSycSFQ6HkijlBRFvKX+et\n' +
            'nn3olLJ/fUtGMoSbfkqQrZYTYVHTp0sHxHQcmSWCDRnsoOx9nvxDJ4ZrAhUAijM0\n' +
            'aEyrdZsTrHLa8spaTmLozyUCggEBAMbW1gA+/s7Ro01XLA40xmpvNBDRVacOlSYL\n' +
            'ReoQraBvKJCQadvVFWpio8fZ394RwxsPZv32dclu/v/7pbjelWb1pDzVNoKYJ3Gy\n' +
            '2dLAXlf/yc0DKy3r98d+6h8+sKVeCW+i3prwQFDoDaddHqMZ1ZAdXycLYsBbI9U1\n' +
            '2hATNBgSVB2sHUtWhoKS0WiNwjU/iWuJEaJvyfZshhplC293fxjPaPO23u3M93Yf\n' +
            'kSRokLzWiGQ+V/5pPLjUu4CN2hNgYzpLmY7bqRiYxPdb+ZCpWwLjfYW80mykcs1B\n' +
            '99tRz8I+C6aUVcwDaPE5ONkvYfoxT5myzcvAsDELjIpw6kw7Mw8DggEFAAKCAQAI\n' +
            'jI4vIep0CxPVN0ojT6OfBLcmoCDKpHyODMJx/jMlM0XIO6EDy85rLGd0VY2U0GTm\n' +
            '33Ni2bP5pMVSO6IvJm0bfcIn/M3rjcFOY9fU5nwFjRyTpGmx0fn5Bt6Ah4A69mmf\n' +
            'jmWWmmHODquWhvaS4BIRyXSSDSmiEc55uvholol9/PD4ZvBbk/th0XP+anPRu7u1\n' +
            'jm9mW0+sj0n0ntGJl7uzmcTDETfvPpKUjz61T530w4S5UJLup+qhCTzTUWPWrST8\n' +
            'jnlH0o0qwvNa0+dUN+dTIyt96FW3a5KHpkQHSBkbVRLBY7Hd0SgX2Wo/nOMqsqsk\n' +
            'eWs0crkihZMv0OADSqEY\n' +
            '-----END PUBLIC KEY-----\n';

    function forcedBind(func, thisVar) {
        return function() {
            return func.apply(thisVar, arguments);
        };
    }

    function Updater(options) {
        if(!(this instanceof Updater)) {
            return new Updater(options);
        }

        var self = this;
        
        this.options = _.defaults(options || {}, {
            endpoint: UPDATE_ENDPOINT,
            channel: 'beta'
        });

        this.outputDir = App.settings.os === 'linux' ? process.execPath : process.cwd();
        this.updateData = null;
    }

    Updater.prototype.check = function() {
        var defer = Q.defer();
        var promise = defer.promise;
        var self = this;

        if(!(!_.contains(fs.readdirSync('.'), '.git') || // Test Development
            (   // Test Windows
                App.settings.os === 'windows' && 
                process.cwd().indexOf(process.env.APPDATA) !== -1
            ) ||
            (   // Test Linux
                App.settings.os === 'linux' &&
                _.contains(fs.readdirSync('.'), 'package.nw')
            ) ||
            (   // Test Mac OS X
                App.settings.os === 'mac' &&
                process.cwd().indexOf('Resources/app.nw') !== -1
            ))
        ) {
            win.debug('Not updating because we are running in a development environment');
            defer.resolve(false);
            return defer.promise;
        }

        request(this.options.endpoint, {json:true}, function(err, res, data) {
            if(err || !data) {
                defer.reject(err);
            } else {
                defer.resolve(data);
            }
        });

        return promise.then(function(data) {
            if(!_.contains(Object.keys(data), App.settings.os)) {
                // No update for this OS, FreeBSD or SunOS.
                // Must not be an official binary
                return false;
            }

            var updateData = data[App.settings.os];
            if(App.settings.os === 'linux') {
                updateData = updateData[App.settings.arch];
            }

            // Normalize the version number
            if(!updateData.version.match(/-\d+$/)) {
                updateData.version += '-0';
            }
            if(!App.settings.version.match(/-\d+$/)) {
                App.settings.version.version += '-0';
            }

            if(semver.gt(updateData.version, App.settings.version)) {
                win.debug('Updating to version %s', updateData.version);
                self.updateData = updateData;
                return true;
            }

            win.debug('Not updating because we are running the latest version');
            return false;
        });
    };

    Updater.prototype.download = function(source, output) {
        var defer = Q.defer();
        var downloadStream = request(source);
        downloadStream.pipe(fs.createWriteStream(output));
        downloadStream.on('complete', function() { 
            defer.resolve(output);
        });
        return defer.promise;
    };

    Updater.prototype.verify = function(source) {
        var defer = Q.defer();
        var self = this;

        var hash = crypto.createHash('SHA1'),
            verify = crypto.createVerify('DSA-SHA1');

        var readStream = fs.createReadStream(source);
        readStream.pipe(hash);
        readStream.pipe(verify);
        readStream.on('end', function() {
            hash.end();
            if(
                self.updateData.checksum !== hash.read().toString('hex') || 
                verify.verify(VERIFY_PUBKEY, self.updateData.signature, 'base64') === false
            ) {
                defer.reject('invalid hash or signature');
            } else {
                defer.resolve(source);
            }
        });
        return defer.promise;
    };

    function installWindows(downloadPath, updateData) {
        var outputDir = path.dirname(downloadPath),
            installDir = path.join(outputDir, 'app');
        var defer = Q.defer();

        var pack = new zip(downloadPath);
        pack.extractAllToAsync(installDir, true, function(err) {
            if(err) {
                defer.reject(err);
            } else {
                fs.unlink(downloadPath, function(err) {
                    if(err) {
                        defer.reject(err);
                    } else {
                        defer.resolve();
                    }
                });   
            }
        });

        return defer.promise;
    }

    function installLinux(downloadPath, updateData) {
        var outputDir = path.dirname(downloadPath),
            packageFile = path.join(outputDir, 'package.nw');
        var defer = Q.defer();

        fs.rename(packageFile, path.join(outputDir, 'package.nw.old'), function(err) {
            if(err) {
                defer.reject(err);
            } else {
                fs.rename(downloadPath, packageFile, function(err) {
                    if(err) {
                        // Sheeet! We got a booboo :'(
                        // Quick! Lets erase it before anyone realizes!
                        if(fs.existsSync(downloadPath)) {
                            fs.unlink(downloadPath, function(err) {
                                if(err) {
                                    defer.reject(err);
                                } else {
                                    fs.rename(path.join(outputDir, 'package.nw.old'), packageFile, function(err) {
                                        // err is either an error or undefined, so its fine not to check!
                                        defer.reject(err); 
                                    });
                                }
                            });
                        } else {
                            defer.reject(err);
                        }
                    } else {
                        fs.unlink(path.join(outputDir, 'package.nw.old'), function(err) {
                            if(err) {
                                // This is a non-fatal error, should we reject?
                                defer.reject(err);
                            } else {
                                defer.resolve();
                            }
                        });
                    }
                });
            }
        });
        
        return defer.promise;
    }

    function installOSX(downloadPath, updateData) {
        var outputDir = path.dirname(downloadPath),
            installDir = path.join(outputDir, 'app.nw');
        var defer = Q.defer();

        rm(installDir, function(err) {
            if(err) {
                defer.reject(err);
            } else {
                var pack = new zip(downloadPath);
                pack.extractAllToAsync(installDir, true, function(err) {
                    if(err) {
                        defer.reject(err);
                    } else {
                        fs.unlink(downloadPath, function(err) {
                            if(err) {
                                defer.reject(err);
                            } else {
                                defer.resolve();
                            }
                        });   
                    }
                });
            }
        });
        
        return defer.promise;
    }

    Updater.prototype.install = function(downloadPath) {
        var os = App.settings.os;
        var promise;
        if(os === 'windows') {
            promise = installWindows;
        } else if(os === 'linux') {
            promise = installLinux;
        } else if(os === 'mac') {
            promise = installOSX;
        } else {
            return Q.reject('Unsupported OS');
        }

        return promise(downloadPath, this.updateData);
    };

    Updater.prototype.displayNotification = function() {
        var self = this;
        var $el = $('#notification');
        $el.html(
            '<h1>' + this.updateData.title + ' Installed</h1>'   +
            '<p>&nbsp;- ' + this.updateData.description + '</p>' +
            '<span class="btn-grp">'                        +
                '<a class="btn chnglog">Changelog</a>'      +
                '<a class="btn restart">Restart Now</a>'    +
            '</span>'
        ).addClass('blue');

        var $restart = $('.btn.restart'),
            $chnglog = $('.btn.chnglog');

        $restart.on('click', function() {
            var argv = gui.App.fullArgv;
            argv.push(self.outputDir);
            spawn(process.execPath, argv, { cwd: self.outputDir, detached: true, stdio: [ 'ignore', 'ignore', 'ignore' ] }).unref();
            gui.App.quit();
        });
            
        $chnglog.on('click', function() {
            var $changelog = $('#changelog-container').html(_.template($('#changelog-tpl').html())(this.updateData));
            $changelog.find('.btn-close').on('click', function() {
                $changelog.hide();
            });
            $changelog.show();
        });

        $('body').addClass('has-notification');
    };

    Updater.prototype.update = function() {
        var outputFile = path.join(path.dirname(this.outputDir), FILENAME);

        if(this.updateData) {
            // If we have already checked for updates...
            return this.download(this.updateData.updateUrl, outputFile)
                .then(forcedBind(this.verify, this))
                .then(forcedBind(this.install, this))
                .then(forcedBind(this.displayNotification, this));
        } else {
            // Otherwise, check for updates then install if needed!
            var self = this;
            return this.check().then(function(updateAvailable) {
                if(updateAvailable) {
                    return self.download(self.updateData.updateUrl, outputFile)
                        .then(forcedBind(self.verify, self))
                        .then(forcedBind(self.install, self))
                        .then(forcedBind(self.displayNotification, self));
                } else {
                    return false;
                }
            });
        }
    };

    App.Updater = Updater;

})(window.App);