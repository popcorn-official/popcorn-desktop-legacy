(function (App) {
	'use strict';

	var Q = require('q');
	var request = require('request');
	var inherits = require('util').inherits;

	function YTS() {
		if (!(this instanceof YTS)) {
			return new YTS();
		}

		App.Providers.Generic.call(this);
	}
	inherits(YTS, App.Providers.Generic);

	YTS.prototype.extractIds = function (items) {
		return _.pluck(items.results, 'imdb_id');
	};

	/*var format = function (data) {
		return {
			hasMore: data.movie_count > data.page_number * data.limit,
			results: _.filter(data.movies, function(movie) {
				// Filter any 3D only movies
				return _.any(movie.torrents, function(torrent) {
					return torrent.quality !== '3D';
				});
			})
		};
	};*/

	var format = function (data) {
		var results = _.chain(data.movies)
			.filter(function (movie) {
				// Filter any 3D only movies
				return _.any(movie.torrents, function (torrent) {
					return torrent.quality !== '3D';
				});
			}).map(function (movie) {
				return {
					type: 'movie',
					imdb_id: movie.imdb_code,
					title: movie.title,
					year: movie.year,
					genre: movie.genres,
					rating: movie.rating,
					image: movie.medium_cover_image,
					torrents: _.reduce(movie.torrents, function (torrents, torrent) {
						if (torrent.quality !== '3D') {
							torrents[torrent.quality] = {
								url: torrent.url,
								magnet: 'magnet:?xt=urn:btih:' + torrent.hash + '&tr=udp://open.demonii.com:1337&tr=udp://tracker.coppersurfer.tk:6969',
								size: torrent.size_bytes,
								filesize: torrent.size,
								seed: torrent.seeds,
								peer: torrent.peers
							};
						}
						return torrents;
					}, {})
				};
			}).value();

		return {
			results: results,
			hasMore: data.movie_count > data.page_number * data.limit
		};
	};

	YTS.prototype.fetch = function (filters) {
		var params = {
			sort_by: 'seeds',
			limit: 50,
			with_rt_ratings: true
		};

		if (filters.page) {
			params.page = filters.page;
		}

		if (filters.keywords) {
			params.query_term = filters.keywords;
		}

		if (filters.genre) {
			params.genre = filters.genre;
		}

		if (filters.order === 1) {
			params.order_by = 'asc';
		}

		if (filters.sorter && filters.sorter !== 'popularity') {
			params.sort_by = filters.sorter;
		}

		if (Settings.movies_quality !== 'all') {
			params.quality = Settings.movies_quality;
		}

		var defer = Q.defer();

		request({
			uri: 'http://cloudflare.com/api/v2/list_movies.json',
			qs: params,
			headers: {
				'Host': 'eqwww.image.yt'
			},
			strictSSL: false,
			json: true,
			timeout: 10000
		}, function (err, res, data) {
			if (err || res.statusCode >= 400) {
				return defer.reject(err || 'Status Code is above 400');
			} else if (!data || data.status === 'error') {
				err = data ? data.status_message : 'No data returned';
				return defer.reject(err);
			} else {
				return defer.resolve(format(data.data));
			}
		});

		return defer.promise;
	};

	YTS.prototype.detail = function (torrent_id, old_data) {
		return Q(old_data);
	};

	App.Providers.Yts = YTS;

})(window.App);
