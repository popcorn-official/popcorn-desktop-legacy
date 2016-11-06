(function(App) {
    'use strict';

    var WebTorrentStreamer = function() {
        // WebTorrent instance
        this.webtorrent = null;

        // Torrent Backbone Model
        this.torrentModel = null;

        // State Backbone Model
        this.stateModel = null;

        // Stream Info Backbone Model, which keeps showing ratio/download/upload info.
        // See models/stream_info.js
        this.streamInfo = null;

        // Boolean to indicate if subtitles are already downloaded and ready to use
        this.subtitleReady = false;

        // Interval controller for StreamInfo view, which keeps showing ratio/download/upload info.
        // See models/stream_info.js
        this.updateStatsInterval = null;

        // Caching videoFile
        this.videoFile = null;

        // Boolean to indicate if the video file is ready
        this.canPlay = false;
    };

    WebTorrentStreamer.prototype = {
        start: function(model) {
            console.debug('WebTorrentStreamer.start', model.attributes);

            this.torrentModel = model;

            this.stateModel = new Backbone.Model({
                state: 'connecting',
                backdrop: this.torrentModel.get('backdrop'),
                title: '',
                player: '',
                show_controls: false
            });

            App.vent.trigger('stream:started', this.stateModel);

            // if webtorrent is created/running, we stop/destroy it
            if (this.webtorrent) {
                this.stop();
            }

            this.setup().then(this.stream.bind(this));
        },
        stop: function() {
            console.debug('WebTorrentStreamer.stop');
            
            if (this.webtorrent) {
                this.webtorrent.destroy();
            }

            this.webtorrent = null;
            this.torrentModel = null;
            this.stateModel = null;
            this.streamInfo = null;
            this.subtitleReady = false;
            this.canPlay = false;
            this.videoFile = null;

            clearInterval(this.updateStatsInterval);
            this.updateStatsInterval = null;

            App.vent.off('subtitle:downloaded');

            console.info('Streaming cancelled');

        },

        getWebTorrentInstance: function() {
            if (this.webtorrent === null) {
                this.webtorrent = new WebTorrent({
                    maxConns: parseInt(Settings.connectionLimit, 10) || 100,
                    tracker: {
                        peerId: crypt.pseudoRandomBytes(10).toString('hex'),
                        announce: Settings.trackers.forced
                    }
                });
            }
            return this.webtorrent;
        },

        fetchTorrent: function(torrentUrl) {
            var defer = Q.defer();

            var torrent = this.getWebTorrentInstance().add(torrentUrl, {
                path: this.__getTmpFilename()
            });

            torrent.on('metadata', function () {
                this.torrentModel.set('torrent', torrent);
                defer.resolve(torrent);
            }.bind(this));

            return defer.promise;
        },

        /**
         * This method is responsible for discover torrentModel info.
         * If torrentModel has title, we need to do nothing (torrentModel is already 'formatted')
         * If we are forcing torrent reading (torrent_read == true, e.g FileSelector) , we discover its info from Common.matchTorrent
         * If we just have an URL, we parse it with read-torrent and open FileSelector for user interaction
         */
        setup: function() {
            var defer = Q.defer(),
                that = this,
                torrentModel = this.torrentModel,
                torrentInfo = torrentModel.get('torrent'),
                torrentUrl = torrentInfo.magnet || torrentInfo.url || torrentInfo;

            this.fetchTorrent(torrentUrl).then(function(torrent) {

                if (torrentModel.get('title')) {
                    that.__handleSubtitles();
                    return defer.resolve();
                }
                if (torrentModel.get('torrent_read')) {
                    // if torrent was readed before, just need to discover

                    // set config subtitle language to torrent
                    torrentModel.set('defaultSubtitle', Settings.subtitle_language);

                    var torrentMetadata, matcher;
                    if (torrent.info && torrent.info.name) {
                        torrentMetadata = torrent.info.name.toString();
                    }

                    trakt.matcher.match({
                        filename: torrent.name,
                        torrent: torrentMetadata
                    }).then(function(res) {
                        matcher = res;
                        console.debug('trakt.matcher.match', matcher);

                        return trakt.images.get({
                            type: res.type === 'movie' ? 'movie' : 'show',
                            imdb: res.type === 'movie' ? res.movie.ids.imdb : res.show.ids.imdb,
                            tvdb: res.type === 'movie' ? false : res.show.ids.tvdb,
                            tmdb: res.type === 'movie' ? res.movie.ids.tmdb : false
                        });
                    }).then(function(img) {
                        console.debug('trakt.images.get', img);

                        // load images
                        $('.loading-background').css('background-image', 'url(' + img.background + ')');
                        torrentModel.set('backdrop', img.background);
                        torrentModel.set('poster', img.poster);

                        // parse quality
                        switch (matcher.quality) {
                            case 'SD':
                                matcher.quality = '480p';
                                break;
                            case 'HD':
                                matcher.quality = '720p';
                                break;
                            case 'FHD':
                                matcher.quality = '1080p';
                                break;
                            default:
                        }

                        // populating torrentModel with the new data
                        switch (matcher.type) {
                            case 'movie':
                                torrentModel.set('quality', matcher.quality);
                                torrentModel.set('imdb_id', matcher.movie.ids.imdb);
                                torrentModel.set('title', matcher.movie.title);
                                break;
                            case 'episode':
                                torrentModel.set('quality', matcher.quality);
                                torrentModel.set('tvdb_id', matcher.show.ids.tvdb);
                                torrentModel.set('episode_id', matcher.episode.ids.tvdb);
                                torrentModel.set('imdb_id', matcher.show.ids.imdb);
                                torrentModel.set('episode', matcher.episode.number);
                                torrentModel.set('season', matcher.episode.season);
                                torrentModel.set('title', matcher.show.title + ' - ' + i18n.__('Season %s', matcher.episode.season) + ', ' + i18n.__('Episode %s', matcher.episode.number) + ' - ' + matcher.episode.title);
                                break;
                            default:
                                throw 'trakt.matcher.match failed';
                        }
                        that.__handleSubtitles();
                        return defer.resolve();

                    }).catch(function(err) {
                        that.__handleSubtitles();
                        console.error('An error occured while trying to get metadata and subtitles', err);
                        torrentModel.set('title', torrent.name);
                        return defer.resolve();
                    });

                    return defer.resolve();
                }

                // hide non-video files from selection
                for (var f in torrent.files) {
                    torrent.files[f].index = f;
                    if (isVideo(torrent.files[f].name)) {
                        torrent.files[f].display = true;
                    } else {
                        torrent.files[f].display = false;
                    }
                }

                var fileIndex = torrentModel.get('file_index');

                // if needs user interaction for file selection
                if (torrent.files && torrent.files.length > 0 && !fileIndex && fileIndex !== 0) {
                    var fileModel = new Backbone.Model({
                        torrent: torrent,
                        files: torrent.files
                    });
                    App.vent.trigger('system:openFileSelector', fileModel);
                }

                return defer.reject();

            });

            return defer.promise;
        },

        /**
         * Start torrent streaming based on torrentModel, which was formatted before
         */
        stream: function() {

            var torrent = this.torrentModel.get('torrent');

            this.streamInfo = new App.Model.StreamInfo();
            this.streamInfo.set('torrentModel', this.torrentModel);

            // compatibility
            this.streamInfo.set('title', this.torrentModel.get('title'));
            this.streamInfo.set('player', this.torrentModel.get('device'));
            this.streamInfo.set('quality', this.torrentModel.get('quality'));
            this.streamInfo.set('defaultSubtitle', this.torrentModel.get('defaultSubtitle'));
            // end compatibility

            this.stateModel.set('streamInfo', this.streamInfo);

            this.streamInfo.selectFile();
            this.streamInfo.updateStats();
            this.updateStatsInterval = setInterval(this.streamInfo.updateStats.bind(this.streamInfo), 1000);

            this.stateModel.set('state', 'startingDownload');

            var serverPort, defaultPort = parseInt(Settings.streamPort, 10), serverCreated = false;
            while (!serverCreated) {
                serverPort = defaultPort ? defaultPort : this.__generatePortNumber();
                try {
                    console.info('WebTorrentStream: trying to create stream server on port: ', serverPort);
                    torrent.createServer().listen(serverPort);
                    serverCreated = true;
                } catch (e) {
                    console.info('WebTorrentStream: could not listen on port: ', serverPort);
                    defaultPort = 0;
                }
            }

            // when state get 'ready' value
            // we emit 'stream:ready' to players
            this.stateModel.on('change:state', function() {

                if (this.stateModel.get('state') !== 'ready') {
                    return;
                }

                if (this.streamInfo.get('player') && this.streamInfo.get('player').id !== 'local') {
                    this.stateModel.set('state', 'playingExternally');
                }

                // compatibility
                this.streamInfo.set('title', this.torrentModel.get('title'));
                this.streamInfo.set('player', this.torrentModel.get('device'));
                this.streamInfo.set('quality', this.torrentModel.get('quality'));
                this.streamInfo.set('defaultSubtitle', this.torrentModel.get('defaultSubtitle'));
                // end compatibility

                this.streamInfo.set('downloaded', 0);

                App.vent.trigger('stream:ready', this.streamInfo);
                this.stateModel.destroy();

            }.bind(this));

            // search for media file index
            var fileIndex = 0;
            var __size = 0;
            torrent.files.forEach(function(file, idx) {
                if (__size < file.length) {
                    __size = file.length;
                    fileIndex = idx;
                }
            });

            // set location to player
            var url = 'http://127.0.0.1:' + serverPort + '/' + fileIndex;

            this.streamInfo.set('src', url);
            this.streamInfo.set('type', 'video/mp4');

            // dummy element to fire stream:start
            var video = document.createElement('video');
            video.addEventListener('canplay', function () {
                this.canPlay = true;
                video.pause();
                video.src = '';
                video.load();
            }.bind(this));
            video.volume = 0;
            video.src = url;
            video.play();

            this.videoFile = torrent.files[fileIndex];

            // watch if state is 'ready'
            this.__watchState(this);
        },

        __watchState: function (that) {
            if (!that.webtorrent) {
                return;
            }

            var state = 'connecting';
            var torrent = that.torrentModel.get('torrent');

            if (that.canPlay || torrent.done) {
                state = 'ready';
            } else {
                state = 'downloading';
            }

            if (state === 'ready' && !that.subtitleReady) {
                state = 'waitingForSubtitles';
            }
        
            that.stateModel.set('state', state);

            if (state !== 'ready') {
                _.delay(that.__watchState, 100, that);
            }
        },

        __generatePortNumber: function() {
            var min = 1024, max = 65535;

            return Math.floor(Math.random() * (max - min)) + min;
        },

        __getTmpFilename: function() {
            return App.settings.tmpLocation;
        },

        __handleSubtitles: function(videoFile) {
            console.debug('WebTorrentStreamer.__handleSubtitles');

            var torrent = this.torrentModel.get('torrent');
            var defaultSubtitle = this.torrentModel.get('defaultSubtitle');

            // after downloaded subtitles, we set the srt file to streamInfo
            App.vent.on('subtitle:downloaded', function(sub) {
                if (sub) {
                    this.streamInfo.set('subFile', sub);
                    App.vent.trigger('subtitle:convert', {
                        path: sub,
                        language: defaultSubtitle
                    }, function(err, res) {
                        if (err) {
                            console.error('error converting subtitles', err);
                            this.streamInfo.set('subFile', null);
                            App.vent.trigger('notification:show', new App.Model.Notification({
                                title: i18n.__('Error converting subtitle'),
                                body: i18n.__('Try another subtitle or drop one in the player'),
                                showRestart: false,
                                type: 'error',
                                autoclose: true
                            }));
                        } else {
                            App.Subtitles.Server.start(res);
                        }
                    }.bind(this));
                }

                this.subtitleReady = true;
            }.bind(this));

            this.findSubtitles().then(function(subtitles) {
                this.streamInfo.set('subtitle', subtitles);

                if (subtitles.length === 0) {
                    this.streamInfo.set('subtitle', this.torrentModel.get('subtitle'));
                }

                // if thereis default subtitle set, we download the subtitle
                if (defaultSubtitle && defaultSubtitle !== 'none' && subtitles.length > 0) {
                    App.vent.trigger('subtitle:download', {
                        url: subtitles[defaultSubtitle],
                        path: path.join(this.__getTmpFilename(), this.videoFile.path)
                    });
                } else {
                    this.subtitleReady = true;
                }
            }.bind(this));

        },

        /**
         * Method to discover and find subtitles from providers by torrent informed
         */
        findSubtitles: function() {
            var defer = Q.defer(),
                queryData = {},
                extractSubtitle = this.torrentModel.get('extract_subtitle');

            if (typeof extractSubtitle === 'object') {
                queryData = extractSubtitle;
            }

            queryData.filename = this.torrentModel.get('torrent').name;
            queryData.keywords = this.__getSubtitleKeywords();

            if (this.torrentModel.get('imdb_id')) {
                queryData.imdbid = this.torrentModel.get('imdb_id');
            }

            if (this.torrentModel.get('season')) {
                queryData.season = this.torrentModel.get('season');
            }

            if (this.torrentModel.get('episode')) {
                queryData.episode = this.torrentModel.get('episode');
            }

            console.debug('WebTorrentStream.findSubtitles', queryData);

            var subtitleProvider = App.Config.getProvider('subtitle');
            subtitleProvider.fetch(queryData).then(function(subs) {

                if (subs && Object.keys(subs).length > 0) {
                    console.info(Object.keys(subs).length + ' subtitles found');
                    return defer.resolve(subs);
                }

                console.warn('No subtitles returned');

                if (Settings.subtitle_language !== 'none') {
                    App.vent.trigger('notification:show', new App.Model.Notification({
                        title: i18n.__('No subtitles found'),
                        body: i18n.__('Try again later or drop a subtitle in the player'),
                        showRestart: false,
                        type: 'warning',
                        autoclose: true
                    }));
                }

                defer.resolve([]);

            }.bind(this)).catch(function(err) {
                console.error('subtitleProvider.fetch()', err);
                defer.resolve([]);
            }.bind(this));

            return defer.promise;
        },

        /**
         * Method to return keywords for subttiles search bases on Localization
         */
        __getSubtitleKeywords: function() {
            var keywords = [];
            for (var key in App.Localization.langcodes) {
                if (App.Localization.langcodes[key].keywords !== undefined) {
                    keywords[key] = App.Localization.langcodes[key].keywords;
                }
            }
            return keywords;
        }
    };

    var streamer = new WebTorrentStreamer();

    App.vent.on('stream:start', streamer.start.bind(streamer));
    App.vent.on('stream:stop', streamer.stop.bind(streamer));

})(window.App);