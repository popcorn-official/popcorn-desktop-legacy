(function(App) {
    "use strict";
    var request = require('request');
    var Q = require('q');

    // TEST ENDPOINT
    var URL = 'http://localhost:5000';
    var URI = require('URIjs');

    var Eztv = function() {};

    Eztv.prototype.constructor = Eztv;

    var queryTorrents = function(filters) {
        var deferred = Q.defer();

        var url = URL;

        App.db.getShows(filters, function(err, data) {

            deferred.resolve(data || []);
            
        });

        return deferred.promise;
    };

    var formatForPopcorn = function(items) {
        return items;
    };

    Eztv.prototype.extractIds = function(items) {
        return _.pluck(items, 'imdb_id');
    };

    Eztv.prototype.fetch = function(filters) {
        return queryTorrents(filters)
            .then(formatForPopcorn);
    };

    App.Providers.Eztv = Eztv;

})(window.App);