#!/usr/bin/env node

var fs = require('fs');

var daemon = require('daemon')(),
    CronJob = require('cron').CronJob,
    request = require('request'),
    async = require('async'),
    config = require('./config');

const DNS_TMP = '/tmp/ddclient-dns';
const CF_API = 'https://www.cloudflare.com/api_json.html';

/*
 * Use getIp in config to setup remote host which provide get current ip service
 */
function getIp(cb) {
  var serv = (config.getIp) ? config.getIp : 'http://ifconfig.me/ip';
  request.get(serv, function(err, req, body) {
    if (err) {
      console.error('getIp fail!');
      cb(err);
    } else {
      var addr = body.replace(/\n/g, '');
      cb(null, addr);
    }
  });
}

/*
 * Filter dns data and return target submain data
 * Always save full data so need a simple way to extract target subdomain data
 */
function getSubdomain(str) {
  if (typeof(str) != 'string') return;
  var result = {}, obj = {};
  var param = config.cloudflare;

  try {
    obj = JSON.parse(str);
  } catch(e) {
    console.error('Fail JSON format dns data!');
    return result;
  }

  if (obj.response &&
      obj.response.recs &&
      obj.response.recs.objs &&
      obj.response.recs.count &&
      obj.response.recs.count > 0) {
      var items = obj.response.recs.objs;
      items.forEach(function(item) {
        if (item.name === param.subdomain) {
          result = item;
        }
      });
  }
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
    }
  }, function(err, res, body) {
    if (err) {
      cb(err);
    } else {
      fs.writeFile(DNS_TMP, body, function(innErr) {
        if (innErr) {
          cb(innErr);
        } else {
          cb(null, body);
        }
      });
    }
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
    }
  }, function(err, res, body) {
    if (err) {
      cb(err);
    } else {
      cb(null, body);
    }
  });
}

/*
 * check if dns file exist
 * if exist then return target dns data
 * otherwise fetch dns data first
 */
function checkAvail(cb) {
  fs.exists(DNS_TMP, function(exists) {
    if (!exists) {
      getDnsInfo(function(getErr, getRes) {
        if (!getErr) {
          cb(null, getRes);
        }
      });
    } else {
      fs.readFile(DNS_TMP, function(readErr, readRes) {
        if (!readErr) {
          cb(null, readRes.toString());
        }
      });
    }
  });
}

/*
 * main function 
 */
var job = new CronJob('00 */5 * * * *', function() {
  async.parallel([
    async.apply(getIp),
    async.apply(checkAvail)
  ], function(err, results) {
    if (err) {
      console.error(err);
    } else {
      var addr = results[0];
      var dns = getSubdomain(results[1]);
      if (addr !== dns.content) {
        async.waterfall([
          function(callback) {
            var update = {
              id: dns.rec_id,
              content: addr
            };
            updateDnsInfo(update, function(error, updateRes){
              try {
                var data = JSON.parse(updateRes);
                if (data.result != 'success') {
                  callback(new Error('Update DNS data fail!'));
                } else {
                  callback(error);
                }
              } catch(e) {
                callback(e);
              }
            });
          },
          function(callback) {
            getDnsInfo(function(error, data) {
              callback(error, data);
            });
          },
          function(updateResult, callback) {
            fs.writeFile(DNS_TMP, updateResult, function(writeErr) {
              callback(writeErr);
            });
          }
        ], function(serErr) {
          if (serErr) {
            console.error('Has new data but cannot update dns file!');
          } else {
            console.log('Update dns from ' + dns.content + ' to ' + addr);
          }
        });
      } else {
        console.log('No need to update!');
      }
    }
  });
}, null, true);

// start as cronjob
job.start();
