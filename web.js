// Nook Harquail
// 

var express = require("express");
var logfmt = require("logfmt");
var MailChimpAPI = require('mailchimp').MailChimpAPI;
var app = express();
var bodyParser = require('body-parser')
  app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use( bodyParser.urlencoded({ extended: true }) ); // to support URL-encoded bodies
var http = require('http');
var https = require('https');
app.use(logfmt.requestLogger());

var affiliations = ['student','alum','faculty','other'];


function notifyStaff(data){
	
	var options2 = {
	  host: 'hooks.slack.com',
	  port: 443,
	  path: process.env.SLACK_WEBHOOK_URL,
	  method: 'POST',
    headers: {
        accept: '*/*'
    }
	};
	
	var request = https.request(options2, function(res) {
	  console.log('STATUS: ' + res.statusCode);
	  console.log('HEADERS: ' + JSON.stringify(res.headers));
	  res.setEncoding('utf8');
	  res.on('data', function (chunk) {
	    console.log('BODY: ' + chunk);
	  });
	});
	request.on('error', function(e) {
	  console.log('problem with request: ' + e.message);
	});
	request.write(JSON.stringify(data));
  // console.log(JSON.stringify(data));
	request.end();	
}

app.get('/notifyOfSubscribe', function(req,res){
  res.send('hello, mailchimp');
});

app.post('/notifyOfSubscribe', function(req,res){


  var slackPost;
  if(req.body.type == 'unsubscribe'){
    slackPost = 'User unsubscribed from DALI Newsletter: '; 
  }
  if(req.body.type == 'subscribe'){
    slackPost = 'User subscribed to DALI Newsletter: '; 
  }
  
  slackPost = slackPost + req.body.data.email;

  var data = {
    'text': slackPost    
  };
  notifyStaff(data);
  res.send('hi');
});

app.post('/', function(req,res){
	
  var text = req.body.text;
  var token = req.body.token;
  console.log('user: ' + req.body.user_id + ' | ' + req.body.user_name);
  var responded = false;
  
  if(token == process.env.SLACK_TOKEN){
    
    var textArray = text.split(" ");
    var startLength = textArray.length;
    var firstName;
    var lastName;
    var email;
    var affiliation;
    
    var potentialAffiliation = textArray.pop();
    
    //if it is not an affiliation, assume the last element was an email
    if (affiliations.indexOf(potentialAffiliation) == -1){
      email = potentialAffiliation
    }
    else{
      affiliation = potentialAffiliation
      email = textArray.pop();
    }
    
    lastName = textArray.pop();
    
    //if there is anything left, concat it to create the first name
    if(textArray.length > 0){
      firstName = '';
      for (var i = 0; i < textArray.length; ++i) {
        firstName = firstName + ' ' +  textArray[i];
      }   
    }
    else{
      firstName = lastName;
      lastName = undefined;
         
    }
  }
         
  if(email == ''){
    res.send('/chimp FirstName LastName name@email.com affiliation.  Everything but email is optional.  Possible affiliations: student, faculty, alum, other');	
  }else{
    subscribeToMailchimp(firstName, lastName, email, affiliation,res);
  }
  
	
});


function subscribeToMailchimp(firstName, lastName, emailIn, affiliation,res){
  try {
    var api = new MailChimpAPI(process.env.MAILCHIMP_KEY, { version : '2.0' });
  } catch (error) {
    console.log(error.message);
  }
  var apiAffiliation = "Students";
  switch (affiliation){
    //var affiliations = ['student','alum','faculty','other'];
  case  affiliations[0]:
    //student
    apiAffiliation = "Students"
    break;
  case  affiliations[1]:
    //alum
    apiAffiliation = "Alumni"
    break;
  case  affiliations[2]:
    //faculty
    apiAffiliation = "Faculty/Staff"
    break;
  case  affiliations[3]:
    //other
    apiAffiliation = "Other"
    break;
            
  }
    
    
  var mailchimpRequest = {
    id: '7041ef63c4',
    email: { email: emailIn},
    double_optin: false,
    merge_vars: {
      EMAIL: emailIn,
      FNAME: firstName,
      LNAME: lastName,
      groupings:[ {id: '11485', groups: [apiAffiliation] }]
    }
  };

  if(!firstName){
    firstName = '';
  }
  if(!lastName){
    lastName = '';
  }
  api.call('lists', 'subscribe', mailchimpRequest, function (error, data) {
    if (error){
      res.send(error.message);
    }
    else{
      res.send('Subscribed ' + firstName + '|' + lastName + ' {' + emailIn +'} ' +' in group: ' +apiAffiliation );
    }
  });
}

//removes the last item from an array and returns it
function lastItemByRemovingFromArray(ray){
  var index = textArray.length - 1;
  var last_element = ray[index];
  ray = ray.splice(index, 1);
  return last_element;
}

app.get('/', function(req, res) {
  res.send('Hello World!');
});


var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log("Listening on " + port);
});
