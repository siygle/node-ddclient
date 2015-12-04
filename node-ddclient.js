#!/usr/bin/env node
'use strict';

const CronJob = require('cron').CronJob;
const request = require('request');
const nasync = require('async');
const debug = require('debug')('ddclient');
const config = require('./config');

const CF_API = 'https://www.cloudflare.com/api_json.html';

/*
 * Use getIp in config to setup remote host which provide get current ip service
 */
function getIp(cb) {
  let serv = (config.getIp) ? config.getIp : 'http://ifconfig.me/ip';

  request.get(serv, function(err, req, body) {
    if (err) {
      console.error('getIp fail!');
      cb(err);
    } else {
      let addr = body.replace(/\n/g, '');
      debug('getIp', addr);
      cb(null, addr);
    }
  });
}

/*
 * Filter dns data and return target submain data
 * Always save full data so need a simple way to extract target subdomain data
 */
function getSubdomain(obj) {
  if (typeof(obj) !== 'object') return false;
  let result = [], obj = {}, param = config.cloudflare;

  if (obj.response &&
      obj.response.recs &&
      obj.response.recs.objs &&
      obj.response.recs.count &&
      obj.response.recs.count > 0) {
      var items = obj.response.recs.objs;
      items.forEach(function(item) {
        if (item.name === param.subdomain) {
          result.push(item);
        }
      });
  }
  debug('getSubdomain', result);
  return result;
}

/*
 * Fetch dns data from service provicer
 */
function getDnsInfo(cb) {
  var param = config.cloudflare;
  request.get(CF_API, {
    method: 'GET',
    qs: {
      a: 'rec_load_all',
      tkn: param.apikey,
      email: param.email,
      z: param.domain
    },
    json: true
  }, function(err, res, body) {
    return (err) ? cb(err) : cb(body);
  });
}

/*
 * update dns data at service provider
 */
function updateDnsInfo(dns, cb) {
  var param = config.cloudflare;

  request(CF_API, {
    method: 'POST',
    form: {
      a: 'rec_edit',
      tkn: param.apikey,
      email: param.email,
      z: param.domain,
      type: 'A',
      name: param.subdomain,
      id: dns.id,
      content: dns.content,
      service_mode: '0',
      ttl: '1'
    },
    json: true
  }, function(err, res, body) {
    return (err) ? cb(err) : cb(null, body);
  });
}

/*
 * main function
 */
let job = new CronJob(config.cronRule, function() {
  nasync.parallel([
    nasync.apply(getIp),
    nasync.apply(getDnsInfo)
  ], function(err, results) {
    if (err) {
      console.error(err);
    } else {
      debug('Prepare for DNS update', results);
      let addr = results[0];
      let subdomains = getSubdomain(results[1]);

      nasync.times(subdomains.length, function(n, next){
        let dns = subdomains[n - 1];
        if (!dns['rec_id']) {
          next(null, `${dns.name} format error`);
        } else if (addr === dns.content) {
          next(null, `${dns.name} don't need to update ip now`);
        } else {
          let update = {
            id: dns.rec_id,
            content: addr
          };
          updateDnsInfo(update, function(err, data) {
            if (data.result != 'success') {
              console.error(`Update ${dns.name} DNS data fail`));
            }
            next(err, `Update ${dns.name} to ${addr}`);
          });
        }
      }, function(err, result){
        if (err) {
          console.error(err);
        } else {
          debug('ddclient finish', result.join(';'));
          console.log(result.join("\n"));
        }
      });
    }
  });
}, null, true);

// start as cronjob
job.start();
