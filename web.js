// Nook Harquail
var express = require("express");
var logfmt = require("logfmt");
var Slack = require("slack-client");
var request = require('request');
var app = express();
var port = process.env.PORT || 5000;
var bodyParser = require('body-parser')
app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({
  extended: true
})); // to support URL-encoded bodies
var http = require('http');
var https = require('https');
app.use(logfmt.requestLogger());

var token = process.env.SLACK_BOT_TOKEN, // Add a bot at https://my.slack.com/services/new/bot and copy the token here.
  autoReconnect = true,
  autoMark = true;

var slack = new Slack(token, autoReconnect, autoMark);
var lastUrgentMessageTime = 0.0;

slack.on('open', function() {

  var channels = [],
    groups = [],
    unreads = slack.getUnreadCount(),
    key;

  for (key in slack.channels) {
    if (slack.channels[key].is_member) {
      channels.push('#' + slack.channels[key].name);
    }
  }

  for (key in slack.groups) {
    if (slack.groups[key].is_open && !slack.groups[key].is_archived) {
      groups.push(slack.groups[key].name);
    }
  }

  console.log('Welcome to Slack. You are @%s of %s', slack.self.name, slack.team.name);
  console.log('You are in: %s', channels.join(', '));
  console.log('As well as: %s', groups.join(', '));
  console.log('You have %s unread ' + (unreads === 1 ? 'message' : 'messages'), unreads);
});

slack.on('message', function(message) {

  var type = message.type,
    channel = slack.getChannelGroupOrDMByID(message.channel),
    user = slack.getUserByID(message.user),
    time = message.ts,
    text = message.text,
    response = '';

  //if the message is in urgent-important
  if (type === 'message' && channel.name === 'urgent-important') {

    console.log('Received: %s %s @%s %s "%s"', type, (channel.is_channel ? '#' : '') + channel.name, user.name, time, text);

    //only flash lights if it's been 90 seconds since the last message
    if (message.ts - lastUrgentMessageTime > 90) {
      request({
          url: "http://dali-lights.herokuapp.com",
          method: "POST",
          json: {
            text: "pulse"
          },
        },
        function(error, response, body) {
          if (!error && response.statusCode == 200) {
            console.log(body)
          }
        }
      );

      console.log('!!!message in todos!!!');
    }
    lastUrgentMessageTime = parseFloat(time);
  }
});

slack.on('error', function(error) {

  console.error('Error: %s', error);
});

slack.login();

app.get('/', function(req, res) {
  res.send('Hello World!');
});

app.get('/trello-webhook', function(req, res) {
  res.send('Hello Trello!');


  console.log(req);

});

//called by trello when cards are created
app.post('/trello-webhook', function(req, res) {
  res.send('Hello World!');
  console.log('REQUEST POSTED\n' + JSON.stringify(req.body));
  
  //the kind of thing that was done
  var actionType = req.body.action.type;
  //description of thing
  var brief =  req.body.action.data.card.name;
  
  
  //mapping of trello boards to slack users
  var boardsAndPeople = {'Technical Director': '<@tim>','Administrations': '<@kaitlin>','Lead Designer': '<@alisonleung>','Marketing': '<@sofia.rainaldi>','Project Management1': '<@tim.serkes>','Project Management2':'<@sean.oh>','Digital Arts Apprentice': '<@mattstanton>','Mentor Tasks': 'mentors'};
         
  var TrelloNamesAndPeople = {'Tim Tregubov': '<@tim>','Lorie Loeb': '<@lorie>','Sean Oh': '<@sean.oh>','Kaitlin Maier': '<@kaitlin>','Alison Leung': '<@alisonleung>','Sofia Rainaldi': '<@sofia.rainaldi>','Tim Serkes': '<@tim.serkes>','Matt Stanton': '<@mattstanton>','Nook Harquail': '<@nook>','Marissa Allen': '<@marissa>','Runi Goswami': '<@runi>','Mentor Tasks': 'mentors'};

  //the name of the assigner
  var assigner = req.body.action.memberCreator.fullName;
  //link to the card
  var linky = req.body.action.data.card.shortLink;
  
  var staffGroup = slack.getGroupByName('staff');
  //a new card was created
  if(actionType == 'createCard'){
    //board the thing was posted on
    var boardAssignedTo = req.body.action.data.list.name;
    
    function taskassignedToBoard(board) {
      //person the thing was assigned to
      var asignee = boardsAndPeople[boardAssignedTo];
      var response = '_' + brief + '_ ' + 'assigned to ' + asignee + ' \nhttp://trello.com/c/'+ linky;
      staffGroup.send(response);
    }
                                                                                                                         
    if(boardAssignedTo == 'Project Management'){
      taskassignedToBoard('Project Management1');
      taskassignedToBoard('Project Management2');
    }
    else{
      taskassignedToBoard(boardAssignedTo);
    }                                                                                                                                                               
  }
  //card finished or updated
  else if(actionType == 'updateCard'){
      var destinationBoard = req.body.action.data.listAfter.name;
      //card completed
      if(destinationBoard == 'Done'){
      var response = 'completed by '+TrelloNamesAndPeople[assigner]+': _' + brief + '_ ' + ' \nhttp://trello.com/c/'+ linky;
      staffGroup.send(response);
      }
      //card updated
      else{
        var response = 'Trello card updated' + ' \nhttp://trello.com/c/'+ linky;
      }
  }
  
});

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log("Listening on " + port);
});
