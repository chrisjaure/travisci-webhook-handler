# travisci-webhook-handler

Travis CI allows you to register **[Webhooks](http://docs.travis-ci.com/user/notifications/#Webhook-notification)** for your builds. Each time an event occurs on your build, the webhook address you register can be configured to be pinged with details.

This library is a small handler for Node.js web servers that handles all the logic of receiving and verifying webhook requests from Travis CI.

Inspired by [github-webhook-handler](https://github.com/rvagg/github-webhook-handler).

## Example

```js
var http = require('http')
var createHandler = require('travisci-webhook-handler')
var handler = createHandler({ path: '/webhook', token: 'mytoken' })

http.createServer(function (req, res) {
  handler(req, res, function (err) {
    res.statusCode = 404
    res.end('no such location')
  })
}).listen(7777)

handler.on('error', function (err) {
  console.error('Error:', err.message)
})

handler.on('success', function (event) {
  console.log('Build %s success for %s branch %s',
    event.payload.number,
    event.payload.repository.name,
    event.payload.branch)
})

handler.on('failure', function (event) {
    console.log('Build failed!')
})

handler.on('start', function (event) {
    console.log('Build started!')
})
```

## API

travisci-webhook-handler exports a single function, use this function to *create* a webhook handler by passing in an *options* object. Your options object should contain:

 * `"path"`: the complete case sensitive path/route to match when looking at `req.url` for incoming requests. Any request not matching this path will cause the callback function to the handler to be called (sometimes called the `next` handler).
 * `"token"`: this is a token used for creating the SHA2 hash of the GitHub username, the name of the repository, and your Travis CI token. This can be found in your profile page. Any request not delivering an `Authorization` header that matches the signature generated using this key will be rejected and cause an `"error"` event (also the callback will be called with an `Error` object).

The resulting **handler** function acts like a common "middleware" handler that you can insert into a processing chain. It takes `request`, `response`, and `callback` arguments. The `callback` is not called if the request is successfully handled, otherwise it is called either with an `Error` or no arguments.

The **handler** function is also an `EventEmitter` that you can register to listen to any of the following event types: `"start"`, `"success"`, and `"failure"`. Note that the `"error"` event will be liberally used, even if someone tries the end-point and they can't generate a proper signature, so you should at least register a listener for it or it will throw.

Additionally, there is a special `'*'` even you can listen to in order to receive _everything_.

## License

**travisci-webhook-handler** is Copyright (c) 2015 Chris Jaure and licensed under the MIT License. All rights not explicitly granted in the MIT License are reserved. See the included [LICENSE.md](./LICENSE.md) file for more details.
