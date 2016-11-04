(function (App) {
    'use strict';

    var MovieApi = function () {
        MovieApi.super_.call(this);
    };

    inherits(MovieApi, App.Providers.Generic);

    function formatMovie(movie) {
        return {
            type: 'movie',
            imdb_id: movie.imdb_id,
            title: movie.title,
            year: movie.year,
            genre: movie.genres,
            rating: parseInt(movie.rating.percentage, 10) / 10,
            runtime: movie.runtime,
            images: movie.images,
            cover: movie.images.poster,
            backdrop: movie.images.fanart,
            synopsis: movie.synopsis,
            trailer: movie.trailer !== null ? movie.trailer : false,
            certification: movie.certification,
            torrents: movie.torrents['en'] !== null ? movie.torrents['en'] : movie.torrents[Object.keys(movie.torrents)[0]],
            langs: movie.torrents
        };
    }

    function formatForPopcorn(movies) {
        var results = [];

        movies.forEach(function (movie) {
            if (movie.torrents) {
                results.push(formatMovie(movie));
            }
        });

        return {
            results: Common.sanitize(results),
            hasMore: true
        };
    };

    function get(index, url, that) {
        var deferred = Q.defer();

        var options = {
            url: url,
            json: true
        };

        var req = processCloudFlareHack(options, Settings.animeAPI[index].url);
        console.info('Request to MovieAPI', req.url);
        request(req, function (err, res, data) {
            if (err || res.statusCode >= 400) {
                console.warn('MovieAPI endpoint \'%s\' failed.', Settings.movieAPI[index].url);
                if (index + 1 >= Settings.movieAPI.length) {
                    return deferred.reject(err || 'Status Code is above 400');
                } else {
                    return get(index + 1, url, that);
                }
            } else if (!data || data.error) {
                err = data ? data.status_message : 'No data returned';
                console.error('API error:', err);
                return deferred.reject(err);
            } else {
                return deferred.resolve(data);
            }
        });

        return deferred.promise;
    };

    var processCloudFlareHack = function (options, url) {
        var req = options;
        var match = url.match(/^cloudflare\+(.*):\/\/(.*)/);
        if (match) {
            req = _.extend(req, {
                uri: match[1] + '://cloudflare.com/',
                headers: {
                    'Host': match[2],
                    'User-Agent': 'Mozilla/5.0 (Linux) AppleWebkit/534.30 (KHTML, like Gecko) PT/3.8.0'
                }
            });
        }
        return req;
    };

    MovieApi.prototype.extractIds = function (items) {
        return _.pluck(items.results, 'imdb_id');
    };

    MovieApi.prototype.fetch = function (filters) {
        var that = this;

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
            params.order = filters.order;
        }

        if (filters.sorter && filters.sorter !== 'popularity') {
            params.sort = filters.sorter;
        }

        var index = 0;
        var url = Settings.movieAPI[index].url + 'movies/' + filters.page + '?' + querystring.stringify(params).replace(/%25%20/g, '%20');
        return get(index, url, that)
            .then(function (data) {
                return formatForPopcorn(data);
            });
    };

    MovieApi.prototype.detail = function (torrent_id, old_data, debug) {
        return Q(old_data);
    };

    MovieApi.prototype.random = function () {
        var that = this;
        var index = 0;
        var url = Settings.movieAPI[index].url + 'random/movie';
        return get(index, url, that).then(formatMovie);
    };

    App.Providers.MovieApi = MovieApi;

})(window.App);
