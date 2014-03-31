(function(App) {
    "use strict";
    var request = require('request');
    var Q = require('q');

    var URL = Settings.get('yifyApiEndpoint') + 'list.json?sort=seeds&limit=50';
    var Yts = function() {};

    Yts.prototype.constructor = Yts;

    var queryTorrents = function(filters) {
        var deferred = Q.defer();

        var url = URL;

        if (filters.keywords) {
            url += '&keywords=' + filters.keywords;
        }

        if (filters.genre) {
            if (filters.genre == 'date') {
                url += '&genre=all&sort=date';
            } else {
                url += '&genre=' + filters.genre;
            }
        }

        if (filters.page) {
            url += '&set=' + filters.page;
        }

        request({url: url, json: true}, function(error, response, data) {
            if(error) {
                deferred.reject(error);
            } else if(!data || (data.error || _.isUndefined(data.MovieList))) {
                deferred.reject(error);
            } else {
                deferred.resolve(data.MovieList);
            }
        });

        return deferred.promise;
    };

    var formatForPopcorn = function(items) {
        var movies = {};
        var movieList = [];
        _.each(items, function(movie) {
            var largeCover = movie.CoverImage.replace(/_med\./, '_large.');
            var imdb = movie.ImdbCode.replace('tt', '');

            // Calc torrent health
            var seeds = movie.TorrentSeeds;
            var peers = movie.TorrentPeers;

            var torrents = {};
            torrents[movie.Quality] = {
                url: movie.TorrentUrl,
                size: movie.SizeByte,
                seed: seeds,
                peer: peers
            };

            var ptItem = movies[imdb];
            if(!ptItem) {
                ptItem = {
                    imdb:       imdb,

                    title:      movie.MovieTitleClean.replace(/\([^)]*\)|1080p|DIRECTORS CUT|EXTENDED|UNRATED|3D|[()]/g, ''),
                    year:       movie.MovieYear,

                    voteAverage:parseFloat(movie.MovieRating),

                    image:      largeCover,
                    bigImage:   largeCover,

                    torrents:   torrents
                };

                movieList.push(ptItem);
            } else {
                _.extend(ptItem.torrents, torrents);
            }

            movies[imdb] = ptItem;
        });

        return movieList;
    };

    Yts.prototype.extractIds = function(items) {
        return _.pluck(items, 'imdb');
    };

    Yts.prototype.fetch = function(filters) {
        return queryTorrents(filters)
            .then(formatForPopcorn);
    };

    App.Providers.Yts = Yts;

})(window.App);