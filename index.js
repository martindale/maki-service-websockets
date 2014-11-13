var JSONRPC     = require('maki-jsonrpc');
var pathToRegex = require('path-to-regexp');

var WebSocketServer = function() {
  // LOL.  constructors are for the dogs and the vagrants!
};

WebSocketServer.prototype.bind = function( maki ) {
  var self = this;
  
  self.maki = maki;

  // prepare the websocket server
  var WebSocketServer = require('ws').Server;
  var wss = new WebSocketServer({
    server: maki.httpd
  });
  
  self.server = wss;

  self.server.on('connection', function(ws) {

    ws.on('error', function(err) {
      if (maki.debug) console.log('[SOCKETS] error', err );
    });

    // determine appropriate resource / handler
    for (var route in maki.routes) {
      var regex = pathToRegex( route );
      // test if this resource should handle the request...
      if ( regex.test( ws.upgradeReq.url ) ) {
        
        function handler(channel, message) {
          var message = JSON.parse( message );
          var jsonrpc = new JSONRPC('patch' , {
              channel: channel
            , ops: message
          });

          ws.send( jsonrpc.toJSON() , function(err) {
            if (err && maki.debug) console.log('[SOCKETS] ERROR!', err);
          });
        };

        // unique identifier for our upcoming mess
        ws.id = ws.upgradeReq.headers['sec-websocket-key'];

        // make a mess
        ws.subscriptions = [ ws.upgradeReq.url ];

        maki.messenger.on('message', handler );
        //maki.messenger.subscribe( ws.upgradeReq.url );

        // handle events, mainly pongs
        ws.on('message', function handleClientMessage(msg) {// 
          
          var timeReceived = now = (new Date()).getTime();
          
          // update the pongTime based on this new message
          ws.pongTime = timeReceived;
          console.log('ws.pongTime', ws.pongTime );
          
          
          console.log('OHEYYYYY TIMEOUT' , now - self.maki.config.sockets.timeout );
          
          
          try {
            var data = JSON.parse( msg );
          } catch (e) {
            return ws.send(JSON.stringify({
              'jsonrpc': '2.0',
              'error': {
                'code': 32700,
                'message': 'Unable to parse submitted JSON message.'
              }
            }));
          }

          // experimental JSON-RPC implementation
          if (data.jsonrpc !== '2.0') {
            return ws.send(JSON.stringify({
              'jsonrpc': '2.0',
              'error': {
                'code': 32600,
                'message': 'No jsonrpc version specified.'
              }
            }));
          }

          switch( data.method ) {
            case 'echo':
              ws.send( msg );
            break;
            case 'subscribe':
              // fail early
              if (!data.params.channel) {
                return ws.send({
                  'jsonrpc': '2.0',
                  'error': {
                    'code': 32602,
                    'message': 'Missing param: \'channel\''
                  },
                  'id': data.id
                })
              }
              
              if (maki.debug) console.log( '[SOCKETS] subscribe event, ' , data.params.channel );

              // maki.messenger.subscribe( data.params.channel );
              // TODO: uncomment the above line to re-support subscribe messages
              // this will involve checking for current subscriptions and only 
              // subscribing when complete
              
              
              // this was a redis feature, but we're no longer using redis.
              // TODO: add this functionality to messenger.
              /*/var subscriptions = Object.keys( maki.messenger.subscription_set ).filter(function(x) {
                return x;
              }).map(function(x) {
                return x.substring(4); // removes `sub ` from redis set
              });
              
              if (subscriptions.length > 10) {
                if (maki.debug) console.log('[SOCKETS] warning, oversubscribed');
              }/**/
              
              ws.send({
                'jsonrpc': '2.0',
                'result': 'success',
                'id': data.id
              });

            break;
            case 'unsubscribe':
              // fail early
              if (!data.params.channel) {
                return ws.send({
                  'jsonrpc': '2.0',
                  'error': {
                    'code': 32602,
                    'message': 'Missing param: \'channel\''
                  },
                  'id': data.id
                })
              }

              if (maki.debug) console.log( '[SOCKETS] unsubscribe event, ' , data.params.channel );

              //maki.messenger.unsubscribe( data.params.channel );
              ws.send({
                'jsonrpc': '2.0',
                'result': 'success',
                'id': data.id
              });

            break;
          }
        });

        // cleanup our mess
        ws.on('close', function() {// 
          if (maki.debug) console.log('[SOCKETS] cleaning closed websocket: ', ws.upgradeReq.headers['sec-websocket-key'] );

          maki.messenger.removeListener( 'message', handler );
          //maki.messenger.unsubscribe( ws.upgradeReq.url );
          
          if (maki.clients[ ws.upgradeReq.headers['sec-websocket-key'] ]) {
            maki.clients[ ws.upgradeReq.headers['sec-websocket-key'] ].removeAllListeners();
            delete maki.clients[ ws.upgradeReq.headers['sec-websocket-key'] ];
          }
        });
        
        maki.clients[ ws.id ] = ws;

        return; // exit the 'connection' handler
        break; // break the loop
      }
    }
    if (maki.debug) console.log('[SOCKETS] unhandled socket upgrade' , ws.upgradeReq.url );
  });
};

WebSocketServer.prototype.forEachClient = function(fn) {
  var self = this;
  for (var i in self.maki.clients) {
    fn( self.maki.clients[ i ] , i );
  }
};

WebSocketServer.prototype.markAndSweep = function() {
  var self = this;
  var message = new JSONRPC('ping');

  self.broadcast( message.toJSON() );

  var MAXIMUM_CPU_LAG = 1000;
  var now = (new Date()).getTime();
  var old = now - self.maki.config.sockets.timeout - MAXIMUM_CPU_LAG;
  
  self.forEachClient(function( client , id ) {
    // if the last pong from this client is less than the timeout,
    // emit a close event and let the handler clean up after us.
    if (client.pongTime < old) {
      console.log('would normally emit a close event here', client.id , client.pongTime , old , 'diff ' + (client.pongTime - old));
      client.emit('close');
    }
  });
};

WebSocketServer.prototype.broadcast = function(data) {
  var self = this;
  for (var i in self.maki.clients) {
    self.maki.clients[ i ].send( data );
  }
};

module.exports = WebSocketServer;
