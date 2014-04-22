(function(App) {
    "use strict";
    var request = require('request');
    var Q = require('q');

    // TEST ENDPOINT
    var URL = 'http://localhost:5000/shows';
    var URI = require('URIjs');

    // TODO: Make the local cache for tvshow
    var TTL = 1000 * 60 * 60 * 4; // 4 hours

    var Eztv = function(){
        App.Providers.CacheProvider.call(this, 'tvshows', TTL);
    };

    Eztv.prototype = Object.create(App.Providers.CacheProvider.prototype);
    Eztv.prototype.constructor = Eztv;

    var queryTorrents = function(filters) {
        var deferred = Q.defer();

        var url = URL;

        if (filters.page) {
            url += '/' + filters.page;
        }

        request({url: url, json: true}, function(error, response, data) {
            if(error) {
                deferred.reject(error);
            } else if(!data || (data.error && data.error !== 'No shows found')) {
                var err = data? data.error: 'No data returned';
                console.error('Eztv error:', err);
                deferred.reject(err);
            } else {
                deferred.resolve(data || []);
            }
        });

        return deferred.promise;
    };

    var formatForPopcorn = function(items) {
        var movies = {};
        var movieList = [];
        _.each(items, function(show) {
            var data = show.doc;

            var largeCover = data.images.poster;
            var imdb = data._id.replace('tt', '');

            // Calc torrent health
            var seeds = 0;
            var peers = 0;

            var ptItem = movies[imdb];
            if(!ptItem) {
                ptItem = {
                    imdb:       imdb,

                    title:      data.title.replace(/\([^)]*\)|1080p|DIRECTORS CUT|EXTENDED|UNRATED|3D|[()]/g, ''),
                    year:       data.year,

                    MovieRating: data.rating,

                    image:      data.images.poster,
                    bigImage:   data.images.poster,
                    backdrop:   resizeImage(data.images.fanart, '940'),

                    runtime:   data.runtime,
                    synopsis:   data.synopsis,

                    torrents:   data.torrents
                };

                movieList.push(ptItem);
            } else {
                _.extend(ptItem.torrents, torrents);
            }

            movies[imdb] = ptItem;
        });

        return movieList;
    };

    var resizeImage = function(imageUrl, width) {
        var uri = URI(imageUrl),
            ext = uri.suffix(),
            file = uri.filename().split('.' + ext)[0];

        return uri.filename(file + '-' + width + '.' + ext).toString();
    };

    Eztv.prototype.extractIds = function(items) {
        return _.pluck(items, 'imdb');
    };

    Eztv.prototype.fetch = function(filters) {
        return queryTorrents(filters)
            .then(formatForPopcorn);
    };

    App.Providers.Eztv = Eztv;

})(window.App);