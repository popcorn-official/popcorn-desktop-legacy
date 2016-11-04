(function (App) {
    'use strict';

    var Client = require('node-tvdb');

    var TVApi = function () {
        try {
            var tvdb = new Client('7B95D15E1BE1D75A');
            tvdb.getLanguages()
                .then(function (langlist) {
                    AdvSettings.set('tvdbLangs', langlist);
                });
        } catch (e) {
            AdvSettings.set('tvdbLangs', false);
            win.warn('Something went wrong with TVDB, overviews can\'t be translated.');
        }
        TVApi.super_.call(this);
    };

    inherits(TVApi, App.Providers.Generic);

    function get(index, url, that) {
        var deferred = Q.defer();

        var options = {
            url: url,
            json: true
        };

        var req = processCloudFlareHack(options, Settings.tvAPI[index].url);
        console.info('Request to TVAPI', req.url);
        request(req, function (err, res, data) {
            if (err || res.statusCode >= 400) {
                console.warn('TVAPI endpoint \'%s\' failed.', Settings.tvAPI[index].url);
                if (index + 1 >= Settings.tvAPI.length) {
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

    function processCloudFlareHack(options, url) {
        const match = url.match(/^cloudflare\+(.*):\/\/(.*)/);
        if (match) {
            options = Object.assign(options, {
                uri: match[1] + '://cloudflare.com/',
                headers: {
                    'Host': match[2],
                    'User-Agent': 'Mozilla/5.0 (Linux) AppleWebkit/534.30 (KHTML, like Gecko) PT/3.8.0'
                }
            });
        }
        return options;
    }

    TVApi.prototype.extractIds = function (items) {
        return _.pluck(items.results, 'imdb_id');
    };

    TVApi.prototype.fetch = function (filters) {
        var params = {
            sort: 'seeds',
            limit: '50'
        };

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
        var url = Settings.tvAPI[index].url + 'shows/' + filters.page + '?' + querystring.stringify(params).replace(/%25%20/g, '%20');
        return get(index, url).then(function (data) {
            data.forEach(function(entry) {
              entry.type = 'show'
            });

            return {
                results: Common.sanitize(data),
                hasMore: true
            };
        });
    };

    TVApi.prototype.detail = function (torrent_id, old_data, debug) {
        const index = 0;
        const url = Settings.tvAPI[index].url + 'show/' + torrent_id;
        return get(index, url).then(data => {
            if (this.translate && this.language !== 'en') {
                let langAvailable;
                for (let x = 0; x < this.TVDBLangs.length; x++) {
                    if (this.TVDBLangs[x].abbreviation.indexOf(this.language) > -1) {
                        langAvailable = true;
                        break;
                    }
                }

                if (!langAvailable) {
                    return sanitize(data);
                } else {
                    var reqTimeout = setTimeout(() => sanitize(data), 2000);

                    console.info('Request to TVApi: \'%s\' - %s', old_data.title, this.language);
                    return this.tvdb.getSeriesAllById(old_data.tvdb_id).then(localization => {
                        clearTimeout(reqTimeout);

                        data = Object.assign(data, {
                            synopsis: localization.Overview
                        });

                        for (var i = 0; i < localization.Episodes.length; i++) {
                            for (var j = 0; j < data.episodes.length; j++) {
                                if (localization.Episodes[i].id.toString() === data.episodes[j].tvdb_id.toString()) {
                                    data.episodes[j].overview = localization.Episodes[i].Overview;
                                    break;
                                }
                            }
                        }

                        return sanitize(data);
                    });
                }
            } else {
                return Common.sanitize(data);
            }
        });
    };

    App.Providers.TVApi = TVApi;

})(window.App);
