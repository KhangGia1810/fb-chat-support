'use strict';

var utils = require('../utils');
var log = require('npmlog');

module.exports = function (defaultFuncs, api, ctx) {
  return function getAccess(callback) {
    var cb;
    var returnPromise = new Promise(function (resolve, reject) {
      cb = function (err, res) {
        if (err) reject(err);
        resolve(res);
      }
    });

    if (typeof callback == 'function') cb = callback;
    if (ctx.access_token != 'NONE') return cb(null, ctx.access_token);

    var nextUrl = 'https://business.facebook.com/security/twofactor/reauth/enter/';
    var Referer = 'https://business.facebook.com/security/twofactor/reauth/?twofac_next=https%3A%2F%2Fbusiness.facebook.com%2Fbusiness_locations&type=avoid_bypass&app_id=0&save_device=0';
    defaultFuncs
      .get('https://business.facebook.com/business_locations', ctx.jar, null, ctx.globalOptions)
      .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
      .then(function (html) {
        var tokenDeprecated = /"],\["(\S+)","436761779744620",{/g.exec(html);
        if (tokenDeprecated) {
          ctx.access_token = tokenDeprecated[1].split('"],["').pop();
          return cb(null, tokenDeprecated[1].split('"],["').pop());
        }
        var lsd = utils.getFrom(String(html), "[\"LSD\",[],{\"token\":\"", "\"}");
        defaultFuncs
          .post('https://business.facebook.com/security/twofactor/reauth/send/', ctx.jar, { lsd }, ctx.globalOptions, null, { Referer })
          .then(function () {
            var err = {
              type: 'submitCode',
              continue: function submitCode(code = '') {
                if (isNaN(parseInt(code)) || code.length == 0) return cb({
                  type: 'code-error',
                  error: 'code is not accept'
                });
                var form = {
                  approvals_code: code,
                  save_device: true,
                  lsd 
                };
                defaultFuncs
                  .post(nextUrl, ctx.jar, form, ctx.globalOptions, null, { Referer })
                  .then(utils.parseAndCheckLogin(ctx, defaultFuncs))
                  .then(async function (newHtml) {
                    if (String(newHtml).includes(false)) return cb({
                      type: 'undefined',
                      error: 'code is not accept or something went wrong'
                    });
                    utils
                      .createAccess_token(ctx.jar, ctx.globalOptions)()
                      .then(function ([htmlData, token]) {
                        if (token != 'NONE') {
                          ctx.access_token = token;
                          return cb(null, token);
                        }
                        return cb({
                          type: 'token-undefined',
                          htmlData
                        });
                      });
                  })
                  .catch(function (err) {
                    log.error('getAccess', err);
                    return cb({
                      type: 'error',
                      error: err
                    });
                  });
              }
            };
            if (typeof callback == 'function') return cb(err);
            return cb({
              type: 'callback',
              message: 'callback is not a function'
            });
          });
      })
      .catch(function (err) {
        log.error('getAccess', err);
        return cb({
          type: 'error',
          error: err
        });
      })

    return returnPromise;
  }
}
