var EventEmitter = require('events').EventEmitter;
var crypto = require('crypto');
var formBody = require('body/form');

function bindEmitter(obj, emitter) {
    var methods = 'addListener,on,once,removeListener,removeAllListeners,setMaxListeners,listeners,emit';
    methods.split(',').forEach(function (fn) {
        obj[fn] = emitter[fn].bind(emitter);
    });
}

function signRequest (repoSlug, userToken) {
    return crypto.createHash('sha256').update(repoSlug + userToken).digest('hex');
}

function create(options) {
    if (typeof options !== 'object') {
        throw new TypeError('must provide an options object');
    }

    if (typeof options.path !== 'string') {
        throw new TypeError('must provide a \'path\' option');
    }

    if (typeof options.token !== 'string') {
        throw new TypeError('must provide a \'token\' option');
    }

    var handler = function (req, res, callback) {
        if (req.url.split('?').shift() !== options.path) {
            return callback();
        }

        function hasError (msg) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: msg }));
            var err = new Error(msg);
            callback(err);
        }

        var repoSlug = req.headers['travis_repo_slug'];
        var sig = req.headers['authorization'];

        if (!sig) {
            return hasError('No authorization found on request');
        }
        if (!repoSlug) {
            return hasError('No repo found on request');
        }
        if (sig !== signRequest(repoSlug, options.token)){
            return hasError('Authentication does not match');
        }

        formBody(req, {}, function (err, data) {
            if (err) {
                return hasError(err.message);
            }
            var result;
            try {
                result = JSON.parse(data.payload);
            } catch (err) {
                return hasError(err.message);
            }

            res.writeHead(200, { 'content-type': 'application/json' });
            res.end('{"ok":true}');

            var emitData = {
                payload: result,
                host: req.headers['host'],
                url: req.url
            };
            var event = (result.status === 0) ? 'success' : 'failure';
            if (event === 'failure' && result.status_message === 'Pending') {
                event = 'start';
            }

            handler.emit('*', emitData);
            handler.emit(event, emitData);

        });
    };
    handler.emitter = new EventEmitter();
    bindEmitter(handler, handler.emitter);
    return handler;
}

module.exports = create;
