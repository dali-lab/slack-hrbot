// Nook Harquail
var express = require("express");
var logfmt = require("logfmt");
var app = express();
var bodyParser = require('body-parser')
  app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use( bodyParser.urlencoded({ extended: true }) ); // to support URL-encoded bodies
var http = require('http');
var https = require('https');
app.use(logfmt.requestLogger());


function notifyStaff(){
	
//	var options2 = {
//	  host: 'hooks.slack.com',
//	  port: 443,
//	  path: process.env.SLACK_WEBHOOK_URL,
//	  method: 'POST',
//    headers: {
//        accept: '*/*'
//    }
//	};
//	
//	var request = https.request(options2, function(res) {
//	  console.log('STATUS: ' + res.statusCode);
//	  console.log('HEADERS: ' + JSON.stringify(res.headers));
//	  res.setEncoding('utf8');
//	  res.on('data', function (chunk) {
//	    console.log('BODY: ' + chunk);
//	  });
//	});
//	request.on('error', function(e) {
//	  console.log('problem with request: ' + e.message);
//	});
//	request.write(JSON.stringify(data));
//  // console.log(JSON.stringify(data));
//	request.end();	
}


app.get('/', function(req, res) {
  res.send('Hello World!');
});


var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log("Listening on " + port);
});
