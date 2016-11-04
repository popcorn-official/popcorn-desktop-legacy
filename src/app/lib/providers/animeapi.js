(function (App) {
    'use strict';

    var AnimeApi = function (args) {
        AnimeApi.super_.call(this);
    };

    inherits(AnimeApi, App.Providers.Generic);

    function formatFetch(animes) {
        var results = _.map(animes, function (anime) {
              return {
                  images: anime.images,
                  mal_id: anime._id,
                  haru_id: anime._id,
                  tvdb_id: 'mal-' + anime._id,
                  imdb_id: anime._id,
                  slug: anime.slug,
                  title: anime.title,
                  year: anime.year,
                  type: anime.type,
                  item_data: anime.type,
                  rating: anime.rating
              };
          });

        return {
          results: Common.sanitize(results),
          hasMore: true
        };
    };

    function formatDetail(anime) {
        var result = {
            mal_id: anime._id,
            haru_id: anime._id,
            tvdb_id: 'mal-' + anime._id,
            imdb_id: anime._id,
            slug: anime.slug,
            title: anime.title,
            item_data: anime.type,
            country: 'Japan',
            genre: anime.genres,
            genres: anime.genres,
            num_seasons: 1,
            runtime: anime.runtime,
            status: anime.status,
            synopsis: anime.synopsis,
            network: [], //FIXME
            rating: anime.rating,
            images: anime.images,
            year: anime.year,
            type: anime.type
        };

        if (anime.type === 'show') {
            result = _.extend(result, {episodes: anime.episodes});
        } else {
            // ret = _.extend(ret, {
            //   cover: img,
            //   rating: item.score,
            //   subtitle: undefined,
            //   torrents: movieTorrents(item.id, item.episodes)
            // });
        }

        return Common.sanitize(result);
    };

    function get(index, url, that) {
        var deferred = Q.defer();

        var options = {
            url: url,
            json: true
        };

        var req = processCloudFlareHack(options, Settings.animeAPI[index].url);
        console.info('Request to AnimeAPI', req.url);
        request(req, function (err, res, data) {
            if (err || res.statusCode >= 400) {
                console.warn('AnimeAPI endpoint \'%s\' failed.', Settings.animeAPI[index].url);
                if (index + 1 >= Settings.animeAPI.length) {
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


    AnimeApi.prototype.extractIds = function (items) {
        return _.pluck(items.results, 'mal_id');
    };

    AnimeApi.prototype.fetch = function (filters) {
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
        var url = Settings.animeAPI[index].url + 'animes/' + filters.page + '?' + querystring.stringify(params).replace(/%25%20/g, '%20');
        return get(index, url, that).then(formatFetch);
    };

    AnimeApi.prototype.detail = function (torrent_id, old_data, debug) {
        var that = this;

        var index = 0;
        var url = Settings.animeAPI[index].url + "anime/" + torrent_id;
        return get(index, url, that).then(formatDetail);
    };

    App.Providers.AnimeApi = AnimeApi;

})(window.App);
