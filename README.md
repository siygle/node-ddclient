## node-ddclient

Cause current ddclient not work in cloudflare DNS service so just implement a simple one in nodejs.   
It only work for cloudflare for now.

Inspired by [cloudflare-ddclient](https://github.com/vedarthk/cloudflare-ddclient).

### Install

Just execute node-ddclient and put a server config at the same level of node-ddclient.

```
module.exports = {
  getIp: 'http://ifconfig.me/ip',
  cloudflare: {
    email: "youremail@example.com",
    apikey: "API_TOKEN",
    domain: "DOMAIN",
    subdomain: "SUB-DOMAIN"
  }
};
```

### Run as system daemon

Use cron and daemon to run as daemon regular. You can copy node-ddclient.conf to `/etc/init` to setup upstart, don't forget to change YOUR_NODE_DDCLIENT_PATH to real file path.
