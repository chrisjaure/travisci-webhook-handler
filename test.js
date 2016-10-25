var test = require('tape');
var handler = require('./handler');
var through2 = require('through2');
var NodeRSA = require('node-rsa');

var key = new NodeRSA({b: 1024}, {signingScheme: 'sha1'});
var public_key = key.exportKey('public');

function mkReq (url) {
  var req = through2()
  req.url = url
  req.headers = {
      'signature'         : 'bogus'
    , 'host'              : 'some-host'
    , 'travis-repo-slug'  : 'bogus'
  }
  return req
}

function mkRes() {
    var res = {
        writeHead: function(statusCode, headers) {
            res.$statusCode = statusCode;
            res.$headers = headers;
        },
        end: function(content) {
            res.$end = content;
        }
    };

    return res;
}

test('handler without full options throws', function (t) {
    t.equal(typeof handler, 'function', 'handler exports a function');
    t.throws(handler, /must provide an options object/, 'throws if no options');
    t.throws(handler.bind(null, {}), /must provide a 'path' option/, 'throws if no path option');
    t.throws(handler.bind(null, { path: '/' }), /must provide a 'public_key' option/, 'throws if no public_key option');
    t.end();
});

test('handler acts like an event emitter', function (t) {
    var h = handler({ path: '/some/url', public_key: public_key });

    t.plan(5);

    t.equal(typeof h.on, 'function', 'has h.on()');
    t.equal(typeof h.emit, 'function', 'has h.emit()');
    t.equal(typeof h.removeListener, 'function', 'has h.removeListener()');

    h.on('ping', function (pong) {
        t.equal(pong, 'pong', 'got event');
    });

    h.emit('ping', 'pong');

    t.throws(h.emit.bind(h, 'error', new Error('threw an error')), /threw an error/, 'acts like an EE');
});

test('handler ignores invalid urls', function(t) {
    var options = {
        path: '/some/url',
        public_key: public_key
    };
    var h = handler(options);

    t.plan(3);

    h(mkReq('/'), mkRes(), function(err) {
        t.error(err, 'request ignored');
    });

    // near match
    h(mkReq('/some/url/'), mkRes(), function(err) {
        t.error(err, 'request ignored');
    });

    // partial match
    h(mkReq('/some'), mkRes(), function(err) {
        t.error(err, 'request ignored');
    });
});

test('handler accepts a signed payload that passes verification', function (t) {
  t.plan(4)

  var obj  = { some: 'travis', object: 'with', properties: true, status: 0 }
    , json = JSON.stringify(obj)
    , h    = handler({ path: '/', public_key: public_key })
    , req  = mkReq('/')
    , res  = mkRes()

  req.headers['signature'] = key.sign(obj, 'base64', 'base64')

  h.on('success', function(req) {
    t.deepEqual(req, { event: 'success', payload: obj, url: '/', host: 'some-host' })
    t.equal(res.$statusCode, 200, 'correct status code')
    t.deepEqual(res.$headers, { 'content-type': 'application/json' })
    t.equal(res.$end, '{"ok":true}', 'got correct content')
  })

  h(req, res, function (err) {
    t.error(err)
    t.fail(true, 'should not get here!')
  })

  process.nextTick(function () {
    req.end('payload=' + json);
  })
})

test('handler rejects a signed payload that fails verification', function (t) {
  t.plan(4)

  var obj  = { some: 'travis', object: 'with', properties: true }
    , json = JSON.stringify(obj)
    , h    = handler({ path: '/', public_key: public_key })
    , req  = mkReq('/')
    , res  = mkRes()

  req.headers['signature'] = key.sign(obj, 'base64', 'base64')
  // break signage by a tiny bit
  req.headers['signature'] = '0' + req.headers['signature'].substring(1)

  h(req, res, function (err) {
    t.ok(err, 'got an error')
    t.equal(res.$statusCode, 400, 'correct status code')
    t.deepEqual(res.$headers, { 'content-type': 'application/json' })
    t.equal(res.$end, '{"error":"Signed payload does not match signature"}', 'got correct content')
  })

  h.on('success', function(req) {
    t.fail(true, 'should not get here!')
  })

  process.nextTick(function () {
    req.end('payload=' + json);
  })
})

test('handler accepts valid urls', function(t) {
    var options = {
        path: '/some/url',
        public_key: public_key
    };
    var h = handler(options);

    t.plan(1);

    h(mkReq('/some/url'), mkRes(), function(err) {
        t.error(err);
        t.fail('should not call');
    });

    h(mkReq('/some/url?test=param'), mkRes(), function(err) {
        t.error(err);
        t.fail('should not call');
    });

    setTimeout(t.pass.bind(t, 'done'));
});

test('handler accepts form payload', function (t) {
    var options = {
        path: '/some/url',
        public_key: public_key
    };
    var h = handler(options);
    var req = mkReq('/some/url');
    var res = mkRes();
    var json = { status: 0 };

    t.plan(5);

    req.headers['signature'] = key.sign(json, 'base64', 'base64')

    h.on('success', function(req) {
        t.deepEqual(req.payload, json, 'payload is correct');
        t.equal(req.event, 'success', 'event is correct');
        t.deepEqual(res.$headers, { 'content-type': 'application/json' }, 'json header set');
        t.equal(res.$end, '{"ok":true}', 'got correct content');
        t.pass('success event emitted');
    });

    h(req, res, function(err) {
        t.error(err);
        t.fail('should not call');
    });

    process.nextTick(function () {
        req.end('payload=' + JSON.stringify(json));
    });
});

test('handler emits start event', function (t) {
    var options = {
        path: '/some/url',
        public_key: public_key
    };
    var h = handler(options);
    var req = mkReq('/some/url');
    var res = mkRes();
    var json = { status: 1, status_message: 'Pending' };

    t.plan(1);

    req.headers['signature'] = key.sign(json, 'base64', 'base64')

    h.on('start', function() {
        t.pass('start event emitted');
    });

    h(req, res, function(err) {
        t.error(err);
        t.fail('should not call');
    });

    process.nextTick(function () {
        req.end('payload=' + JSON.stringify(json));
    });
});

test('handler emits failure event', function (t) {
    var options = {
        path: '/some/url',
        public_key: public_key
    };
    var h = handler(options);
    var req = mkReq('/some/url');
    var res = mkRes();
    var json = { status: 1, status_message: 'Broken' };

    t.plan(1);

    req.headers['signature'] = key.sign(json, 'base64', 'base64')

    h.on('failure', function() {
        t.pass('failure event emitted');
    });

    h(req, res, function(err) {
        t.error(err);
        t.fail('should not call');
    });

    process.nextTick(function () {
        req.end('payload=' + JSON.stringify(json));
    });
});
