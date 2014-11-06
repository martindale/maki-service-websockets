var assert = require('assert');

var Maki = require('maki');
var WebSocketServer = require('../');

var WebSocket = require('ws');
var rest = require('restler');

before(function(done) {
  done();
});

describe('WebSocketServer', function() {

  it('should expose a constructor', function(){
    assert(typeof WebSocketServer, 'function');
  });
  
  
  it('should bind to a Maki app', function() {
    var maki = new Maki();

    maki.httpd = require('http').createServer();
    
    maki.socks = new WebSocketServer();
    maki.socks.bind( maki );

  });
  
  it('should accept connections', function( done ) {
    var maki = new Maki();
    
    maki.httpd = require('http').createServer();
    
    maki.socks = new WebSocketServer();
    maki.socks.bind( maki );
    
    maki.httpd.listen();
    var address = maki.httpd.address();
    
    var ws = new WebSocket('ws://localhost:' + address.port + '/widgets' );
    ws.on('open', function() {
      done();
    });
    
  });
  
  it('should receive messages', function( done ) {
    var maki = new Maki();
    
    maki.define('Widget', {
      attributes: {
        name: String
      }
    });
    
    maki.httpd = require('http').createServer();
    
    maki.socks = new WebSocketServer();
    maki.socks.bind( maki );
    
    maki.httpd.listen();
    var address = maki.httpd.address();
    
    var ws = new WebSocket('ws://localhost:' + address.port + '/widgets' );
    ws.on('open', function() {
      
      console.log('opppppppen')
      
      ws.on('message', function(data) {
        console.log('message', data);
        done();
      });
      
      rest.post('http://localhost:' + address.port + '/widgets', {
        data: {
          name: Math.random()
        }
      }).on('complete', function(data) {
        console.log(data);
      });

    });
    
  });
  
  
});
