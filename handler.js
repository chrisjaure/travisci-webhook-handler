var EventEmitter = require('events').EventEmitter;
var NodeRSA = require('node-rsa');
var formBody = require('body/form');

function bindEmitter(obj, emitter) {
    var methods = 'addListener,on,once,removeListener,removeAllListeners,setMaxListeners,listeners,emit';
    methods.split(',').forEach(function (fn) {
        obj[fn] = emitter[fn].bind(emitter);
    });
}

function create(options) {
    if (typeof options !== 'object') {
        throw new TypeError('must provide an options object');
    }

    if (typeof options.path !== 'string') {
        throw new TypeError('must provide a \'path\' option');
    }

    if (typeof options.public_key !== 'string') {
        throw new TypeError('must provide a \'public_key\' option');
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

        var repoSlug = req.headers['travis-repo-slug'];

        var sig   = req.headers['signature']

        if (!sig) {
            return hasError('No Signature found on request');
        }
        if (!repoSlug) {
            return hasError('No repo found on request');
        }

        formBody(req, {}, function (err, data) {
            if (err) {
                return hasError(err.message);
            }

            var key = new NodeRSA(options.public_key, {signingScheme: 'sha1'});

            if (!key.verify(JSON.parse(data.payload), sig, 'base64', 'base64'))
                return hasError('Signed payload does not match signature')

            var result;
            try {
                result = JSON.parse(data.payload);
            } catch (err) {
                return hasError(err.message);
            }

            res.writeHead(200, { 'content-type': 'application/json' });
            res.end('{"ok":true}');

            var event = (result.status === 0) ? 'success' : 'failure';
            if (event === 'failure' && result.status_message === 'Pending') {
                event = 'start';
            }
            var emitData = {
                payload: result,
                host: req.headers['host'],
                url: req.url,
                event: event
            };

            handler.emit('*', emitData);
            handler.emit(event, emitData);

        });
    };
    handler.emitter = new EventEmitter();
    bindEmitter(handler, handler.emitter);
    return handler;
}

module.exports = create;
