(function(App) {
    "use strict";
    var request = require('request');
    var Q = require('q');

    // TEST ENDPOINT
    var URL = 'http://localhost:5000';
    var URI = require('URIjs');

    var Eztv = function() {
        this.db = App.db;
    };
    Eztv.prototype.constructor = Eztv;

    var queryTorrents = function(filters) {
        var deferred = Q.defer();

        var url = URL;

        if (filters.page) {
            url = URL + '/shows/' + filters.page;
        }

        if (filters.keywords) {
            url = URL + '/shows/search/' + filters.keywords;
        }

        
        App.db.getShows({page: filters.page}, function(err, data) {
            console.log(err);
            console.log(data);
            deferred.resolve(data || []);
            
        });

        return deferred.promise;
    };

    var formatForPopcorn = function(items) {


        var movies = {};
        var movieList = [];
        _.each(items, function(show) {

            var data = show;

            var largeCover = data.images.poster;
            var imdb = data.imdb_id.replace('tt', '');


            // Calc torrent health
            var seeds = 0;
            var peers = 0;

            var ptItem = movies[imdb];
            if(!ptItem) {

                
                ptItem = {
                    imdb:           imdb,

                    title:          data.title.replace(/\([^)]*\)|1080p|DIRECTORS CUT|EXTENDED|UNRATED|3D|[()]/g, ''),
                    year:           data.year,

                    MovieRating:    data.rating,

                    image:          data.images.poster,
                    bigImage:       data.images.poster,
                    backdrop:       resizeImage(data.images.fanart, '940'),

                    runtime:        data.runtime,
                    synopsis:       data.synopsis,

                    torrents:       data.episodes,
                    seasonsCount:   0
                };


                movieList.push(ptItem);
                
            } else {
                _.extend(ptItem.episodes, episodes);
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