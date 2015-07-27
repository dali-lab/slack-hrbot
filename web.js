//
var express = require("express");
var logfmt = require("logfmt");
var Slack = require("slack-client");
var request = require('request');
var app = express();
var port = process.env.PORT || 5000;
var http = require('http');
var https = require('https');
var bodyParser = require('body-parser');
var spreadsheets = require('./spreadsheets');

app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({
  extended: true
})); // to support URL-encoded bodies
app.use(logfmt.requestLogger());

var token = process.env.SLACK_BOT_TOKEN, // Add a bot at https://my.slack.com/services/new/bot and copy the token here.
  autoReconnect = true,
  autoMark = true;

var slack = new Slack(token, autoReconnect, autoMark);
var currentTerm = '15s'; // default at start
var currentWeek = 0; //default
var currentMembers = [];
var currentGroups = [];
var currentChannels = [];

var makeMention = function(userId) {
  return '@' + userId;
};

var isDirect = function(userId, messageText) {
  var userTag = makeMention(userId);
  // console.log('msg:'+messageText);
  // console.log('usertage:'+userTag);
  // console.log('other: ' + messageText.substr(0, userTag.length));
  // console.log('count:' + messageText.length);
  // console.log('count2:' + userTag.length);
  return messageText &&
    messageText.length >= userTag.length &&
    messageText.substr(0, userTag.length) == userTag;
};

var getHumansForChannel = function(channel) {
  if (!channel) return [];
  return (channel.members || []).map(function(id) {
    return slack.users[id];
  });
};

var getOnlineHumansForChannel = function(channel) {
  return getHumansForChannel(channel).filter(function(u) {
    return !!u && !u.is_bot && u.presence === 'active';
  });
};



slack.on('open', function() {
  var unreads = slack.getUnreadCount();

  channels = Object.keys(slack.channels)
    .map(function(k) {
      return slack.channels[k];
    })
    .filter(function(c) {
      return c.is_member;
    })
    .map(function(c) {
      return c.name;
    });

  groups = Object.keys(slack.groups)
    .map(function(k) {
      return slack.groups[k];
    })
    .filter(function(g) {
      return g.is_open && !g.is_archived;
    })
    .map(function(g) {
      return g.name;
    });

  currentMembers = getHumansForChannel(slack.getGroupByName(currentTerm))
    .filter(function(human) {
      return human.name != slack.self.name;
    })
    .map(function(human) {
      return human.name;
    });

  console.log('Welcome to Slack. You are @%s of %s', slack.self.name, slack.team.name);
  console.log('You are in: %s', channels.join(', '));
  console.log('As well as: %s', groups.join(', '));
  console.log('You have %s unread ' + (unreads === 1 ? 'message' : 'messages'), unreads);
  console.log(currentTerm + ' members are: ' + currentMembers.join(', '));

});

slack.on('message', function(message) {

  var type = message.type,
    channel = slack.getChannelGroupOrDMByID(message.channel),
    user = slack.getUserByID(message.user),
    time = message.ts,
    text = message.text,
    response = '';

  var trimmed = message.text.substr(makeMention(slack.self.id).length).trim(),
  trimmed = trimmed.replace(/^:/, '');

  console.log('Received: %s %s @%s %s "%s"', type, (channel.is_channel ? '#' : '') + channel.name, user.name, time, trimmed);

  //TODO: check for isDIrect in some way
  if (type == 'message' ) {
    console.log('contacted: ' + channel.name + ':' + user.name + ':' + trimmed);
    var anum = message.text.match( /\d+/g );
    console.log(anum);
    if (anum && anum.length>0) {
        channel.send("You're saying you worked *"+anum[0]+"* hours last week?");
    } else {
      channel.send("What? I'm simple, I only understand numbers.");
    }
  }

});

slack.on('error', function(error) {
  console.error('Error: %s', error);
});



//main promise chain, get configs first
spreadsheets.getHRConfigs().then(function(configs) {
  currentTerm = configs.currentTerm;
  currentWeek = configs.currentWeek;
  slack.login();
}).catch(function(err) {
  console.log(err);
});

//routes

app.get('/', function(req, res) {
  res.send('Hello World!');
});

app.get('/test', function(req, res) {
  //var ret = spreadsheets.test();
  currentMembers.forEach(function(member) {
    console.log(member);
    var s = slack.getDMByName(member);
    if (s) {
      s.send('how many hours did you work this past week?');
    } else {
      console.log("couldn't dm: ", member);
    }
  });


  res.send('testing complete');
});


// var staffGroup = slack.getGroupByName('staff');
//       staffGroup.send(response);

// var mnGroup = slack.getGroupByName('mn');
//     mnGroup.send(response);

var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log("Listening on " + port);
});
