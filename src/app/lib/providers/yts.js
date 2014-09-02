(function(App) {
	'use strict';
	var querystring = require('querystring');
	var request = require('request');
	var Q = require('q');

	var URL = false;
	var Yts = function() {};

	Yts.prototype.constructor = Yts;

	var queryTorrents = function(filters) {

		var deferred = Q.defer();

		var params = {};
		params.sort = 'seeds';
		params.limit = '50';

		if (filters.keywords) {
			params.keywords = filters.keywords.replace(/\s/g, '% ');
		}

		if (filters.genre) {
			params.genre = filters.genre;
		}

		if (filters.order) {
			var order = 'desc';
			if (filters.order === 1) {
				order = 'asc';
			}
			params.order = order;
		}

		if (filters.sorter && filters.sorter !== 'popularity') {
			params.sort = filters.sorter;
		}

		if (filters.page) {
			params.set = filters.page;
		}

		if (Settings.movies_quality !== 'all') {
			params.quality = Settings.movies_quality;
		}

		var url = AdvSettings.get('yifyApiEndpoint') + 'list.json?' + querystring.stringify(params).replace(/%E2%80%99/g, '%27');

		win.info('Request to YTS API');
		win.debug(url);
		request({
			url: url,
			json: true
		}, function(error, response, data) {
			if (error) {
				deferred.reject(error);
			} else if (!data || (data.error && data.error !== 'No movies found')) {
				var err = data ? data.error : 'No data returned';
				win.error('YTS error:', err);
				deferred.reject(err);
			} else {
				deferred.resolve(data.MovieList || []);
			}
		});

		return deferred.promise;
	};

	var formatForPopcorn = function(items) {
		var results = {};
		var movieFetch = {};
		movieFetch.results = [];
		movieFetch.hasMore = (items.length === 50 ? true : false);
		_.each(items, function(movie) {
			if (movie.Quality === '3D') {
				return;
			}
			var largeCover = movie.CoverImage.replace(/_med\./, '_large.');
			var imdb = movie.ImdbCode;

			// Calc torrent health
			var seeds = movie.TorrentSeeds;
			var peers = movie.TorrentPeers;

			var torrents = {};
			torrents[movie.Quality] = {
				url: movie.TorrentUrl,
				size: movie.SizeByte,
				filesize: movie.Size,
				seed: seeds,
				peer: peers
			};

			var ptItem = results[imdb];
			if (!ptItem) {
				ptItem = {
					imdb_id: imdb,
					title: movie.MovieTitleClean.replace(/\([^)]*\)|1080p|DIRECTORS CUT|EXTENDED|UNRATED|3D|[()]/g, ''),
					year: movie.MovieYear,
					genre: movie.Genre,
					rating: movie.MovieRating,
					image: largeCover,
					torrents: torrents,
					type: 'movie'
				};

				movieFetch.results.push(ptItem);
			} else {
				_.extend(ptItem.torrents, torrents);
			}

			results[imdb] = ptItem;
		});
		return movieFetch;
	};

        // Single element query
        var queryTorrent = function(torrent_id, old_data, callback) {
                var params = {imdb_id: torrent_id};
                var url = AdvSettings.get('yifyApiEndpoint') + 'listimdb.json?' + querystring.stringify(params).replace(/%E2%80%99/g, '%27');

                win.info('Request to YTS API');
		win.debug(url);
		request({
			url: url,
			json: true
		}, function(error, response, data) {
			if (error) {
                                callback(error);
			} else if (!data || (data.error && data.error !== 'No movies found')) {
				var err = data ? data.error : 'No data returned';
				win.error('YTS error:', err);
                                callback(error);
			} else {
                                var ptt = formatForPopcorn (data.MovieList || []);
                                var torrents = ptt.results.pop() || {};
                                old_data.torrents = _.extend (old_data.torrents, torrents);
                                callback (false, old_data);
			}
		});
        };

	Yts.prototype.extractIds = function(items) {
		return _.pluck(items.results, 'imdb_id');
	};

	Yts.prototype.fetch = function(filters) {
		return queryTorrents(filters)
			.then(formatForPopcorn);
	};

        Yts.prototype.detail = function(torrent_id, old_data,callback) {
                return queryTorrent(torrent_id, old_data, callback);
        };


	App.Providers.Yts = Yts;

})(window.App);
