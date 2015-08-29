var test = require('tape');
var crypto = require('crypto');
var handler = require('./handler');
var through2 = require('through2');

function signRequest (repoSlug, userToken) {
    return crypto.createHash('sha256').update(repoSlug + userToken).digest('hex');
}

function mkReq(url) {
    var req = through2();
    req.url = url;
    req.headers = {
        'authorization': signRequest('bogus', 'bogus'),
        'travis-repo-slug': 'bogus'
    };

    return req;
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
    t.throws(handler.bind(null, { path: '/' }), /must provide a 'token' option/, 'throws if no token option');
    t.end();
});

test('handler acts like an event emitter', function (t) {
    var h = handler({ path: '/some/url', token: 'bogus' });

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
        token: 'bogus'
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

test('handler rejects incorrect authentication', function (t) {
    var options = {
        path: '/some/url',
        token: 'bogus'
    };
    var h = handler(options);
    var req = mkReq('/some/url');
    req.headers.authorization = 'bogus';

    t.plan(1);

    h(req, mkRes(), function(err) {
        t.equal(err.message, 'Authentication does not match', 'authentication error is passed');
    });
});

test('handler accepts valid urls', function(t) {
    var options = {
        path: '/some/url',
        token: 'bogus'
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
        token: 'bogus'
    };
    var h = handler(options);
    var req = mkReq('/some/url');
    var res = mkRes();
    var json = { status: 0 };

    t.plan(5);

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
        token: 'bogus'
    };
    var h = handler(options);
    var req = mkReq('/some/url');
    var res = mkRes();
    var json = { status: 1, status_message: 'Pending' };

    t.plan(1);

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
        token: 'bogus'
    };
    var h = handler(options);
    var req = mkReq('/some/url');
    var res = mkRes();
    var json = { status: 1, status_message: 'Broken' };

    t.plan(1);

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
