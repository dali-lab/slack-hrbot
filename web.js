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
var moment = require('moment');


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
var currentState = {};

var makeMention = function(userId) {
  return '<@' + userId + '>';
};

var isAtMention = function(userId, messageText) {
  var userTag = makeMention(userId);
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

var refreshConfigs = function() {
  return spreadsheets.getHRConfigs().then(function(configs) {
    currentTerm = configs.currentTerm;
    currentWeek = configs.currentWeek;
  })
};

var refreshSlack = function() {
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

    var weekday = moment().day();

    console.log('Slack! You are @%s (%s) of %s', slack.self.name, slack.self.id, slack.team.name);
    console.log('You are in: %s', channels.join(', '));
    console.log('As well as: %s', groups.join(', '));
    console.log('You have %s unread ' + (unreads === 1 ? 'message' : 'messages'), unreads);
    console.log(currentTerm + ' members are: ' + currentMembers.join(', '));
    console.log('current weekday: ' + weekday);

};

// run this to prompt members to submit their hours
var refreshAndAskHours = function() {
  return refreshConfigs()
  .then(function() {
    refreshSlack();
  })
  .then(function() {
    currentMembers.forEach(function(member) {
      console.log('about to ask: ' + member);
      var timeouttime = moment().subtract(1, 'days');
      if (currentState[member] && currentState[member].lastcontact.isAfter(timeouttime)) {
        console.log('not asking: '+member + ' cause already asked on '+ currentState[member].lastcontact);
      } else {
        var msg = "Hi "+member+"!  I'm your friendly hr-bot! How many hours did you work this past week (week "+currentWeek+" of "+currentTerm+")?";
        var channel = slack.getDMByName(member);
        // if no existing dm then open one
        if (!channel) {
          var memberid = slack.getUserByName(member).id;
          console.log('getting id for %: %s', member, memberid);
          slack.openDM(slack.getUserByName(member).id, function(dm) {
            channel = slack.getDMByName(member);
            channel.send(msg);
          });
        } else {
          channel.send(msg);
        }
      }
    });
  })
  .catch(function(err) {
    console.log(err);
  });
};


slack.on('open', function() {
  refreshSlack();
});

slack.on('message', function(message) {

  var type = message.type,
    channel = slack.getChannelGroupOrDMByID(message.channel),
    user = slack.getUserByID(message.user),
    time = message.ts,
    text = ( message.text ) ? message.text : "",
    response = '';

  // in some cases may not be able to get user?
  if (!user) { user = channel};

  console.log('Received: %s %s %s %s %s', type, (channel.is_channel ? '#' : '') + channel.name, user.name, time, text);

  var atme = isAtMention(slack.self.id, text);

  if (user.name == 'remindatron') {
    channel.send("thanks @remindatron!");

    if (moment().day() == 6) {
      refreshAndAskHours();
    }
  } else if (type == 'message' && user.name == channel.name)  {
    // direct message if channel and user are the same
    console.log('contacted by: ' + channel.name + ', ' + user.name + ', ' + text);
    var anum = text.match( /\d+/g );
    var timeouttime = moment().subtract(5, 'days');

    if (!currentState[user.name]) {
      console.log("hello new person / memory loss");
      currentState[user.name] = { lastcontact: moment(), confirmed: false, amount: 0};
    }

    var contactIsStale = currentState[user.name].lastcontact.isBefore(timeouttime);
    var contactIsConfirmed = currentState[user.name].confirmed;
    var words = text.trim().split(/\s+/).map(function(x) { return x.toLowerCase(); })
    var amount = (anum && anum.length > 0) ? anum.reduce(function(a,b) { return parseFloat(a) + parseFloat(b)}, 0) : null;

    if ( words.indexOf('uploaded') >=0  ||  words.indexOf('shared') >=0) {
      channel.send("I only understand english, files are for computers.");
    } else if ( text.search('fuck') >=0 ) {
      channel.send("RUDE.");
    } else if ( (words.length < 2 || text.search( /:clock/ ) >=0 ) && text.search( /:.*:/ ) >= 0) {
      // clock emoji are allowed
      channel.send(":bomb:");
    } else if (anum && anum.length > 0) {
      if (amount > 60) {
        channel.send("umm..."+ amount+"? I doubt it!");
      } else if (amount > 20) {
        channel.send("Oh! Most DALI members are limited to 20 hours a week. Are you sure you want me to put down *" + amount + "* hours last week, yes/no?");
        currentState[user.name] = { lastcontact: moment(), confirmed: false, amount: amount}
      } else {
        channel.send("Ok! I'm putting down that you worked *" + amount + "* hours last week, yes/no?");
        currentState[user.name] = { lastcontact: moment(), confirmed: false, amount: amount}
      }
    } else if ( words.indexOf('yes') >=0 || words.indexOf('y') >=0) {
      if (contactIsStale || currentState[user.name].amount === undefined) {
        channel.send("I've forgotten that we were talking, how much should I put down for hours worked?");
      } else {
        spreadsheets.updateWeekHours(user.name, currentState[user.name].amount, currentWeek, currentTerm)
        currentState[user.name].confirmed = true
        channel.send("Okeedokee, thanks!");
      }
    } else if ( words.indexOf('no') >=0 || words.indexOf('n') >=0 ) {
        currentState[user.name].confirmed = false
        channel.send("Ok, so just send me the number please.");
    } else if (words.indexOf('help') >=0 || words.indexOf('halp') >=0 || words.indexOf('help!') >=0 ) {
        channel.send("I can help! Just tell me a number (integer) and I'll put that in for your hours this past week.");
    } else if (words.indexOf('testit') >=0 ) {
        channel.send("testing");
        refreshAndAskHours();
    } else {
      channel.send("What? I only understand numbers or pleas for help.");
      spreadsheets.logUncaught(user.name, text);
    }
  } else if (atme) {
    channel.send("Please direct message me about this matter.");
  } else {
    console.log('ignoring from '+ user.name + ': ' + text);
  }

});

slack.on('error', function(error) {
  console.error('Error: %s', error);
});



//main promise chain, get configs first
refreshConfigs().then(function() {
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



var port = Number(process.env.PORT || 5000);
app.listen(port, function() {
  console.log("Listening on " + port);
});
