var jsonRPC     = require('maki-jsonrpc');
var pathToRegex = require('path-to-regexp');

var MyWebSocketServer = function() {

};

MyWebSocketServer.prototype.bind = function( maki ) {
  var self = this;

  console.log('bind()')

  // prepare the websocket server
  var WebSocketServer = require('ws').Server;
  var wss = new WebSocketServer({
    server: maki.httpd
  });
  
  self.server = wss;

  self.server.on('connection', function(ws) {
    console.log('connection.')

    ws.on('error', function(err) {
      if (maki.debug) console.log('[SOCKETS] error', err );
    });

    // determine appropriate resource / handler
    for (var route in maki.routes) {
      var regex = pathToRegex( route );
      // test if this resource should handle the request...
      if ( regex.test( ws.upgradeReq.url ) ) {
        console.log('[SOCKETS] matched ' + ws.upgradeReq.url);
        
        function handler(channel, message) {
          console.log('handler', channel );
          var message = JSON.parse( message );

          ws.send( (new jsonRPC('patch' , {
              channel: channel
            , ops: message
          })).toJSON() , function(err) {
            if (err && maki.debug) console.log('[SOCKETS] ERROR!', err);
          });
        };

        // unique identifier for our upcoming mess
        ws.id = ws.upgradeReq.headers['sec-websocket-key'];

        // make a mess
        ws.pongTime = (new Date()).getTime();// 
        ws.subscriptions = [ ws.upgradeReq.url ];

        console.log('binding new message event...', ws.id , Object.keys( maki.clients ) , '+1' );

        maki.messenger.on('message', handler );
        //maki.messenger.subscribe( ws.upgradeReq.url );

        console.log('listeners', maki.messenger.listeners('message').length );
        console.log('listeners', maki.messenger.listeners('message') );// process.exit();
        console.log('listeners', maki.messenger._events );// process.exit();

        // handle events, mainly pongs
        ws.on('message', function handleClientMessage(msg) {
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
          
          if (data.result === 'pong') {
            ws.pongTime = (new Date()).getTime();
          }

          switch( data.method ) {
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
          console.log('close');
          if (maki.debug) console.log('[SOCKETS] cleaning expired websocket: ', ws.upgradeReq.headers['sec-websocket-key'] );

          //ws.removeAllListeners();
          
          console.log('before', maki.messenger.listeners('message').length );
          
          maki.messenger.removeListener( 'message', handler );
          
          console.log('after', maki.messenger.listeners('message').length );
          
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

  self.server.forEachClient = function(fn) {
    var self = this;
    for (var i in this.clients) {
      fn( this.clients[ i ] , i );
    }
  }
  self.server.markAndSweep = function() {
    var message = new jsonRPC('ping');
    self.server.broadcast( message.toJSON() );

    var now = (new Date()).getTime();
    this.forEachClient(function( client , id ) {
      // if the last pong from this client is less than the timeout,
      // emit a close event and let the handler clean up after us.
      if (client.pongTime < now - maki.config.sockets.timeout) {
        console.log('would normally emit a close event here', client.id , client.pongTime , now - maki.config.sockets.timeout );
        client.emit('close');
      }
    });
  }
  self.server.broadcast = function(data) {
    for (var i in this.clients) {
      this.clients[ i ].send( data );
    }
  };
}

module.exports = MyWebSocketServer;
